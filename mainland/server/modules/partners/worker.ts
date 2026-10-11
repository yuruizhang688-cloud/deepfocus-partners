import { Logger } from '@nestjs/common';
import type { ConsultLead } from '../../../shared/api.interface';
import { ASSETS } from './assets';
interface RuntimeEnv { PUBLIC_SITE_ORIGIN?: string; FEISHU_WEBHOOK_URL?: string; FEISHU_SIGN_SECRET?: string; }
interface Receipt { hash:string;status:string;expires:number; }
interface RuntimeContext { waitUntil(p:Promise<unknown>):void; }
const logger = new Logger('PartnerConsult');
// Public assets are embedded at build time. Secrets only come from runtime env.
const modes={agent:'品牌代理商',first:'品牌一级合伙人',second:'品牌二级合伙人',unsure:'希望先沟通再确定'};
const capacities={unspecified:'暂不填写',team:'已有销售团队',individual:'独立销售 / 有客户资源',starting:'正在探索GEO业务'};
// Bounded per-isolate safeguards; receipts also use the edge cache when available.
// These are not a durable database or a distributed exactly-once guarantee.
const quotas=new Map<string,{count:number;expires:number}>(), inflight=new Map<string,string>(), receipts=new Map<string,Receipt>();
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const reply=(status:number,code:string,message:string,requestId?:string,extra:Record<string,string>={})=>new Response(JSON.stringify({ok:status===200,code,message,requestId}),{status,headers:{...headers,...extra}});
const line=(v:unknown,max:number,required=false)=>typeof v==='string'&&v.trim().length<=max&&(!required||v.trim().length>0)&&!/[\u0000-\u001f\u007f]/.test(v);
export function validateLead(input:unknown):ConsultLead|null{
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const v = input as Record<string,unknown>;
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  if(Object.keys(v).some(k=>!['name','contact','company','city','mode','capacity','message','consent','website','requestId'].includes(k)))return null;
  if(!line(v.name,60,true)||!line(v.contact,80,true)||!line(v.company,100)||!line(v.city,60))return null;
  if(typeof v.mode!=='string'||typeof v.capacity!=='string'||!Object.hasOwn(modes,v.mode)||!Object.hasOwn(capacities,v.capacity)||v.consent!==true||v.website!=='')return null;
  if(typeof v.message!=='string'||v.message.trim().length>1500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v.message))return null;
  if(typeof v.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestId))return null;
  return {name:String(v.name).trim(),contact:String(v.contact).trim(),company:String(v.company).trim(),city:String(v.city).trim(),message:v.message.trim(),mode:v.mode as ConsultLead['mode'],capacity:v.capacity as ConsultLead['capacity'],requestId:v.requestId};
}
export function makeMessage(lead:ConsultLead){
  const lines=[`姓名：${lead.name}`,`手机号或微信：${lead.contact}`,`公司 / 团队：${lead.company||'未填写'}`,`城市：${lead.city||'未填写'}`,`意向合作：${modes[lead.mode]}`,`销售情况：${capacities[lead.capacity]}`,`咨询编号：${lead.requestId}`,`提交时间：${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}（北京时间）`,'合作需求：',lead.message||'未填写'];
  return {msg_type:'post',content:{post:{zh_cn:{title:'【DeepFocus】新的代理合作咨询',content:lines.map(text=>[{tag:'text',text}])}}}};
}
async function digest(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function prune<T extends {expires:number}>(map:Map<string,T>){for(const [k,v] of map)if(v.expires<=Date.now())map.delete(k);}
function quota(ip:string){
  prune(quotas);if(quotas.size>=1000&&!quotas.has(ip))return false;
  const q=quotas.get(ip)||{count:0,expires:Date.now()+600000};if(q.count>=5)return false;
  q.count++;quotas.set(ip,q);return true;
}
async function notify(lead:ConsultLead,env:RuntimeEnv){
  const url=env.FEISHU_WEBHOOK_URL;
  if(typeof url!=='string'||!/^https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/[0-9a-f-]{36}$/i.test(url))return 'unconfigured';
  const payload:ReturnType<typeof makeMessage>&{timestamp?:string;sign?:string}=makeMessage(lead);
  if(env.FEISHU_SIGN_SECRET){
    const timestamp=String(Math.floor(Date.now()/1000));
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(`${timestamp}\n${env.FEISHU_SIGN_SECRET}`),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new Uint8Array()));
    payload.timestamp=timestamp;payload.sign=btoa(String.fromCharCode(...bytes));
  }
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(!r.ok)return 'rejected';const d=await r.json();
    return (d.code??d.StatusCode)===0&&(d.StatusCode===undefined||d.StatusCode===0)?'sent':'rejected';
  }catch(e){logger.warn(JSON.stringify({event:'consult_delivery_error',requestId:lead.requestId,name:String(e instanceof Error?e.name:'Error').slice(0,40)}));return 'unknown';}
}
async function consult(request:Request,env:RuntimeEnv,ctx:RuntimeContext){
  if(request.method!=='POST')return reply(405,'method_not_allowed','仅接受表单提交。',undefined,{Allow:'POST'});
  const origin=env.PUBLIC_SITE_ORIGIN||new URL(request.url).origin;
  if(request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return reply(403,'invalid_origin','请从合作页面提交咨询。');
  if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return reply(415,'invalid_type','提交格式不正确。');
  if(Number(request.headers.get('Content-Length'))>12000)return reply(413,'too_large','内容过长，请精简后提交。');
  let v;
  try{
    const reader=request.body?.getReader();if(!reader)return reply(400,'invalid_json','提交内容不完整。');
    const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000){await reader.cancel();return reply(413,'too_large','内容过长，请精简后提交。');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    v=JSON.parse(new TextDecoder().decode(bytes));
  }catch{return reply(400,'invalid_json','提交内容不完整。');}
  const lead=validateLead(v);if(!lead)return reply(422,'invalid_fields','请检查姓名、联系方式、合作模式与信息使用确认，填写内容已保留。');
  const hash=await digest(JSON.stringify(lead)),id=lead.requestId;prune(receipts);
  let previous=receipts.get(id);const cache:Cache|undefined=undefined;const key=new Request(origin+'/__consult-receipt/'+id);
  if(!previous&&cache){try{const saved=await cache.match(key);if(saved)previous=await saved.json();}catch{}}
  if(previous){if(previous.hash!==hash)return reply(409,'request_conflict','咨询编号已用于其他内容，请重新打开页面填写。',id);if(previous.status==='sent')return reply(200,'sent','合作咨询已提交。',id);return reply(409,'delivery_unknown','暂时无法确认提交结果，填写内容已保留。请勿重复提交，可联系DeepFocus确认。',id);}
  if(inflight.has(id))return reply(409,'in_progress','该咨询正在提交，请勿重复发送。',id);
  if(!quota(request.headers.get('CF-Connecting-IP')||'anonymous'))return reply(429,'rate_limited','提交次数较多，请10分钟后再试。填写内容已保留。',id,{'Retry-After':'600'});
  if(receipts.size>=1000||inflight.size>=5)return reply(503,'busy','当前咨询较多，请稍后再试。填写内容已保留。',id);
  inflight.set(id,hash);
  try{
    const status=await notify(lead,env);logger.log(JSON.stringify({event:'consult_delivery',requestId:id,status}));
    if(status==='sent'||status==='unknown'){
      const receipt={hash,status,expires:Date.now()+3600000};receipts.set(id,receipt);
      if(cache)ctx.waitUntil(cache.put(key,new Response(JSON.stringify(receipt),{headers:{'Cache-Control':'max-age=3600'}})).catch(()=>{}));
    }
    if(status==='sent')return reply(200,'sent','合作咨询已提交。',id);
    if(status==='unknown')return reply(502,'delivery_unknown','暂时无法确认提交结果，填写内容已保留。请勿重复提交，可联系DeepFocus确认。',id);
    if(status==='unconfigured')return reply(503,'unconfigured','咨询暂时无法提交，请稍后再试。填写内容已保留。',id);
    return reply(502,'delivery_rejected','本次咨询未成功提交，填写内容已保留。请稍后再试。',id);
  }finally{inflight.delete(id);}
}
export default {async fetch(request:Request,env:RuntimeEnv,ctx:RuntimeContext){
  const path=new URL(request.url).pathname;
  if(path==='/api/consult'){try{return await consult(request,env,ctx);}catch{logger.error(JSON.stringify({event:'consult_internal_error'}));return reply(500,'internal_error','暂时无法提交，填写内容已保留。请稍后再试。');}}
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const asset=typeof ASSETS!=='undefined'?ASSETS[path==='/index.html'?'/':path]:null;if(!asset)return new Response('Not found',{status:404});
  const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
  const h={'Content-Type':asset.mime,'Cache-Control':path==='/'?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'"};
  return new Response(request.method==='HEAD'?null:bytes,{headers:h});
}};
