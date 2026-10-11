import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {validateLead,makeMessage} from '../worker/index.js';
const origin='https://partners.example.test';
const env={PUBLIC_SITE_ORIGIN:origin,FEISHU_WEBHOOK_URL:'https://open.feishu.cn/open-apis/bot/v2/hook/11111111-1111-4111-8111-111111111111'};
const ctx={waitUntil:p=>p};
const valid=()=>({name:'测试合作者',contact:'测试微信',company:'测试公司',city:'测试城市',mode:'first',capacity:'team',message:'测试咨询\n第二行',consent:true,website:'',requestId:crypto.randomUUID()});
const req=(body,options={})=>new Request(origin+'/api/consult',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':crypto.randomUUID(),...options.headers},body:typeof body==='string'?body:JSON.stringify(body)});
test('required fields, consent, control characters, enums and honeypot are validated',()=>{
  assert.ok(validateLead(valid()));
  for(const fields of [{name:' '},{contact:''},{mode:'invalid'},{mode:'__proto__'},{consent:false},{website:'bot'},{city:'a\nb'},{message:'a'.repeat(1501)},{requestId:'bad'},{unexpected:1}])assert.equal(validateLead({...valid(),...fields}),null);
});
test('user input remains plain Feishu text, not @ or card instructions',()=>{
  const input=valid();input.message='<at user_id="all">all</at>';
  const message=makeMessage(validateLead(input));
  assert.equal(message.msg_type,'post');
  assert.equal(message.content.post.zh_cn.title,'【DeepFocus】新的代理合作咨询');
  assert.ok(message.content.post.zh_cn.content.every(row=>row.every(item=>item.tag==='text')));
  assert.ok(JSON.stringify(message).includes(input.requestId));
});
test('rejects wrong origin, methods, content type, invalid JSON and oversized bodies without sending',async()=>{
  const original=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;return Response.json({code:0});};
  try{
    assert.equal((await worker.fetch(req(valid(),{headers:{Origin:'https://other.example'}}),env,ctx)).status,403);
    assert.equal((await worker.fetch(new Request(origin+'/api/consult'),env,ctx)).status,405);
    assert.equal((await worker.fetch(req(valid(),{headers:{'Content-Type':'text/plain'}}),env,ctx)).status,415);
    assert.equal((await worker.fetch(req('{'),env,ctx)).status,400);
    assert.equal((await worker.fetch(req('a'.repeat(12001)),env,ctx)).status,413);
    assert.equal((await worker.fetch(req({...valid(),consent:false}),env,ctx)).status,422);
    assert.equal(sends,0);
  }finally{globalThis.fetch=original;}
});
test('only Feishu business success confirms delivery; duplicate and changed-body IDs are handled',async()=>{
  const original=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;return Response.json({code:0});};
  try{
    const lead=valid();const r=await worker.fetch(req(lead),env,ctx);assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
    assert.equal((await worker.fetch(req(lead),env,ctx)).status,200);assert.equal(sends,1);
    assert.equal((await worker.fetch(req({...lead,name:'其他名字'}),env,ctx)).status,409);
    globalThis.fetch=async()=>Response.json({code:19024});
    const rejected=await worker.fetch(req(valid()),env,ctx);assert.equal(rejected.status,502);assert.equal((await rejected.json()).ok,false);
    globalThis.fetch=async()=>Response.json({});assert.equal((await worker.fetch(req(valid()),env,ctx)).status,502);
    globalThis.fetch=async()=>Response.json({code:0,StatusCode:1});assert.equal((await worker.fetch(req(valid()),env,ctx)).status,502);
  }finally{globalThis.fetch=original;}
});
test('uses edge-compatible manual redirect and rejects redirects without forwarding the lead',async()=>{
  const original=globalThis.fetch;let sends=0;
  globalThis.fetch=async(url,options)=>{sends++;assert.equal(options.redirect,'manual');assert.equal(options.method,'POST');return new Response(null,{status:307,headers:{Location:'https://other.example/'}});};
  try{const r=await worker.fetch(req(valid()),env,ctx);assert.equal(r.status,502);assert.equal((await r.json()).code,'delivery_rejected');assert.equal(sends,1);}finally{globalThis.fetch=original;}
});
test('unknown network result does not automatically resend on repeated ID',async()=>{
  const original=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;throw new Error('simulated timeout');};
  try{const lead=valid();assert.equal((await worker.fetch(req(lead),env,ctx)).status,502);const duplicate=await worker.fetch(req(lead),env,ctx);assert.equal(duplicate.status,409);assert.equal((await duplicate.json()).code,'delivery_unknown');assert.equal(sends,1);}finally{globalThis.fetch=original;}
});
test('unconfigured webhook fails honestly and an IP burst returns Retry-After',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({code:0});
  try{
    assert.equal((await worker.fetch(req(valid()),{},ctx)).status,503);
    const ip=crypto.randomUUID();for(let i=0;i<5;i++)assert.equal((await worker.fetch(req(valid(),{headers:{'CF-Connecting-IP':ip}}),env,ctx)).status,200);
    const r=await worker.fetch(req(valid(),{headers:{'CF-Connecting-IP':ip}}),env,ctx);assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'600');
  }finally{globalThis.fetch=original;}
});
