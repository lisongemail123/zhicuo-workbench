import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server/dev.mjs';
import { createLocalCloud } from '../server/local-cloud.mjs';

test('Node server serves application modules and the AI gateway without exposing generated server code',async()=>{
 const cloud=createLocalCloud({memory:true}),server=createAppServer({cloudEnv:cloud});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  let response=await fetch(origin);assert.equal(response.status,200);assert.match(await response.text(),/ai\.css/);
  response=await fetch(origin+'/ai.js');assert.match(response.headers.get('content-type'),/javascript/);assert.match(await response.text(),/recognizeLocal/);
  response=await fetch(origin+'/api/health');assert.equal((await response.json()).ai,true);
  response=await fetch(origin+'/api/ai');assert.equal(response.status,405);
  response=await fetch(origin+'/api/auth/me',{headers:{'oai-authenticated-user-id':'forged-owner','oai-authenticated-user-email':'owner@example.com'}});assert.equal((await response.json()).authenticated,false);
  response=await fetch(origin+'/server/index.js');assert.equal(response.status,404);
  let registered=await fetch(origin+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({username:'server-test',password:'server test password 123'})});assert.equal(registered.status,201);const cookie=registered.headers.get('set-cookie').split(';')[0];
  response=await fetch(origin+'/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify({task:'solve',profile:{model:'m',baseUrl:'https://api.example.com/v1'},content:'x=3',apiKey:''})});assert.equal(response.status,400);assert.match((await response.json()).error,/API Key/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));cloud.close();}
});
