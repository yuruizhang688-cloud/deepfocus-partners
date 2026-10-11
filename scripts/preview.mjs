import http from 'node:http';
import {Readable} from 'node:stream';
import worker from '../dist/server/index.js';
const origin='http://127.0.0.1:8770';
let outcome='success';
const originalFetch=globalThis.fetch;
// Local verification deliberately never sends real group messages.
globalThis.fetch=async(input,options)=>{
  if(String(input).startsWith('https://open.feishu.cn/')){
    if(outcome==='unknown')throw new Error('simulated network loss');
    return Response.json({code:outcome==='success'?0:19024});
  }
  return originalFetch(input,options);
};
http.createServer(async(req,res)=>{
  try{
    if(req.url==='/__preview/outcome'&&req.method==='POST'){
      const chunks=[];for await(const c of req)chunks.push(c);const next=Buffer.concat(chunks).toString();
      if(!['success','rejected','unknown'].includes(next)){res.writeHead(400);res.end();return;}
      outcome=next;res.writeHead(204);res.end();return;
    }
    const method=req.method||'GET';const chunks=[];if(!['GET','HEAD'].includes(method))for await(const c of req)chunks.push(c);
    const request=new Request(origin+req.url,{method,headers:{...req.headers,'CF-Connecting-IP':'local-preview'},...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,{PUBLIC_SITE_ORIGIN:origin,FEISHU_WEBHOOK_URL:'https://open.feishu.cn/open-apis/bot/v2/hook/11111111-1111-4111-8111-111111111111'},{waitUntil:p=>p.catch(()=>{})});
    res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
  }catch{res.writeHead(500);res.end('Preview error');}
}).listen(8770,'127.0.0.1',()=>console.log('Mock-notification preview: '+origin));
