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
