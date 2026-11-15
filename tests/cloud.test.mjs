import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalCloud } from '../server/local-cloud.mjs';
import { archiveFromChatGPT,getEntity,writeEntity,allEntities,downloadChatGPTPhoto } from '../server/cloud-store.js';
import { handleCloudRequest } from '../server/cloud-routes.js';
import { handleMCP,MCP_TOOLS } from '../server/mcp.js';
import { validateState,createInitialState } from '../dist/model.js';

const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=','base64'));
const photo={download_url:'https://files.oaiusercontent.com/test-photo?signature=private',file_id:'file-test-capture',mime_type:'image/png',file_name:'题目照片.png'};
const mistake={title:'细胞膜的功能',content:'细胞膜的主要功能是什么？',subject:'生物',answer:'控制物质进出细胞。',analysis:'细胞膜具有选择透过性，调节物质进出。照片未提供学生原始错解，因此错因待核对。',reason:null,knowledgePoints:[{name:'细胞的结构与功能',explanation:'细胞膜控制物质进出。',prerequisites:[]}]};
const fetchPhoto=async()=>new Response(png,{headers:{'Content-Type':'image/png'}});
const req=(path,body,origin='https://desk.example.com')=>new Request(origin+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',Origin:origin}:{},...(body?{body:JSON.stringify(body)}:{})});

test('ChatGPT capture persists original photo, structured question and review date without inventing a reason',async()=>{
 const env=createLocalCloud({memory:true});try{
  const result=await archiveFromChatGPT(env,{photo,mistakes:[mistake]},{fetchImpl:fetchPhoto});
  assert.equal(result.records.length,1);assert.equal(result.duplicateCount,0);assert.equal(result.photoSaved,true);
  const record=result.records[0];assert.equal(record.subject,'生物');assert.equal(record.reason,null);assert.equal(record.captureSource.needsReview,true);assert.equal(record.aiSource.reviewed,false);assert.equal(record.status,'new');assert.equal(record.stage,0);assert.ok(record.nextReview);
  assert.ok(record.photo.startsWith('/api/files/photo-'));assert.ok(!JSON.stringify(record).includes('signature=private'));
  const saved=await getEntity(env,'records',record.id);assert.equal(saved.payload.answer,mistake.answer);
  const response=await handleCloudRequest(req(record.photo),env);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),png);
  const state=createInitialState(false);state.records=[record];assert.equal(validateState(state).records[0].photo,record.photo);
 }finally{env.close();}
});
test('retries do not duplicate questions and work even when the old download URL has expired',async()=>{
 const env=createLocalCloud({memory:true});try{
  const first=await archiveFromChatGPT(env,{photo,mistakes:[mistake]},{fetchImpl:fetchPhoto});
  const second=await archiveFromChatGPT(env,{photo:{...photo,download_url:'expired'},mistakes:[mistake]},{fetchImpl:()=>{throw new Error('must not fetch again');}});
  assert.equal(second.duplicateCount,1);assert.equal(second.records[0].id,first.records[0].id);assert.equal((await allEntities(env,'records')).length,1);
 }finally{env.close();}
});
test('one photo can archive multiple subjects, reusing its private original photo',async()=>{
 const env=createLocalCloud({memory:true});try{
  const literature={...mistake,title:'判断比喻',content:'弯弯的月亮像小船用了什么修辞？',subject:'语文',wrong:'拟人。',answer:'比喻。',analysis:'把月亮比作小船。',reason:'概念不清',knowledgePoints:[{name:'修辞手法',explanation:'结合不同类事物的相似点识别比喻。'}]};
  const result=await archiveFromChatGPT(env,{photo,mistakes:[mistake,literature]},{fetchImpl:fetchPhoto});assert.equal(result.records.length,2);assert.equal(result.records[0].photo,result.records[1].photo);assert.equal(result.records[1].subject,'语文');assert.equal(result.records[1].reason,'概念不清');
 }finally{env.close();}
});
test('untrusted download destinations and invalid captures are rejected without creating questions',async()=>{
 const env=createLocalCloud({memory:true});let calls=0;const options={fetchImpl:async()=>{calls++;return new Response(png);}};try{
  await assert.rejects(downloadChatGPTPhoto(env,{...photo,download_url:'http://127.0.0.1/secret'},options),/ChatGPT/);assert.equal(calls,0);
  await assert.rejects(archiveFromChatGPT(env,{photo,mistakes:[{...mistake,answer:''}]},options),/答案/);assert.equal(calls,0);assert.equal((await allEntities(env,'records')).length,0);
  await assert.rejects(downloadChatGPTPhoto(env,photo,{fetchImpl:async()=>new Response('',{status:302,headers:{Location:'https://evil.example.com/photo'}})}),/ChatGPT/);
 }finally{env.close();}
});
test('optimistic revisions prevent stale devices from overwriting a newer cloud record',async()=>{
 const env=createLocalCloud({memory:true});try{
  let result=await writeEntity(env,{kind:'records',id:'safe-id',payload:{answer:'first'}});assert.equal(result.accepted,true);assert.equal(result.entity.revision,1);
  result=await writeEntity(env,{kind:'records',id:'safe-id',payload:{answer:'second'},baseRevision:1});assert.equal(result.entity.revision,2);
  const stale=await writeEntity(env,{kind:'records',id:'safe-id',payload:{answer:'stale'},baseRevision:1});assert.equal(stale.accepted,false);assert.equal(stale.entity.payload.answer,'second');
  const deleted=await writeEntity(env,{kind:'records',id:'safe-id',deleted:true,baseRevision:2});assert.equal(deleted.entity.deleted,true);
 }finally{env.close();}
});
test('cloud sync validates payloads, stores photos separately and excludes demo data',async()=>{
 const env=createLocalCloud({memory:true});try{
  const state=createInitialState(true),record={...state.records[0],id:'real-question',demo:false,photo:'data:image/png;base64,'+Buffer.from(png).toString('base64')};
  let response=await handleCloudRequest(req('/api/cloud/sync',{changes:[{kind:'records',id:record.id,payload:record,baseRevision:0}]}),env);assert.equal(response.status,200);const saved=(await response.json()).results[0];assert.equal(saved.accepted,true);assert.ok(saved.entity.payload.photo.startsWith('/api/files/'));
  response=await handleCloudRequest(req('/api/cloud/entities?kind=records&offset=0'),env);assert.equal((await response.json()).entities.length,1);
  response=await handleCloudRequest(req('/api/cloud/sync',{changes:[{kind:'records',id:'demo',payload:state.records[0],baseRevision:0}]}),env);assert.equal(response.status,400);
 }finally{env.close();}
});
test('MCP discovery exposes authorized photo file parameters and supports read-only readiness checks',async()=>{
 const env=createLocalCloud({memory:true});try{
  let response=await handleMCP(req('/mcp',{jsonrpc:'2.0',id:1,method:'server/discover'}),env);assert.deepEqual((await response.json()).result.supportedVersions,['2026-07-28']);
  response=await handleMCP(req('/mcp',{jsonrpc:'2.0',id:2,method:'tools/list'}),env);const tools=(await response.json()).result.tools;assert.equal(tools.length,4);const tool=tools.find(t=>t.name==='archive_mistakes');assert.deepEqual(tool._meta['openai/fileParams'],['photo']);assert.deepEqual(Object.keys(tool.inputSchema.properties.photo.properties),['download_url','file_id','mime_type','file_name']);assert.equal(tool.annotations.destructiveHint,false);
  response=await handleMCP(req('/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_capture_status',arguments:{}}}),env);const status=JSON.parse((await response.json()).result.content[0].text);assert.equal(status.ready,true);assert.equal(status.archived_count,0);
  response=await handleMCP(req('/mcp',{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'archive_mistakes',arguments:{photo,mistakes:[mistake]}}}),env,{fetchImpl:fetchPhoto});const archived=JSON.parse((await response.json()).result.content[0].text);assert.equal(archived.photo_saved,true);assert.equal(archived.archived_count,1);
 }finally{env.close();}
});
test('permanent deletion removes an original photo only after its last question reference is gone',async()=>{
 const env=createLocalCloud({memory:true});try{
  const capture=await archiveFromChatGPT(env,{photo,mistakes:[mistake,{...mistake,title:'同图第二题'}]},{fetchImpl:fetchPhoto});
  for(let i=0;i<2;i++){
   const record=capture.records[i],entity=await getEntity(env,'records',record.id);
   const response=await handleCloudRequest(req('/api/cloud/sync',{changes:[{kind:'records',id:record.id,baseRevision:entity.revision,deleted:true}]}),env);assert.equal(response.status,200);
   assert.equal((await handleCloudRequest(req(record.photo),env)).status,i===0?200:404);
  }
 }finally{env.close();}
});
