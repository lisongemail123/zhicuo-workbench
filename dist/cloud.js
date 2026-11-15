import { scopedKey,workspaceHeaders } from './account-context.js';
import { validateState,builtInKnowledge,learningPath } from './model.js';
const CACHE_KEY='zhicuo.cloud.sync.v1';
const kinds=['knowledge','records','logs'];
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export async function contentHash(value){
 if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,'photo')){
  let photo=value.photo;
  if(typeof photo==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(photo)){const image=Uint8Array.from(atob(photo.split(',')[1]),c=>c.charCodeAt(0));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',image))].map(b=>b.toString(16).padStart(2,'0')).join('');photo='/api/files/photo-'+hash;}
  value={...value,photo,lastReviewed:value.lastReviewed||null,aiSource:value.aiSource||null,ocrSource:value.ocrSource||null,captureSource:value.captureSource||null};
 }
 const bytes=new TextEncoder().encode(canonical(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const entityKey=(kind,id)=>kind+':'+id;
export function realEntries(state,kind){if(kind==='records'||kind==='logs')return state[kind].filter(r=>!r.demo);return learningPath(state.knowledge,state.knowledge.map(k=>k.id));}

export function createCloudSync({getState,applyState,render,toast,esc,icon,openRecord,fetchImpl=(...args)=>fetch(...args)}){
 const cacheKey=scopedKey(CACHE_KEY,true);
 let readOnly=false,interval=null;
 let cache={},configured=false,status='local',error='',running=null,timer=null,stopped=false,rerun=false;
 const conflicts=new Map();
 try{const saved=JSON.parse(localStorage.getItem(cacheKey)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))cache=saved;}catch{}
 const label=()=>({local:'本机保存',syncing:'正在同步',synced:'云端已同步',offline:'离线 · 本机已保存',conflict:'同步内容待核对',error:'同步暂不可用'})[status];
 function changeStatus(next,message=''){status=next;error=message;document.querySelectorAll('[data-cloud-status]').forEach(el=>{el.textContent=label();});}
 function saveCache(){try{localStorage.setItem(cacheKey,JSON.stringify(cache));}catch{}}
 async function api(path,body){const response=await fetchImpl(path,{method:body?'POST':'GET',headers:{...workspaceHeaders(),...(body?{'Content-Type':'application/json'}:{})},credentials:'same-origin',...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await response.json();}catch{throw new Error('云端服务未正确返回，请检查登录状态');}if(!response.ok)throw new Error(data.error||'云端暂时不可用');return data;}
 async function acknowledge(entity){cache[entityKey(entity.kind,entity.id)]={revision:entity.revision,hash:entity.deleted?'':await contentHash(entity.payload),deleted:entity.deleted};}
 function apply(next){if(stopped)return;const normalized=validateState(next);if(canonical(normalized)!==canonical(getState())){applyState(normalized);render();}}
 async function pull(){
  const remote={};
  await Promise.all(kinds.map(async kind=>{const rows=[];let offset=0;for(;;){const page=await api(`/api/cloud/entities?kind=${kind}&offset=${offset}`);rows.push(...page.entities);if(page.nextOffset===null)break;offset=page.nextOffset;}remote[kind]=rows;}));
  const next=structuredClone(getState()),defaults=new Map(builtInKnowledge().map(k=>[k.id,k]));
  for(const kind of kinds){
   const local=new Map((readOnly?(kind==='knowledge'?builtInKnowledge():[]):realEntries(next,kind)).map(p=>[p.id,p]));
   for(const entity of remote[kind]){
    if(readOnly){if(entity.deleted)local.delete(entity.id);else local.set(entity.id,entity.payload);await acknowledge(entity);conflicts.delete(entityKey(kind,entity.id));continue;}
    const key=entityKey(kind,entity.id),base=cache[key],current=local.get(entity.id),hash=current?await contentHash(current):null,remoteHash=entity.deleted?'':await contentHash(entity.payload);
    if(current&&entity.deleted){
     if(base&&!base.deleted&&hash!==base.hash){conflicts.set(key,{entity,kind,id:entity.id});continue;}
     local.delete(entity.id);await acknowledge(entity);conflicts.delete(key);continue;
    }
    if(!current){
     if(entity.deleted){await acknowledge(entity);conflicts.delete(key);continue;}
     if(base&&!base.deleted){if(base.revision!==entity.revision){conflicts.set(key,{entity,kind,id:entity.id});continue;}}else if(!entity.deleted)local.set(entity.id,entity.payload);
     if(!base||base.deleted||entity.deleted)await acknowledge(entity);
     continue;
    }
    if(hash===remoteHash){local.set(entity.id,entity.payload);await acknowledge(entity);conflicts.delete(key);continue;}
    const unmodifiedDefault=kind==='knowledge'&&!base&&defaults.has(current.id)&&hash===await contentHash(defaults.get(current.id));
    if((base&&!base.deleted&&hash===base.hash)||unmodifiedDefault){local.set(entity.id,entity.payload);await acknowledge(entity);conflicts.delete(key);}
    else if(!base||base.revision!==entity.revision)conflicts.set(key,{entity,kind,id:entity.id});
   }
   const demos=next[kind].filter(p=>p.demo);
   next[kind]=[...local.values()];
   if((kind==='records'||kind==='logs')&&!remote.records.some(e=>!e.deleted)&&!next.records.some(r=>!r.demo))next[kind].push(...demos);
  }
  // Real cloud questions replace sample-only views; the sample data itself is never uploaded.
  if(remote.records.some(e=>!e.deleted)){next.records=next.records.filter(r=>!r.demo);next.logs=next.logs.filter(l=>!l.demo);}
  apply(next);saveCache();
 }
 async function collectChanges(){
  const changes=[];
  for(const kind of kinds){
   const entries=realEntries(getState(),kind),seen=new Set();
   for(const payload of entries){const key=entityKey(kind,payload.id);seen.add(key);if(conflicts.has(key))continue;const hash=await contentHash(payload),base=cache[key];if(!base||base.deleted||hash!==base.hash)changes.push({kind,id:payload.id,payload,baseRevision:base?.revision||0,deleted:false,_hash:hash});}
   for(const [key,base] of Object.entries(cache)){if(key.startsWith(kind+':')&&!base.deleted&&!seen.has(key)&&!conflicts.has(key))changes.push({kind,id:key.slice(kind.length+1),baseRevision:base.revision,deleted:true,_hash:null});}
  }
  return changes;
 }
 async function push(){
  let pending=await collectChanges();
  while(pending.length){
   const batch=[];let size=0;
   while(pending.length&&batch.length<40){const nextSize=canonical(pending[0]).length;if(batch.length&&size+nextSize>3500000)break;batch.push(pending.shift());size+=nextSize;}
   const response=await api('/api/cloud/sync',{changes:batch.map(({_hash,...change})=>change)});
   const next=structuredClone(getState());
   for(let i=0;i<response.results.length;i++){
    const result=response.results[i],sent=batch[i],key=entityKey(sent.kind,sent.id);
    if(!result.accepted&&!(result.entity.deleted===sent.deleted&&(sent.deleted||await contentHash(result.entity.payload)===sent._hash))){conflicts.set(key,{entity:result.entity,kind:sent.kind,id:sent.id});continue;}
    await acknowledge(result.entity);conflicts.delete(key);
    const index=next[sent.kind].findIndex(p=>p.id===sent.id),current=index>=0?next[sent.kind][index]:null;
    if(sent.deleted){if(!current)continue;}else if(current&&await contentHash(current)===sent._hash)next[sent.kind][index]=result.entity.payload;
   }
   apply(next);saveCache();
  }
 }
 async function sync(){
  if(stopped)return;if(running)return running;
  running=(async()=>{
   if(navigator.onLine===false){changeStatus('offline');return;}
   changeStatus('syncing');
   try{
    const capability=await api('/api/cloud/status');configured=capability.configured===true;readOnly=capability.role==='viewer';
    if(!configured){changeStatus('local');return;}
    await pull();if(!readOnly)await push();changeStatus(conflicts.size?'conflict':'synced');
   }catch(e){changeStatus('error',e.message);}finally{saveCache();}
  })().finally(()=>{running=null;if(rerun){rerun=false;queue();}});return running;
 }
 function queue(){if(stopped||!configured)return;if(running)rerun=true;clearTimeout(timer);changeStatus('syncing');timer=setTimeout(()=>void sync(),700);}
 function page(){
  const recent=getState().records.filter(r=>r.captureSource?.channel==='chatgpt').sort((a,b)=>(b.captureSource.capturedAt||'').localeCompare(a.captureSource.capturedAt||'')).slice(0,8);
  return `<div class="page-heading"><div><div class="eyebrow">CAPTURE FROM CHATGPT</div><h1>拍一道题，留下一条进步的线索。</h1><p>手机 ChatGPT 识别分析，原图与结构化错题一起归档到云端。</p></div><button class="btn primary" data-cloud="sync">${icon('refresh')}立即同步</button></div><section class="card cloud-intro"><div class="section-title"><h2>手机拍照归档</h2><span class="pill" data-cloud-status>${label()}</span></div><div class="capture-flow"><span>① 在 ChatGPT 选择知错</span>${icon('arrow')}<span>② 拍照并发送</span>${icon('arrow')}<span>③ 自动分析与归档</span></div><p>首次在 ChatGPT 的“设置 → 插件 → 你创建的”中连接“知错”。之后在使用知错应用的对话中发送题目照片，由 ChatGPT 识别、解答、提取知识点并归档。请使用有权访问此工作台的同一账号。</p><div class="cloud-actions"><button class="btn" data-cloud="copy">复制拍照归档指令</button><a class="btn" href="https://chatgpt.com" target="_blank" rel="noopener">打开 ChatGPT ${icon('arrow')}</a></div><div class="capture-prompt">以后我在此对话发送的题目照片，请自动识别题干、生成参考答案和解析，按学科、知识点与有依据的错因分类，保留原图并归档到知错。无法确认的内容标记待核对，不要编造。</div></section><div class="cloud-detail-grid"><section class="card"><div class="section-title"><h2>云端与本机</h2>${icon('shield')}</div><p>${configured?'云端归档已启用。本机保留缓存，断网时可继续学习；联网后同步更新。':'正在检查云端连接。未连接时，学习改动仍保存在当前浏览器。'}</p><p>已有真实错题、知识点与学习记录会合并同步；示例题不会上传。手机上传的原图保存到工作台文件存储，临时下载地址不会作为原图地址保留。</p>${error?`<p class="cloud-error">${esc(error)}</p>`:''}</section><section class="card"><div class="section-title"><h2>归档之后，明天就有方向</h2>${icon('clock')}</div><p>照片、题干、学科、知识点、答案和解析一起保存，默认安排明天首次复习。接下来仍按 1 / 2 / 4 / 7 天推进。</p><p>没有原错解证据或看不清的内容会标为待核对；自动归档不会把题目标记为已掌握。模型结果可以在档案中继续编辑。</p></section></div>${conflicts.size?`<section class="card cloud-conflicts"><div class="section-title"><h2>${conflicts.size} 处内容需要合并</h2></div><p>本机与云端同时修改了相同条目。选择要保留的版本后继续同步。</p>${[...conflicts].map(([key,c])=>`<div><span>${esc(c.entity?.payload?.title||c.entity?.payload?.name||c.id)}</span><button class="btn small" data-cloud="remote" data-key="${esc(key)}">采用云端</button><button class="btn small" data-cloud="local" data-key="${esc(key)}">采用本机</button></div>`).join('')}</section>`:''}<section class="card spaced"><div class="section-title"><h2>最近从 ChatGPT 归档</h2><span class="subtle">同步后自动出现</span></div>${recent.length?`<div class="cloud-recent">${recent.map(r=>`<button data-cloud="record" data-id="${esc(r.id)}"><span><strong>${esc(r.title)}</strong><small>${r.subject} · ${r.captureSource.needsReview?'有内容待核对':'已完成结构化分析'}</small></span>${icon('chevron')}</button>`).join('')}</div>`:'<div class="empty"><p>连接应用并发送第一张题目照片后，这里会显示归档记录。</p></div>'}</section>`;
 }
 async function resolve(key,useLocal){const conflict=conflicts.get(key);if(!conflict)return;const {entity,kind,id}=conflict;await acknowledge(entity);if(!useLocal){const next=structuredClone(getState());next[kind]=next[kind].filter(p=>p.id!==id);if(!entity.deleted)next[kind].push(entity.payload);apply(next);}conflicts.delete(key);saveCache();render();await sync();render();}
 const onClick=event=>{const el=event.target.closest('[data-cloud]');if(!el)return;event.preventDefault();const action=el.dataset.cloud;if(action==='sync')void sync().then(()=>{render();if(status==='synced')toast('云端与本机已同步。');});if(action==='record')openRecord(el.dataset.id);if(action==='local'||action==='remote')void resolve(el.dataset.key,action==='local').catch(e=>toast(e.message,'error'));if(action==='copy'){const prompt='以后我在此对话发送的题目照片，请自动识别题干、生成参考答案和解析，按学科、知识点与有依据的错因分类，保留原图并归档到知错。无法确认的内容标记待核对，不要编造。';if(navigator.clipboard?.writeText)navigator.clipboard.writeText(prompt).then(()=>toast('拍照归档指令已复制。')).catch(()=>toast('请复制页面中的归档指令。'));else toast('请复制页面中的归档指令。');}};
 document.addEventListener('click',onClick);
 const onOnline=()=>void sync(),onVisibility=()=>{if(document.visibilityState==='visible')void sync();};
 window.addEventListener('online',onOnline);document.addEventListener('visibilitychange',onVisibility);
 return {queue,page,label,isConfigured:()=>configured,sync,start:()=>{void sync();interval=setInterval(()=>{if(document.visibilityState==='visible')void sync();},30000);},stop:async()=>{stopped=true;clearTimeout(timer);clearInterval(interval);document.removeEventListener('click',onClick);window.removeEventListener('online',onOnline);document.removeEventListener('visibilitychange',onVisibility);await running;}};
}
