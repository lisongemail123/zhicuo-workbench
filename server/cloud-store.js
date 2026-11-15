import { createInitialState,validateState,builtInKnowledge,today,addDays,REASONS,SUBJECTS,uid } from '../dist/model.js';
import { attachAIKnowledge } from '../dist/ai.js';

export const MAX_PHOTO_BYTES=12*1024*1024;
export const CLOUD_KINDS=['records','knowledge','logs'];
export const cloudReady=env=>!!(env?.DB&&env?.BUCKET);
export const validId=id=>typeof id==='string'&&id.length>0&&id.length<=100&&!/[\u0000-\u001f]/.test(id);
export const fingerprint=value=>JSON.stringify(value);
export async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function readBounded(stream,maxBytes){const reader=stream?.getReader();if(!reader)return new Uint8Array();let count=0;const chunks=[];try{for(;;){const r=await reader.read();if(r.done)break;count+=r.value.length;if(count>maxBytes){await reader.cancel();throw new Error('内容过大，请使用 12 MB 以内的照片');}chunks.push(r.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
export async function getEntity(env,kind,id){const row=await env.DB.prepare('SELECT kind,id,payload,revision,deleted,updated_at FROM cloud_entities WHERE kind=? AND id=?').bind(kind,id).first();return row?{kind:row.kind,id:row.id,payload:JSON.parse(row.payload),revision:row.revision,deleted:!!row.deleted,updatedAt:row.updated_at}:null;}
export async function listEntities(env,kind,offset=0,limit=100){const rows=await env.DB.prepare('SELECT kind,id,payload,revision,deleted,updated_at FROM cloud_entities WHERE kind=? ORDER BY id LIMIT ? OFFSET ?').bind(kind,limit,offset).all();return rows.results.map(row=>({kind:row.kind,id:row.id,payload:JSON.parse(row.payload),revision:row.revision,deleted:!!row.deleted,updatedAt:row.updated_at}));}
export async function allEntities(env,kind){const result=[];for(let offset=0;;offset+=100){const page=await listEntities(env,kind,offset,100);result.push(...page);if(page.length<100)break;}return result;}
export async function writeEntity(env,{kind,id,payload={},baseRevision=0,deleted=false}){
 if(!CLOUD_KINDS.includes(kind)||!validId(id)||!Number.isInteger(baseRevision)||baseRevision<0)throw new Error('同步条目无效');
 const at=new Date().toISOString();
 const result=await env.DB.prepare('INSERT INTO cloud_entities (kind,id,payload,revision,deleted,updated_at) VALUES (?,?,?,1,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,revision=cloud_entities.revision+1,deleted=excluded.deleted,updated_at=excluded.updated_at WHERE cloud_entities.revision=?').bind(kind,id,JSON.stringify(payload),deleted?1:0,at,baseRevision).run();
 const entity=await getEntity(env,kind,id);
 return {accepted:result.meta.changes===1,entity};
}
function imageMime(bytes){
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
 if(bytes[0]===0x89&&String.fromCharCode(...bytes.slice(1,4))==='PNG')return 'image/png';
 if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 if(String.fromCharCode(...bytes.slice(4,8))==='ftyp'&&/^(heic|heix|hevc|hevx|mif1|msf1|avif)$/.test(String.fromCharCode(...bytes.slice(8,12))))return String.fromCharCode(...bytes.slice(8,12))==='avif'?'image/avif':'image/heic';
 throw new Error('原图不是支持的图片格式，请使用 JPG、PNG、WebP 或 HEIC 照片');
}
export async function storePhoto(env,bytes,fileName='原题照片'){
 if(!bytes.length||bytes.length>MAX_PHOTO_BYTES)throw new Error('照片大小无效，需在 12 MB 以内');
 const mime=imageMime(bytes),id='photo-'+await digest(bytes),key='photos/'+id;
 if(!await env.DB.prepare('SELECT id FROM cloud_photos WHERE id=?').bind(id).first()){
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
  await env.DB.prepare('INSERT OR IGNORE INTO cloud_photos (id,storage_key,mime_type,byte_length,file_name,created_at) VALUES (?,?,?,?,?,?)').bind(id,key,mime,bytes.length,String(fileName).slice(0,160),new Date().toISOString()).run();
 }
 return {id,url:'/api/files/'+id,mimeType:mime,bytes:bytes.length};
}
export async function saveInlinePhoto(env,photo){
 if(!photo||photo.startsWith('/api/files/'))return photo||'';
 if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo))throw new Error('原图数据无效');
 const bytes=Uint8Array.from(atob(photo.split(',')[1]),c=>c.charCodeAt(0));return (await storePhoto(env,bytes)).url;
}
export async function removeUnusedPhoto(env,photoPath){
 const match=String(photoPath||'').match(/^\/api\/files\/(photo-[a-f0-9]{64})$/);if(!match)return;
 const referenced=await env.DB.prepare("SELECT id FROM cloud_entities WHERE kind='records' AND deleted=0 AND json_extract(payload,'$.photo')=? LIMIT 1").bind(photoPath).first();if(referenced)return;
 const file=await env.DB.prepare('SELECT storage_key FROM cloud_photos WHERE id=?').bind(match[1]).first();if(!file)return;
 await env.BUCKET.delete(file.storage_key);await env.DB.prepare('DELETE FROM cloud_photos WHERE id=?').bind(match[1]).run();
}
function allowedDownload(value){
 let url;try{url=new URL(value);}catch{throw new Error('ChatGPT 未提供可下载的原图链接，请重新发送照片');}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||url.port||!(host.endsWith('.oaiusercontent.com')||host==='oaiusercontent.com'||host.endsWith('.openai.com')||host==='chatgpt.com'||host.endsWith('.openaiusercontent.com')||host.endsWith('.blob.core.windows.net')))throw new Error('只接受 ChatGPT 授权的临时文件下载链接');
 return url;
}
export async function downloadChatGPTPhoto(env,photo,{fetchImpl=globalThis.fetch}={}){
 if(!photo||typeof photo.file_id!=='string'||!photo.file_id.trim())throw new Error('请把用户发送的原始照片作为文件参数传入');
 let url=allowedDownload(photo.download_url);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
 try{
  for(let i=0;i<4;i++){
   const response=await fetchImpl(url.href,{redirect:'manual',signal:controller.signal});
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)break;url=allowedDownload(new URL(location,url).href);continue;}
   if(!response.ok)throw new Error('原图链接已过期或无法下载，请重新发送照片后重试');
   if(Number(response.headers.get('content-length'))>MAX_PHOTO_BYTES)throw new Error('照片超过 12 MB，请压缩后重新发送');
   return storePhoto(env,await readBounded(response.body,MAX_PHOTO_BYTES),photo.file_name||'ChatGPT 原题照片');
  }
  throw new Error('原图重定向次数过多，请重新发送照片');
 }finally{clearTimeout(timeout);}
}
export async function knowledgePool(env){const rows=await allEntities(env,'knowledge');const map=new Map(builtInKnowledge().map(k=>[k.id,k]));for(const r of rows){if(r.deleted)map.delete(r.id);else map.set(r.id,r.payload);}return [...map.values()];}
export async function normalizeCloudEntity(env,kind,input,knownKnowledge){
 if(!input||!validId(input.id))throw new Error('条目编号无效');
 const state=createInitialState(false);state.knowledge=knownKnowledge||await knowledgePool(env);
 if(kind==='records'){
  const record={...input,photo:await saveInlinePhoto(env,input.photo||'')};
  state.records=[record];return validateState(state).records[0];
 }
 if(kind==='knowledge'){state.knowledge=[...state.knowledge.filter(k=>k.id!==input.id),input];return validateState(state).knowledge.find(k=>k.id===input.id);}
 if(kind==='logs'){
  const record=await getEntity(env,'records',input.recordId);
  if(!record||record.deleted)throw new Error('学习记录对应的错题不存在');
  state.records=[record.payload];state.logs=[input];const normalized=validateState(state).logs[0];if(!normalized)throw new Error('学习记录无效');return normalized;
 }
 throw new Error('不支持的同步类型');
}
export async function archiveFromChatGPT(env,args,options={}){
 const inputs=args?.mistakes;if(!Array.isArray(inputs)||!inputs.length||inputs.length>20)throw new Error('每次可归档 1–20 道题');
 if(!args.photo?.file_id)throw new Error('缺少原图文件，请重新发送照片');
 const batchKey=await digest(new TextEncoder().encode(args.photo.file_id));
 const ids=inputs.map((r,i)=>`chatgpt-${batchKey.slice(0,48)}-${i+1}`);
 const existing=await Promise.all(ids.map(id=>getEntity(env,'records',id)));
 if(existing.some(e=>e?.deleted))throw new Error('这张照片对应的错题已被永久删除；如需重新归档，请重新上传照片');
 if(existing.every(Boolean))return {records:existing.map(e=>e.payload),duplicateCount:existing.length,photoSaved:existing.every(e=>!!e.payload.photo)};
 const pool=await knowledgePool(env),working=createInitialState(false);working.knowledge=pool;
 // Validate all recognized questions before downloading files or writing any question.
 const normalized=inputs.map((input,i)=>{
  if(!input||typeof input.content!=='string'||!input.content.trim()||typeof input.answer!=='string'||!input.answer.trim()||typeof input.analysis!=='string'||!input.analysis.trim())throw new Error(`第 ${i+1} 题需包含题干、答案和解析；看不清的内容请明确标为待核对`);
  const subject=SUBJECTS.includes(input.subject)?input.subject:'其他';
  const points=(Array.isArray(input.knowledgePoints)?input.knowledgePoints:[]).slice(0,12).map(k=>typeof k==='string'?{name:k,explanation:'',prerequisites:[]}:k).filter(k=>k&&typeof k.name==='string'&&k.name.trim()).map(k=>({name:k.name.trim().slice(0,80),explanation:typeof k.explanation==='string'?k.explanation.slice(0,5000):'',prerequisites:Array.isArray(k.prerequisites)?k.prerequisites.filter(x=>typeof x==='string').slice(0,8):[]}));
  if(!points.length)throw new Error(`第 ${i+1} 题至少需要一个知识点；无法判断时可使用“知识点待核对”并标记待核对`);
  const attached=attachAIKnowledge(working,points,subject);working.knowledge=attached.knowledge;
  const reason=typeof input.wrong==='string'&&input.wrong.trim()&&REASONS.includes(input.reason)?input.reason:null;
  return {id:ids[i],title:String(input.title||input.content).trim().slice(0,160),content:input.content.trim(),subject,type:['选择题','填空题','解答题'].includes(input.type)?input.type:'解答题',difficulty:[1,2,3].includes(input.difficulty)?input.difficulty:2,wrong:typeof input.wrong==='string'?input.wrong:'',answer:input.answer.trim(),analysis:input.analysis.trim(),reason,knowledgeIds:attached.ids,source:'手机 ChatGPT · 拍照归档',createdAt:today(),updatedAt:today(),nextReview:addDays(today(),1),status:'new',stage:0,photo:'',archived:false,starred:false,demo:false,aiSource:{model:'ChatGPT',provider:'chatgpt',label:'手机 ChatGPT',generatedAt:new Date().toISOString(),reviewed:false},captureSource:{channel:'chatgpt',capturedAt:new Date().toISOString(),needsReview:!!input.needsReview||reason===null}};
 });
 // Deterministic knowledge IDs make concurrent retries idempotent as well as sequential retries.
 const aliases=new Map();
 for(const node of working.knowledge){if(!pool.some(k=>k.id===node.id)){const stable='chatgpt-k-'+(await digest(new TextEncoder().encode(node.subject+':'+node.name))).slice(0,48);aliases.set(node.id,stable);node.id=stable;}}
 for(const node of working.knowledge)node.prerequisites=node.prerequisites.map(id=>aliases.get(id)||id);
 for(const record of normalized)record.knowledgeIds=record.knowledgeIds.map(id=>aliases.get(id)||id);
 const checked=validateState({...working,records:normalized});
 const photo=await downloadChatGPTPhoto(env,args.photo,options);
 for(const node of working.knowledge){const before=pool.find(k=>k.id===node.id);if(!before)await writeEntity(env,{kind:'knowledge',id:node.id,payload:node});}
 const records=[];let duplicateCount=existing.filter(Boolean).length;
 for(let i=0;i<checked.records.length;i++){
  if(existing[i]){records.push(existing[i].payload);continue;}
  const record={...checked.records[i],photo:photo.url};
  const result=await writeEntity(env,{kind:'records',id:record.id,payload:record});if(!result.accepted)duplicateCount++;records.push(result.entity.payload);
 }
 return {records,duplicateCount,photoSaved:true};
}
