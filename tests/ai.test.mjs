import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEndpoint,normalizeAIConfig,normalizeProfile,parseAIResult,extractModelText,attachAIKnowledge,recognizeLocal,requestAI } from '../dist/ai.js';
import { createInitialState,validateState } from '../dist/model.js';
import { handleAIRequest,buildUpstreamRequest,OCR_SYSTEM,SOLVE_SYSTEM } from '../server/gateway.js';

const profile={id:'p1',provider:'custom',label:'测试助教',protocol:'openai',baseUrl:'https://api.example.com/v1',model:'test-model',vision:true,timeout:15};
const fakeKey='test-key-not-a-real-credential';
const photo='data:image/png;base64,aGVsbG8=';
const solution={title:'解一元一次方程',subject:'数学',type:'解答题',answer:'x = 3',analysis:'1. 两边同时减去 2。\n2. 得 x = 3，代回验证。',reason:'计算失误',knowledgePoints:[{name:'一元一次方程',explanation:'用等式的性质求未知数。',prerequisites:[]}]};
function request(body={},headers={}){return new Request('https://desk.example.com/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://desk.example.com',...headers},body:JSON.stringify({profile,apiKey:fakeKey,task:'solve',content:'解方程 x + 2 = 5',...body})});}
const upstreamJSON=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});

test('configuration strips credentials and normalizes known endpoint suffixes',()=>{
 const result=normalizeAIConfig({profiles:[{...profile,apiKey:fakeKey}],apiKey:fakeKey,solveProfileId:'p1'});
 assert.ok(!JSON.stringify(result).includes(fakeKey));assert.equal(result.solveProfileId,'p1');
 assert.equal(normalizeEndpoint('https://api.example.com/v1/chat/completions'),'https://api.example.com/v1');
 assert.equal(normalizeEndpoint('https://api.example.com/v1/messages'),'https://api.example.com/v1');
 assert.throws(()=>normalizeProfile({...profile,model:''}),/模型名称/);
});
test('API URLs reject localhost, IP aliases, credentials, redirects encoded in query, and non-HTTPS',()=>{
 for(const baseUrl of ['http://api.example.com/v1','https://127.0.0.1','https://2130706433','https://[::1]','https://localhost','https://admin:secret@api.example.com','https://api.example.com/v1?redirect=https://evil.example','https://127.0.0.1.nip.io','https://api.internal','https://api.example.com:8443'])assert.throws(()=>normalizeEndpoint(baseUrl),baseUrl);
});
test('model text and structured responses support both protocols without executing markup',()=>{
 assert.equal(extractModelText({choices:[{message:{content:'<think>private scratch</think>\n```json\n'+JSON.stringify(solution)+'\n```'}}]}).includes('private scratch'),false);
 const result=parseAIResult('说明：\n'+JSON.stringify({...solution,title:'<img src=x onerror=alert(1)>'}));assert.equal(result.answer,'x = 3');assert.match(result.title,/<img/); // UI must escape these plain text fields.
 assert.equal(extractModelText({content:[{type:'text',text:'hello'},{type:'thinking',thinking:'ignored'}]},'anthropic'),'hello');
 assert.throws(()=>parseAIResult('{"answer":"3"}'),/缺少/);assert.throws(()=>parseAIResult('not JSON'),/结构化/);
 assert.equal(parseAIResult('{"text":"原题 x + 2 = 5"}','ocr').text,'原题 x + 2 = 5');
});
test('AI knowledge linking deduplicates existing nodes and rejects cyclic additions atomically',()=>{
 const s=createInitialState(false),before=JSON.stringify(s.knowledge);
 const result=attachAIKnowledge(s,solution.knowledgePoints,'数学');assert.equal(result.knowledge.length,s.knowledge.length);assert.equal(result.ids[0],'math-equation');assert.equal(JSON.stringify(s.knowledge),before);
 assert.throws(()=>attachAIKnowledge(s,[{name:'新知识 A',explanation:'',prerequisites:['新知识 B']},{name:'新知识 B',explanation:'',prerequisites:['新知识 A']}],'数学'),/循环/);
 assert.equal(JSON.stringify(s.knowledge),before);
});
test('backup restores old records and only whitelists AI/OCR provenance, never keys',()=>{
 const s=createInitialState();s.records[0].aiSource={model:'m',provider:'custom',label:'助教',generatedAt:'2026-11-15T00:00:00Z',reviewed:true,apiKey:fakeKey};s.records[0].ocrSource={engine:'local',confidence:95,apiKey:fakeKey};
 const clean=validateState(s);assert.equal(clean.records[0].aiSource.model,'m');assert.ok(!JSON.stringify(clean).includes(fakeKey));
 delete s.records[0].aiSource;delete s.records[0].ocrSource;assert.doesNotThrow(()=>validateState(s));
});
test('local OCR returns recognized text and always terminates its worker',async()=>{
 let terminated=0;const progress=[];
 const engine={createWorker:async(language,oem,opts)=>{assert.equal(language,'chi_sim+eng');assert.equal(oem,1);opts.logger({status:'recognizing text',progress:.7});return {recognize:async()=>({data:{text:' x + 2 = 5\n',confidence:96}}),terminate:async()=>{terminated++;}};}};
 const result=await recognizeLocal(photo,'chi_sim+eng',{engine,onProgress:p=>progress.push(p)});assert.equal(result.text,'x + 2 = 5');assert.equal(result.confidence,96);assert.equal(terminated,1);assert.equal(progress[0].progress,.7);
});
test('cancelling OCR initialization terminates a worker that arrives late',async()=>{
 let resolveWorker,terminated=0;const controller=new AbortController();
 const result=recognizeLocal(photo,'eng',{signal:controller.signal,engine:{createWorker:()=>new Promise(resolve=>{resolveWorker=resolve;})}});
 await new Promise(resolve=>setTimeout(resolve,0));controller.abort();await assert.rejects(result,e=>e.name==='AbortError');resolveWorker({terminate:async()=>{terminated++;}});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(terminated,1);
});
test('gateway handles real request shapes and forwards no visitor identity headers',async()=>{
 let call;
 const response=await handleAIRequest(request({}, {'oai-authenticated-user-email':'private@example.com','OAI-Sites-Authorization':'secret-visitor-token'}),{fetchImpl:async(url,init)=>{call={url,init};return upstreamJSON({choices:[{message:{content:JSON.stringify(solution)}}],usage:{prompt_tokens:20,completion_tokens:30}});}});
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.result.answer,'x = 3');assert.equal(data.usage.input_tokens,20);
 assert.equal(call.url,'https://api.example.com/v1/chat/completions');assert.equal(call.init.redirect,'manual');assert.equal(call.init.headers.Authorization,`Bearer ${fakeKey}`);assert.equal(call.init.headers['oai-authenticated-user-email'],undefined);assert.equal(call.init.headers['OAI-Sites-Authorization'],undefined);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.ok(!JSON.stringify(data).includes(fakeKey));
});
test('vision request supports OpenAI image_url and Anthropic base64 source',()=>{
 const a=buildUpstreamRequest(profile,fakeKey,'ocr',{photo});assert.equal(JSON.parse(a.init.body).messages[1].content[1].image_url.url,photo);
 const b=buildUpstreamRequest({...profile,protocol:'anthropic'},fakeKey,'ocr',{photo});const input=JSON.parse(b.init.body);assert.equal(input.messages[0].content[0].source.media_type,'image/png');assert.equal(b.init.headers['x-api-key'],fakeKey);assert.equal(b.url,'https://api.example.com/v1/messages');
});
test('gateway model list and Anthropic structured answer are normalized',async()=>{
 let response=await handleAIRequest(request({task:'models',profile:{...profile,model:''}}),{fetchImpl:async()=>upstreamJSON({data:[{id:'a'},{id:'b'}]})});assert.deepEqual((await response.json()).models,['a','b']);
 response=await handleAIRequest(request({profile:{...profile,protocol:'anthropic'}}),{fetchImpl:async()=>upstreamJSON({content:[{type:'text',text:JSON.stringify(solution)}]})});assert.equal((await response.json()).result.answer,'x = 3');
});
test('gateway rejects cross-origin, invalid media and malformed input before calling provider',async()=>{
 let called=0;const fetchImpl=async()=>{called++;return upstreamJSON({});};
 for(const req of [request({}, {Origin:'https://evil.example.com'}),request({task:'ocr',photo:'data:image/svg+xml,<svg/>'}),request({profile:{...profile,baseUrl:'https://127.0.0.1'}}),request({apiKey:''}),request({content:''}),request({task:'ocr',photo,profile:{...profile,vision:false}})]){const response=await handleAIRequest(req,{fetchImpl});assert.ok(response.status>=400);}
 assert.equal(called,0);
});
test('provider failures cannot reflect a key or raw provider HTML into the UI',async()=>{
 for(const status of [302,401,403,404,429,500]){
  const response=await handleAIRequest(request(),{fetchImpl:async()=>new Response(`<script>${fakeKey}</script>`,{status})});assert.ok(response.status>=400);const value=await response.text();assert.ok(!value.includes(fakeKey));assert.ok(!value.includes('<script>'));
 }
});
test('invalid model output never produces a successful solution response',async()=>{
 const response=await handleAIRequest(request(),{fetchImpl:async()=>upstreamJSON({choices:[{message:{content:'not structured'}}]})});assert.equal(response.status,502);assert.match((await response.json()).error,/模型/);
});
test('client allows model discovery before choosing a model and surfaces gateway errors',async()=>{
 const fake=async(url,init)=>{assert.equal(url,'/api/ai');assert.equal(JSON.parse(init.body).profile.model,'models');return upstreamJSON({models:['m']});};
 assert.deepEqual((await requestAI({...profile,model:''},fakeKey,'models',{},undefined,fake)).models,['m']);
 await assert.rejects(requestAI(profile,fakeKey,'test',{},undefined,async()=>new Response('{"error":"额度不足"}',{status:429})),/额度/);
});
test('biology and Chinese classifications survive OCR and AI result normalization',()=>{
 for(const subject of ['生物','语文']){
  assert.equal(parseAIResult(JSON.stringify({...solution,subject})).subject,subject);
  assert.equal(parseAIResult(JSON.stringify({text:'该学科的原题内容',subject}),'ocr').subject,subject);
  assert.ok(OCR_SYSTEM.includes(subject));assert.ok(SOLVE_SYSTEM.includes(subject));
 }
});
