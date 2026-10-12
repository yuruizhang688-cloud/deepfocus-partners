import test from 'node:test';
import assert from 'node:assert/strict';
import compiled from '../dist/server/modules/partners/partners.controller.js';
import workerModule from '../dist/server/modules/partners/worker.js';
const {PartnersController}=compiled;
const worker=workerModule.default;
test('clears the request body before platform traces while preserving the notification payload',async()=>{
  const lead={name:'测试',contact:'仅本机测试',requestId:crypto.randomUUID()};
  const req={body:lead,protocol:'https',get:key=>({host:'public.example',origin:'https://public.example','content-type':'application/json'}[key]),ip:'local',socket:{remoteAddress:'local'}};
  const res={setHeader(){},status(status){this.code=status;return this;},send(body){this.body=body;}};
  const original=worker.fetch;
  worker.fetch=async request=>{assert.equal(req.body,undefined);assert.deepEqual(await request.json(),lead);return Response.json({ok:true,code:'sent'});};
  try{await new PartnersController().consult(req,res,lead);assert.equal(req.body,undefined);assert.equal(res.code,200);assert.equal(JSON.parse(res.body).code,'sent');}finally{worker.fetch=original;}
});

const pagesOrigin='https://yuruizhang688-cloud.github.io';
const request=(origin,extra={})=>({body:{name:'测试'},protocol:'https',get:key=>({host:'public.example',origin,'content-type':'application/json',...extra}[key]),ip:crypto.randomUUID(),socket:{remoteAddress:'local'}});
const response=()=>({headers:{},setHeader(key,value){this.headers[key.toLowerCase()]=value;},status(status){this.code=status;return this;},send(body){this.body=body;},json(body){this.body=body;},end(){}});
test('Pages preflight allows only the exact origin, POST and JSON header without credentials',()=>{
  const c=new PartnersController();
  const res=response();c.preflight(request(pagesOrigin,{'access-control-request-method':'POST','access-control-request-headers':'content-type'}),res);
  assert.equal(res.code,204);assert.equal(res.headers['access-control-allow-origin'],pagesOrigin);
  assert.equal(res.headers['access-control-allow-credentials'],undefined);
  for(const [origin,extra] of [['https://other.github.io',{}],['null',{}],[pagesOrigin,{'access-control-request-method':'DELETE'}],[pagesOrigin,{'access-control-request-method':'POST','access-control-request-headers':'authorization'}]]) {
    const denied=response();c.preflight(request(origin,extra),denied);assert.equal(denied.code,403);
  }
});
test('Pages submission rejects other origins before forwarding, and redacts the accepted body',async()=>{
  const c=new PartnersController(),original=worker.fetch;let calls=0;
  worker.fetch=async(req,env)=>{calls++;assert.equal(env.PUBLIC_CROSS_SITE_ORIGIN,pagesOrigin);assert.equal(req.headers.get('origin'),pagesOrigin);return Response.json({ok:true});};
  try{
    const deniedReq=request('https://other.github.io'),denied=response();await c.pagesConsult(deniedReq,denied,deniedReq.body);
    assert.equal(denied.code,403);assert.equal(calls,0);assert.equal(deniedReq.body,undefined);assert.equal(denied.headers['access-control-allow-origin'],undefined);
    const acceptedReq=request(pagesOrigin),accepted=response();await c.pagesConsult(acceptedReq,accepted,acceptedReq.body);
    assert.equal(acceptedReq.body,undefined);assert.equal(calls,1);assert.equal(accepted.code,200);assert.equal(accepted.headers['access-control-allow-origin'],pagesOrigin);
  }finally{worker.fetch=original;}
});
