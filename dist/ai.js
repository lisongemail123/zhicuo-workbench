import { uid, REASONS, SUBJECTS, learningPath } from './model.js';

export const AI_CONFIG_KEY = 'zhicuo.ai.config.v1';
export const AI_SESSION_KEY = 'zhicuo.ai.session.v1';
export const AI_PROVIDERS = [
  { id:'deepseek', name:'DeepSeek', protocol:'openai', baseUrl:'https://api.deepseek.com', model:'deepseek-flash', vision:false },
  { id:'qwen', name:'通义千问 · 百炼', protocol:'openai', baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1', model:'qwen-plus', vision:false },
  { id:'openai', name:'OpenAI', protocol:'openai', baseUrl:'https://api.openai.com/v1', model:'', vision:false },
  { id:'siliconflow', name:'硅基流动', protocol:'openai', baseUrl:'https://api.siliconflow.cn/v1', model:'', vision:false },
  { id:'anthropic', name:'Anthropic · Claude', protocol:'anthropic', baseUrl:'https://api.anthropic.com/v1', model:'', vision:true },
  { id:'custom', name:'自定义兼容接口', protocol:'openai', baseUrl:'', model:'', vision:false }
];
const text = (value,max=30000) => typeof value==='string' ? value.trim().slice(0,max) : '';

export function normalizeEndpoint(value) {
  let url;
  try { url=new URL(text(value,500)); } catch { throw new Error('请输入完整的 HTTPS API 地址'); }
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || (url.port && url.port!=='443')) throw new Error('API 地址需使用标准 HTTPS，不含用户名、查询参数或自定义端口');
  if(!host.includes('.') || /[:\[\]]/.test(host) || /^\d+(\.\d+){3}$/.test(host) || /(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(host) || /\.(nip\.io|sslip\.io|localtest\.me)$/.test(host)) throw new Error('API 地址需为公网域名，不能指向本机或内网');
  url.hostname=host;
  url.pathname=url.pathname.replace(/\/(chat\/completions|messages|models)\/?$/,'').replace(/\/+$/,'') || '/';
  return url.toString().replace(/\/$/,'');
}
export function normalizeProfile(input) {
  if(!input || typeof input!=='object')throw new Error('模型配置无效');
  const protocol=input.protocol==='anthropic'?'anthropic':'openai';
  const model=text(input.model,160);
  if(!model || /[\r\n]/.test(model))throw new Error('请填写模型名称，或先读取服务商模型列表');
  return { id:text(input.id,100)||uid(), provider:AI_PROVIDERS.some(p=>p.id===input.provider)?input.provider:'custom', label:text(input.label,80)||model, protocol, baseUrl:normalizeEndpoint(input.baseUrl), model, vision:!!input.vision, timeout:Math.max(15,Math.min(180,Number(input.timeout)||90)) };
}
export function normalizeAIConfig(input={}) {
  const profiles=(Array.isArray(input.profiles)?input.profiles:[]).slice(0,20).map(normalizeProfile);
  if(new Set(profiles.map(p=>p.id)).size!==profiles.length)throw new Error('模型配置编号重复');
  return { version:1, profiles, solveProfileId:profiles.some(p=>p.id===input.solveProfileId)?input.solveProfileId:profiles[0]?.id||'', ocrProfileId:profiles.some(p=>p.id===input.ocrProfileId&&p.vision)?input.ocrProfileId:profiles.find(p=>p.vision)?.id||'', ocrEngine:input.ocrEngine==='vision'?'vision':'local', ocrLanguage:['chi_sim+eng','chi_tra+eng','eng'].includes(input.ocrLanguage)?input.ocrLanguage:'chi_sim+eng', autoOcr:input.autoOcr!==false, autoSolve:input.autoSolve===true };
}
export function extractModelText(data,protocol='openai') {
  const content=protocol==='anthropic'?data?.content:data?.choices?.[0]?.message?.content;
  const result=typeof content==='string'?content:Array.isArray(content)?content.filter(c=>c.type==='text'||typeof c.text==='string').map(c=>c.text||'').join('\n'):'';
  if(!result.trim())throw new Error('模型没有返回文本，可能未完成生成或模型不支持当前请求');
  return result.replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
}
export function parseAIResult(raw,task='solve') {
  const cleaned=text(raw,200000).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  let data;
  try { data=JSON.parse(cleaned); } catch { try{data=JSON.parse(cleaned.slice(cleaned.indexOf('{'),cleaned.lastIndexOf('}')+1));}catch{throw new Error('模型未返回有效的结构化结果，请重试或更换模型');} }
  if(!data || typeof data!=='object' || Array.isArray(data))throw new Error('模型返回的结果格式不正确');
  if(task==='ocr') {
    const recognized=text(data.text);
    if(!recognized)throw new Error('没有识别到题干，请使用更清晰的照片');
    return {text:recognized,title:text(data.title,160),subject:SUBJECTS.includes(data.subject)?data.subject:null};
  }
  const answer=text(data.answer),analysis=text(data.analysis)|| (Array.isArray(data.steps)?data.steps.map((s,i)=>`${i+1}. ${text(s,5000)}`).join('\n'):text(data.explanation));
  if(!answer || !analysis)throw new Error('模型结果缺少答案或解析，请重试或更换模型');
  const names=new Set();
  const knowledgePoints=(Array.isArray(data.knowledgePoints)?data.knowledgePoints:Array.isArray(data.knowledge)?data.knowledge:[]).slice(0,12).map(item=>typeof item==='string'?{name:item}:item).filter(item=>item&&text(item.name,80)).map(item=>({name:text(item.name,80),explanation:text(item.explanation,5000),prerequisites:Array.isArray(item.prerequisites)?item.prerequisites.map(p=>text(p,80)).filter(Boolean).slice(0,8):[]})).filter(k=>names.has(k.name)?false:(names.add(k.name),true));
  return {answer,analysis,title:text(data.title,160),subject:SUBJECTS.includes(data.subject)?data.subject:null,type:['选择题','填空题','解答题'].includes(data.type)?data.type:null,reason:REASONS.includes(data.reason)?data.reason:null,knowledgePoints};
}
export function attachAIKnowledge(state,points,subject) {
  const knowledge=structuredClone(state.knowledge), selected=[];
  for(const point of points) {
    let node=knowledge.find(k=>k.name===point.name&&k.subject===subject);
    if(!node){if(knowledge.length>=500)throw new Error('知识点已达 500 个，请先整理知识库');node={id:uid(),name:point.name,subject,prerequisites:[],keywords:[point.name],explanation:point.explanation||'',example:'',exercise:'',answer:'',solution:'',builtin:false};knowledge.push(node);}
    selected.push(node.id);
  }
  for(const point of points){const node=knowledge.find(k=>k.name===point.name&&k.subject===subject);if(!state.knowledge.some(k=>k.id===node.id))node.prerequisites=point.prerequisites.map(name=>knowledge.find(k=>k.name===name&&k.subject===subject)?.id).filter(id=>id&&id!==node.id);}
  learningPath(knowledge,selected); // No partial mutation when the model proposes cyclic dependencies.
  return {knowledge,ids:selected};
}
export async function requestAI(profile,apiKey,task,input={},signal,fetchImpl=globalThis.fetch) {
  const response=await fetchImpl('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({profile:normalizeProfile(task==='models'?{...profile,model:profile.model||'models'}:profile),apiKey,task,...input}),signal});
  let data;
  try{data=await response.json();}catch{throw new Error('AI 服务未正确返回。请使用 npm start 启动，或使用已发布的新版工作台');}
  if(!response.ok)throw new Error(data.error||`AI 服务请求失败（${response.status}）`);
  return data;
}
export async function imageForRecognition(photo,signal){
  if(photo.startsWith('data:image/'))return photo;
  if(!/^\/api\/files\/photo-[a-f0-9]{64}$/.test(photo))throw new Error('原图地址无效');
  const response=await fetch(photo,{credentials:'same-origin',signal});if(!response.ok)throw new Error('原图暂时无法读取，请检查云端连接');
  const blob=await response.blob();
  if(blob.size>12*1024*1024)throw new Error('原图超过识别大小限制');
  if(blob.size<=1.5*1024*1024&&['image/png','image/jpeg','image/webp'].includes(blob.type))return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  let image;
  try{image=await createImageBitmap(blob);}catch{throw new Error('当前浏览器无法解码原图，请从 ChatGPT 继续分析，或使用 JPG/PNG 原图');}
  try{
   let scale=Math.min(1,2600/Math.max(image.width,image.height));
   for(let pass=0;pass<5;pass++){
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.86-pass*.06);if(data.length<2100000)return data;scale*=.8;
   }
   throw new Error('原图压缩后仍过大，请裁切为单道题后重试');
  }finally{image.close();}
}
let libraryPromise;
function loadOcrLibrary() {
  if(globalThis.Tesseract)return Promise.resolve(globalThis.Tesseract);
  if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./vendor/tesseract/tesseract.min.js',import.meta.url).href;script.onload=()=>globalThis.Tesseract?resolve(globalThis.Tesseract):reject(new Error('OCR 组件加载失败'));script.onerror=()=>{script.remove();libraryPromise=null;reject(new Error('OCR 组件无法加载，请刷新后重试'));};document.head.append(script);});
  return libraryPromise;
}
function raceAbort(promise,signal) {
  if(!signal)return promise;
  if(signal.aborted)return Promise.reject(new DOMException('操作已取消','AbortError'));
  let listener;
  const cancellation=new Promise((_,reject)=>{listener=()=>reject(new DOMException('操作已取消','AbortError'));signal.addEventListener('abort',listener,{once:true});});
  return Promise.race([promise,cancellation]).finally(()=>signal.removeEventListener('abort',listener));
}
export async function recognizeLocal(image,language='chi_sim+eng',{signal,onProgress=()=>{},engine}={}) {
  let worker, cancelled=false;
  const abort=()=>{cancelled=true;worker?.terminate().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    const tesseract=engine||await raceAbort(loadOcrLibrary(),signal);
    const creation=tesseract.createWorker(language,1,{workerPath:new URL('./vendor/tesseract/worker.min.js',import.meta.url).href,corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',langPath:'https://tessdata.projectnaptha.com/4.0.0_fast',logger:m=>onProgress({status:m.status,progress:Math.max(0,Math.min(1,Number(m.progress)||0))})});
    creation.then(w=>{if(cancelled)w.terminate().catch(()=>{});}).catch(()=>{});
    worker=await raceAbort(creation,signal);
    const {data}=await raceAbort(worker.recognize(image),signal);
    const recognized=text(data.text).replace(/\u0000/g,'');
    if(!recognized)throw new Error('没有识别到文字，请换一张清晰照片，或使用视觉模型识别');
    return {text:recognized,confidence:Math.max(0,Math.min(100,Number(data.confidence)||0)),engine:'local'};
  }finally{signal?.removeEventListener('abort',abort);if(worker&&!cancelled)await worker.terminate().catch(()=>{});}
}
