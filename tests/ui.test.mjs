import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM,VirtualConsole } from 'jsdom';
import { AI_CONFIG_KEY,AI_SESSION_KEY } from '../dist/ai.js';
import { STORAGE_KEY,createInitialState,addDays,today } from '../dist/model.js';
import { handleAIRequest } from '../server/gateway.js';
import { handleCloudRequest } from '../server/cloud-routes.js';
import { createLocalCloud } from '../server/local-cloud.mjs';
import { archiveFromChatGPT,getEntity,writeEntity,allEntities } from '../server/cloud-store.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const html=await readFile(path.join(root,'dist/index.html'),'utf8');
const bundle=await build({entryPoints:[path.join(root,'dist/app.js')],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',define:{'import.meta.url':JSON.stringify('https://desk.example.com/ai.js')},plugins:[{name:'test-only-inspection',setup(b){b.onLoad({filter:/\/dist\/app\.js$/},async({path:p})=>({loader:'js',contents:await readFile(p,'utf8')+'\nglobalThis.__qa={get state(){return state},get draft(){return draft},go,openRecord,actions,ai,cloud};'}));}}]});
const base={id:'test-profile',provider:'custom',protocol:'openai',baseUrl:'https://api.example.com/v1',model:'test-model',label:'测试助教',vision:true,timeout:15};
const fakeKey='test-key-for-ui-only';
const answer={title:'解一元一次方程',subject:'数学',answer:'x = 3',analysis:'1. 两边减去 2。\n2. 得到 x = 3。',reason:'计算失误',knowledgePoints:[{name:'一元一次方程',explanation:'运用等式的性质。',prerequisites:[]}]};
const upstream=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const solution=()=>upstream({choices:[{message:{content:JSON.stringify(answer)}}]});
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await tick();}throw new Error('Timed out waiting for UI state');}
function setup({configured=true,demo=false,initialState=null,cloudEnv=null,providerFetch=async()=>solution()}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://desk.example.com/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,doc=w.document;
 Object.assign(w,{structuredClone,AbortController,Request,Response,TextEncoder,TextDecoder});w.scrollTo=()=>{};w.print=()=>{};
 Object.defineProperty(w.crypto,'subtle',{value:globalThis.crypto.subtle});
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.localStorage.setItem(STORAGE_KEY,JSON.stringify(initialState||createInitialState(demo)));
 if(configured){w.localStorage.setItem(AI_CONFIG_KEY,JSON.stringify({profiles:[base],solveProfileId:base.id,ocrProfileId:base.id,autoOcr:false}));w.sessionStorage.setItem(AI_SESSION_KEY,JSON.stringify({[base.id]:{apiKey:fakeKey,endpoint:`openai:${base.baseUrl}`}}));}
 w.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:'解方程 x + 2 = 5。',confidence:94}}),terminate:async()=>{}})};
 w.fetch=async(url,init)=>{const request=new Request(`https://desk.example.com${url}`,{...init,headers:{...init.headers,Origin:'https://desk.example.com'}});return cloudEnv&&(url.startsWith('/api/cloud/')||url.startsWith('/api/files/'))?handleCloudRequest(request,cloudEnv):handleAIRequest(request,{fetchImpl:providerFetch});};
 w.eval(bundle.outputFiles[0].text);
 const qa=w.__qa;
 const click=s=>{const el=doc.querySelector(s);assert.ok(el,`Missing ${s}`);el.click();};
 const fill=(s,value)=>{const el=doc.querySelector(s);assert.ok(el,`Missing ${s}`);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const change=(s,value)=>{const el=doc.querySelector(s);assert.ok(el,`Missing ${s}`);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
 const submit=s=>{const el=doc.querySelector(s);assert.ok(el,`Missing ${s}`);el.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 return {w,doc,qa,click,fill,change,submit,errors,close:()=>dom.window.close()};
}

test('model settings save profiles separately from keys and discover models before selection',async()=>{
 const app=setup({configured:false,providerFetch:async(url)=>url.endsWith('/models')?upstream({data:[{id:'vision-test'},{id:'text-test'}]}):solution()});
 try{
  app.qa.go('ai');app.click('[data-ai="add"]');app.change('[name="provider"]','custom');app.fill('[name="baseUrl"]',base.baseUrl);app.fill('[name="apiKey"]',fakeKey);app.fill('[name="label"]','自己的视觉模型');app.change('[name="vision"]',true);
  app.click('[data-ai="models"]');await until(()=>app.doc.querySelector('#ai-model-options')?.children.length===2);assert.equal(app.doc.querySelector('[name="model"]').value,'vision-test');
  app.submit('#ai-profile-form');const config=JSON.parse(app.w.localStorage.getItem(AI_CONFIG_KEY));assert.equal(config.profiles.length,1);assert.ok(!JSON.stringify(config).includes(fakeKey));assert.ok(app.w.sessionStorage.getItem(AI_SESSION_KEY).includes(fakeKey));assert.ok(!app.w.localStorage.getItem(STORAGE_KEY).includes(fakeKey));
  app.change('[data-ai-setting="ocrEngine"]','vision');assert.ok(app.doc.querySelector('[data-ai-setting="ocrProfileId"]'));
  app.click('[data-ai="test-saved"]');await until(()=>app.doc.querySelector('.ai-connection-state')?.textContent==='连接成功');
  app.click('[data-ai="clear-keys"]');assert.equal(app.w.sessionStorage.getItem(AI_SESSION_KEY),'{}');assert.match(app.doc.querySelector('.ai-profile').textContent,/未填写密钥/);assert.deepEqual(app.errors,[]);
 }finally{app.close();}
});
test('OCR and solution preview apply only after adoption and persist provenance without changing mastery',async()=>{
 const app=setup();
 try{
  app.click('[data-action="new"]');app.qa.draft.photo='data:image/png;base64,aGVsbG8=';app.click('[data-ai="pipeline"]');
  await until(()=>app.doc.querySelector('#ai-result-form'));
  assert.equal(app.qa.draft.content,'');assert.equal(app.qa.draft.answer,'');assert.match(app.doc.querySelector('[name="content"]').value,/x \+ 2/);
  app.fill('[name="analysis"]','已核对：等式两边减去 2，得到 x = 3。');app.submit('#ai-result-form');
  assert.equal(app.qa.draft.answer,'x = 3');assert.equal(app.qa.draft.aiSource.model,'test-model');assert.equal(app.qa.draft.ocrSource.engine,'local');assert.equal(app.qa.draft.analysis,'已核对：等式两边减去 2，得到 x = 3。');
  app.submit('#intake-form');app.submit('#intake-form');app.submit('#intake-form');
  const record=app.qa.state.records[0];assert.equal(record.status,'new');assert.equal(record.stage,0);assert.equal(record.nextReview,addDays(today(),1));assert.equal(record.aiSource.reviewed,true);assert.equal(record.ocrSource.confidence,94);assert.ok(!app.w.localStorage.getItem(STORAGE_KEY).includes(fakeKey));
  app.qa.openRecord(record.id);assert.match(app.doc.querySelector('.ai-source-badge').textContent,/test-model/);assert.deepEqual(app.errors,[]);
 }finally{app.close();}
});
test('AI can update an existing question while retaining review stage, schedule and historical logs',async()=>{
 const app=setup({demo:true});
 try{
  const before=structuredClone(app.qa.state.records[0]),logs=app.qa.state.logs.length;
  app.qa.openRecord(before.id);app.click('#dialog [data-ai="solve"]');await until(()=>app.doc.querySelector('#ai-result-form'));app.submit('#ai-result-form');
  const record=app.qa.state.records.find(r=>r.id===before.id);assert.equal(record.status,before.status);assert.equal(record.stage,before.stage);assert.equal(record.nextReview,before.nextReview);assert.equal(app.qa.state.logs.length,logs);assert.equal(record.answer,'x = 3');
  assert.deepEqual(app.errors,[]);
 }finally{app.close();}
});
test('late AI results cannot overwrite a question edited while the request was in flight',async()=>{
 let release;
 const app=setup({providerFetch:()=>new Promise(resolve=>{release=resolve;})});
 try{
  app.click('[data-action="new"]');app.fill('#draft-content','题干 A：x + 2 = 5');app.click('[data-ai="solve"]');await until(()=>release);app.fill('#draft-content','题干 B：x + 3 = 9');release(solution());await until(()=>!app.doc.querySelector('#ai-job'));
  assert.equal(app.qa.draft.content,'题干 B：x + 3 = 9');assert.equal(app.qa.draft.answer,'');assert.equal(app.doc.querySelector('#ai-result-form'),null);assert.match(app.doc.querySelector('#toasts').textContent,/已改动/);assert.deepEqual(app.errors,[]);
 }finally{app.close();}
});
test('cancellation aborts the provider request and leaves user data untouched',async()=>{
 let started=false,aborted=false;
 const app=setup({providerFetch:async(url,init)=>{started=true;return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('cancelled','AbortError'));},{once:true}));}});
 try{
  app.click('[data-action="new"]');app.fill('#draft-content','x + 2 = 5');app.click('[data-ai="solve"]');await until(()=>started);app.click('#ai-job [data-ai="cancel"]');await until(()=>aborted);await tick();assert.equal(app.qa.draft.answer,'');assert.equal(app.doc.querySelector('#ai-result-form'),null);assert.deepEqual(app.errors,[]);
 }finally{app.close();}
});
test('generated markup is displayed as editable text and never executes',async()=>{
 const app=setup({providerFetch:async()=>upstream({choices:[{message:{content:JSON.stringify({...answer,answer:'<img id="owned" src=x onerror="window.pwned=1">',analysis:'<script>window.pwned=1</script>'})}}]})});
 try{
  app.click('[data-action="new"]');app.fill('#draft-content','x + 2 = 5');app.click('[data-ai="solve"]');await until(()=>app.doc.querySelector('#ai-result-form'));assert.equal(app.doc.querySelector('#owned'),null);assert.equal(app.w.pwned,undefined);assert.match(app.doc.querySelector('[name="answer"]').value,/<img/);app.submit('#ai-result-form');assert.equal(app.w.pwned,undefined);assert.deepEqual(app.errors,[]);
 }finally{app.close();}
});
test('original learning, selection, paper, recycling and report routes remain functional',async()=>{
 const app=setup({demo:true});
 try{
  for(const route of ['dashboard','notebook','learning','knowledge','reports','print','trash','ai']){app.qa.go(route);assert.ok(app.doc.querySelector('#main h1'));}
  app.qa.go('notebook');app.fill('#filter-q','二次函数');assert.equal(app.doc.querySelectorAll('.record-table tbody tr').length,2);
  app.change('[data-select="demo-1"]',true);app.click('[data-action="print-selected"]');await until(()=>app.doc.querySelector('#paper-pages .a4'));assert.match(app.doc.querySelector('#paper-count').textContent,/已选 1 道题/);assert.equal(app.doc.querySelectorAll('.paper-question').length,2);
  app.qa.openRecord('demo-1');app.click('#dialog [data-study]');app.click('[data-action="reveal"]');app.click('[data-grade="mastered"]');assert.equal(app.qa.state.records[0].status,'mastered');app.click('#dialog [data-action="close"]');
  app.qa.openRecord('demo-1');app.click('#dialog [data-delete]');app.click('#dialog [data-action="confirm"]');app.qa.go('trash');app.click('[data-restore="demo-1"]');assert.equal(app.qa.state.records[0].archived,false);assert.deepEqual(app.errors,[]);
 }finally{app.close();}
});
for(const [subject,question,pointId,color] of [
 ['生物','细胞膜的主要功能是什么？','biology-cell','biology'],
 ['语文','“弯弯的月亮像一只小船”运用了什么修辞手法？','chinese-rhetoric','chinese']
])test(`${subject} is available with old data through navigation, intake, knowledge, filtering, reports and printing`,async()=>{
 const legacy=createInitialState(false);delete legacy.knowledgeLibraryVersion;legacy.knowledge=legacy.knowledge.filter(k=>!['生物','语文'].includes(k.subject));
 const app=setup({configured:false,initialState:legacy});
 try{
  assert.ok(app.doc.querySelector(`.subject-nav [data-subject="${subject}"]`));
  app.qa.go('notebook');assert.ok(app.doc.querySelector(`#main .subject-tabs [data-subject="${subject}"]`));
  app.qa.go('knowledge');app.click(`[data-knowledge-subject="${subject}"]`);assert.ok(app.doc.querySelector(`[data-knowledge="${pointId}"]`));
  app.click('[data-action="new"]');app.change('[data-draft="subject"]',subject);app.fill('#draft-content',question);app.submit('#intake-form');
  assert.ok(app.doc.querySelector(`[data-toggle-knowledge="${pointId}"].picked`));app.fill('[data-draft="answer"]',subject==='生物'?'控制物质进出细胞。':'比喻。');app.submit('#intake-form');app.submit('#intake-form');
  const record=app.qa.state.records[0];assert.equal(record.subject,subject);assert.ok(record.knowledgeIds.includes(pointId));
  app.click(`.subject-nav [data-subject="${subject}"]`);assert.equal(app.doc.querySelectorAll('.record-table tbody tr').length,1);assert.ok(app.doc.querySelector(`.subject-icon.${color}`));
  app.qa.go('reports');assert.match(app.doc.querySelector('.matrix-table tbody').textContent,new RegExp(subject));
  app.qa.go('print');app.change('[data-paper="subject"]',subject);await until(()=>app.doc.querySelector('#paper-pages .a4'));assert.match(app.doc.querySelector('.paper-question').textContent,new RegExp(`〔${subject}`));assert.match(app.doc.querySelector('#paper-count').textContent,/已选 1 道题/);assert.deepEqual(app.errors,[]);
 }finally{app.close();}
});

const cloudPng=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=','base64'));
const cloudPhoto={download_url:'https://files.oaiusercontent.com/photo?signature=temporary',file_id:'file-cloud-ui',file_name:'原题.png'};
const cloudQuestion={title:'细胞膜的功能',content:'细胞膜有什么功能？',subject:'生物',answer:'控制物质进出细胞。',analysis:'细胞膜具有选择透过性。',reason:null,knowledgePoints:[{name:'细胞的结构与功能'}]};
const cloudFetch=async()=>new Response(cloudPng,{headers:{'Content-Type':'image/png'}});

test('cloud capture merges with real legacy work, excludes demos, and synchronizes review progress across devices',async()=>{
 const env=createLocalCloud({memory:true});let app;
 try{
  const capture=await archiveFromChatGPT(env,{photo:cloudPhoto,mistakes:[cloudQuestion]},{fetchImpl:cloudFetch});
  const legacy=createInitialState(true),local={...structuredClone(legacy.records[0]),id:'local-real-question',demo:false};legacy.records.push(local);legacy.logs.push({id:'local-real-log',recordId:local.id,date:today(),mastered:false,stage:0,demo:false});
  app=setup({configured:false,initialState:legacy,cloudEnv:env});await app.qa.cloud.sync();
  assert.equal(app.qa.state.records.length,2);assert.ok(app.qa.state.records.every(r=>!r.demo));assert.ok(app.qa.state.records.some(r=>r.id===capture.records[0].id));assert.equal((await allEntities(env,'records')).length,2);assert.equal((await allEntities(env,'logs')).length,1);
  assert.equal(app.qa.state.records.find(r=>r.id===capture.records[0].id).captureSource.needsReview,true);
  app.qa.openRecord(local.id);app.click('#dialog [data-study]');app.click('[data-action="reveal"]');app.click('[data-grade="mastered"]');app.click('#dialog [data-action="close"]');await app.qa.cloud.sync();
  assert.equal((await getEntity(env,'records',local.id)).payload.status,'mastered');assert.equal((await allEntities(env,'logs')).length,2);
  const other=await archiveFromChatGPT(env,{photo:{...cloudPhoto,file_id:'file-second-device'},mistakes:[{...cloudQuestion,title:'第二张手机题图'}]},{fetchImpl:cloudFetch});await app.qa.cloud.sync();assert.ok(app.qa.state.records.some(r=>r.id===other.records[0].id));assert.equal(app.qa.cloud.label(),'云端已同步');assert.deepEqual(app.errors,[]);
 }finally{app?.close();env.close();}
});

test('sync conflicts preserve both versions until a user explicitly resolves them',async()=>{
 const env=createLocalCloud({memory:true});let app;
 try{
  const capture=await archiveFromChatGPT(env,{photo:cloudPhoto,mistakes:[cloudQuestion]},{fetchImpl:cloudFetch});const id=capture.records[0].id;
  app=setup({configured:false,cloudEnv:env});await app.qa.cloud.sync();app.qa.state.records.find(r=>r.id===id).answer='本机修改后的答案';
  const before=await getEntity(env,'records',id);await writeEntity(env,{kind:'records',id,payload:{...before.payload,answer:'云端较新的答案'},baseRevision:before.revision});
  await app.qa.cloud.sync();assert.equal(app.qa.state.records.find(r=>r.id===id).answer,'本机修改后的答案');assert.equal((await getEntity(env,'records',id)).payload.answer,'云端较新的答案');
  app.qa.go('cloud');assert.ok(app.doc.querySelector('.cloud-conflicts'));app.click('[data-cloud="remote"]');await until(()=>app.qa.state.records.find(r=>r.id===id).answer==='云端较新的答案');await app.qa.cloud.sync();assert.equal(app.qa.cloud.label(),'云端已同步');assert.deepEqual(app.errors,[]);
 }finally{app?.close();env.close();}
});

test('offline edits remain in the local workspace and are sent when the connection returns',async()=>{
 const env=createLocalCloud({memory:true});let app;
 try{
  app=setup({configured:false,cloudEnv:env});await app.qa.cloud.sync();
  Object.defineProperty(app.w.navigator,'onLine',{value:false,configurable:true});app.click('[data-action="new"]');app.fill('#draft-content','解方程 x + 2 = 5');app.submit('#intake-form');app.fill('[data-draft="answer"]','x=3');app.submit('#intake-form');app.submit('#intake-form');const id=app.qa.state.records[0].id;
  await app.qa.cloud.sync();assert.equal(await getEntity(env,'records',id),null);assert.ok(app.w.localStorage.getItem(STORAGE_KEY).includes(id));assert.match(app.qa.cloud.label(),/离线/);
  Object.defineProperty(app.w.navigator,'onLine',{value:true,configurable:true});await app.qa.cloud.sync();assert.equal((await getEntity(env,'records',id)).payload.answer,'x=3');assert.equal(app.qa.cloud.label(),'云端已同步');assert.deepEqual(app.errors,[]);
 }finally{app?.close();env.close();}
});

test('two fresh devices can initialize the same knowledge library without false conflicts',async()=>{
 const env=createLocalCloud({memory:true});let first,second;
 try{
  first=setup({configured:false,cloudEnv:env});second=setup({configured:false,cloudEnv:env});
  await Promise.all([first.qa.cloud.sync(),second.qa.cloud.sync()]);
  assert.equal(first.qa.cloud.label(),'云端已同步');assert.equal(second.qa.cloud.label(),'云端已同步');
  assert.equal((await allEntities(env,'knowledge')).length,createInitialState(false).knowledge.length);assert.deepEqual(first.errors,[]);assert.deepEqual(second.errors,[]);
 }finally{first?.close();second?.close();env.close();}
});
