import { AI_CONFIG_KEY, AI_SESSION_KEY, AI_PROVIDERS, normalizeAIConfig, normalizeProfile, normalizeEndpoint, requestAI, recognizeLocal, attachAIKnowledge } from './ai.js';
import { uid, SUBJECTS, REASONS } from './model.js';

export function createAIWorkspace(deps) {
  const {getState,getDraft,saveState,render,modal,closeModal,toast,navigate,icon,esc,openRecord,confirmDialog}=deps;
  let config,keys={},editingId=null,modelOptions=[],pending=null,job=null;
  const statuses=new Map();
  try{config=normalizeAIConfig(JSON.parse(localStorage.getItem(AI_CONFIG_KEY)||'{}'));}catch{config=normalizeAIConfig();}
  try{const stored=JSON.parse(sessionStorage.getItem(AI_SESSION_KEY)||'{}');for(const [id,k] of Object.entries(stored))if(k&&typeof k.apiKey==='string'&&k.apiKey.length<=2000&&typeof k.endpoint==='string')keys[id]=k;}catch{}
  const profileFor=task=>config.profiles.find(p=>p.id===(task==='ocr'?config.ocrProfileId:config.solveProfileId));
  const keyFor=p=>p&&keys[p.id]?.endpoint===`${p.protocol}:${p.baseUrl}`?keys[p.id].apiKey:'';
  const providerName=id=>AI_PROVIDERS.find(p=>p.id===id)?.name||'自定义接口';
  const choose=(items,value)=>items.map(([v,l])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(l)}</option>`).join('');
  function persistConfig(){try{config=normalizeAIConfig(config);localStorage.setItem(AI_CONFIG_KEY,JSON.stringify(config));return true;}catch{toast('模型配置暂时无法保存，请检查浏览器存储空间。','error');return false;}}
  function persistKeys(){try{sessionStorage.setItem(AI_SESSION_KEY,JSON.stringify(keys));}catch{toast('会话存储不可用，API Key 仅在当前页面内存中保留。','error');}}
  function page(){
    const solve=profileFor('solve'),vision=profileFor('ocr');
    return `<div class="page-heading"><div><div class="eyebrow">OCR & AI ASSISTANT</div><h1>让题目被看见，让思路被讲清。</h1><p>配置自己的模型，识别原题，自动生成可核对的答案与解析。</p></div><button class="btn primary" data-ai="add">${icon('plus')}添加模型配置</button></div>
    <div class="ai-overview"><section class="card"><span class="small-label">图片转文字</span><h2>${config.ocrEngine==='local'?'浏览器本地 OCR':'视觉模型 OCR'}</h2><p>${config.ocrEngine==='local'?'无需 API Key，支持中英文印刷体。':esc(vision?.label||'先配置支持图像的模型。')}</p></section><section class="card"><span class="small-label">自动解题</span><h2>${esc(solve?.label||'等待配置模型')}</h2><p>${solve?`${esc(providerName(solve.provider))} · ${keyFor(solve)?'已提供会话密钥':'还需填写 API Key'}`:'选择服务商或自定义兼容接口。'}</p></section><section class="card"><span class="small-label">资料如何保存</span><h2>错题本地，密钥分开</h2><p>API Key 仅留在标签页会话，不进入错题备份。</p></section></div>
    <section class="card ai-defaults"><div class="section-title"><h2>识别与解题偏好</h2><span class="subtle">选择后自动保存</span></div><div class="ai-settings-grid"><div class="field"><label>默认解题模型</label><select data-ai-setting="solveProfileId">${choose([['','请选择'],...config.profiles.map(p=>[p.id,p.label])],config.solveProfileId)}</select></div><div class="field"><label>OCR 识别方式</label><select data-ai-setting="ocrEngine">${choose([['local','本地 OCR · 不上传照片'],['vision','视觉模型 · 将照片发给所选服务商']],config.ocrEngine)}</select></div><div class="field"><label>${config.ocrEngine==='local'?'本地 OCR 语言':'默认视觉模型'}</label>${config.ocrEngine==='local'?`<select data-ai-setting="ocrLanguage">${choose([['chi_sim+eng','简体中文 + English'],['chi_tra+eng','繁体中文 + English'],['eng','English']],config.ocrLanguage)}</select>`:`<select data-ai-setting="ocrProfileId">${choose([['','请选择支持图像的模型'],...config.profiles.filter(p=>p.vision).map(p=>[p.id,p.label])],config.ocrProfileId)}</select>`}</div></div><div class="ai-toggle-row"><label><input type="checkbox" data-ai-setting="autoOcr" ${config.autoOcr?'checked':''}>上传照片后自动识别</label><label><input type="checkbox" data-ai-setting="autoSolve" ${config.autoSolve?'checked':''}>识别后自动生成答案与解析</label></div><p class="ai-footnote">本地 OCR 首次需下载识别引擎和字库，照片在浏览器内处理。手写与复杂公式建议用视觉模型，识别后仍可编辑题干。模型请求按所选服务商的计费规则执行。</p></section>
    <div class="section-title outside"><h2>我的模型配置 <span class="count-pill">${config.profiles.length}</span></h2><button class="text-btn" data-ai="clear-keys">清除本会话 API Key</button></div>
    <div class="ai-profile-grid">${config.profiles.map(p=>`<section class="card ai-profile"><div class="ai-profile-heading"><span class="ai-provider-mark">${icon('spark')}</span><div><h3>${esc(p.label)}</h3><small>${esc(providerName(p.provider))} · ${p.protocol==='anthropic'?'Anthropic Messages':'OpenAI 兼容'}</small></div><button class="icon-btn" data-ai="edit" data-id="${esc(p.id)}" aria-label="编辑${esc(p.label)}">${icon('edit')}</button></div><div class="ai-model-name">${esc(p.model)}</div><p class="ai-endpoint">${esc(p.baseUrl)}</p><div class="tag-row">${p.id===config.solveProfileId?'<span class="pill">默认解题</span>':''}${p.id===config.ocrProfileId?'<span class="pill">默认视觉</span>':''}${p.vision?'<span class="pill">支持图像</span>':''}<span class="status ${keyFor(p)?'mastered':'new'}"><i></i>${keyFor(p)?'会话密钥已配置':'未填写密钥'}</span></div><div class="ai-connection-state">${esc(statuses.get(p.id)||'尚未测试连接')}</div><div class="ai-profile-actions"><button class="text-btn" data-ai="test-saved" data-id="${esc(p.id)}">测试连接</button><button class="text-btn" data-ai="default-solve" data-id="${esc(p.id)}">设为解题默认</button><button class="icon-btn danger-text" data-ai="delete" data-id="${esc(p.id)}" aria-label="删除${esc(p.label)}">${icon('trash')}</button></div></section>`).join('')||`<section class="card ai-empty"><div>${icon('spark')}</div><h2>先添加一位解题助教。</h2><p>提供 API 地址、模型名与自己的 API Key，即可开始。<br>只用本地 OCR 时，无需配置模型。</p><button class="btn primary" data-ai="add">添加模型配置 ${icon('arrow')}</button></section>`}</div>`;
  }
  function editor(id=null){
    editingId=id;modelOptions=[];
    const p=config.profiles.find(p=>p.id===id)||{...AI_PROVIDERS[0],id:uid(),provider:'deepseek',label:'',timeout:90};
    modal(`<div class="modal-heading"><span class="eyebrow">MODEL CONNECTION</span><h2>${id?'编辑':'添加'}模型配置</h2><p>支持 OpenAI 兼容 Chat Completions 与 Anthropic Messages 协议。可保存多套配置，分别选择解题模型与视觉模型。</p></div><form id="ai-profile-form" data-profile-id="${esc(p.id)}"><div class="form-grid two"><div class="field"><label>服务商</label><select name="provider">${choose(AI_PROVIDERS.map(p=>[p.id,p.name]),p.provider)}</select></div><div class="field"><label>配置名称</label><input name="label" maxlength="80" value="${esc(p.label)}" placeholder="例如：日常解题 / 图片识别"></div></div><div class="field"><label>接口协议</label><select name="protocol">${choose([['openai','OpenAI 兼容 · Chat Completions'],['anthropic','Anthropic · Messages']],p.protocol)}</select></div><div class="field"><label>API Base URL *</label><input name="baseUrl" type="url" required maxlength="500" value="${esc(p.baseUrl)}" placeholder="https://api.example.com/v1"><small>填 API 基础地址，无需追加 /chat/completions。自定义服务需使用公网 HTTPS 地址。</small></div><div class="field"><label>API Key *</label><input name="apiKey" type="password" autocomplete="off" spellcheck="false" maxlength="2000" placeholder="${keyFor(p)?'本会话已有密钥，留空保留':'仅保存在当前标签页会话'}"><small>Key 随本次请求经站点转发到所选接口，服务端不落盘、不回显，不进入源码或错题备份。</small></div><div class="field"><label>模型名称 *</label><div class="ai-model-field"><input name="model" required maxlength="160" value="${esc(p.model)}" list="ai-model-options" placeholder="填写模型 ID，或读取后选择"><button type="button" class="btn small" data-ai="models">读取模型列表</button></div><datalist id="ai-model-options"></datalist><small id="ai-model-hint">模型以你的账户实际可用列表为准，也可以直接输入服务商给出的模型 ID。</small></div><div class="form-grid two"><div class="field"><label>请求超时（秒）</label><input type="number" min="15" max="180" name="timeout" value="${p.timeout}"></div><div class="field ai-vision-field"><label><input name="vision" type="checkbox" ${p.vision?'checked':''}>该模型支持图像输入</label><small>用于视觉 OCR；请按服务商实际模型能力开启。</small></div></div><div id="ai-test-output" class="ai-test-output" aria-live="polite"></div><div class="modal-footer"><button type="button" class="btn" data-ai="test-editor">${icon('refresh')}测试连接</button><span class="flex-space"></span><button type="button" class="btn" data-action="close">取消</button><button type="submit" class="btn primary">保存配置 ${icon('check')}</button></div></form>`,true);
  }
  function readForm(forModels=false){
    const form=document.querySelector('#ai-profile-form');if(!form)throw new Error('配置窗口已关闭');
    const f=new FormData(form),old=config.profiles.find(p=>p.id===editingId);
    const profile=normalizeProfile({id:form.dataset.profileId,provider:f.get('provider'),label:f.get('label'),protocol:f.get('protocol'),baseUrl:f.get('baseUrl'),model:f.get('model')||(forModels?'models':''),vision:f.get('vision')==='on',timeout:f.get('timeout')});
    const supplied=String(f.get('apiKey')||'').trim(),apiKey=supplied||keyFor(profile);
    if(!apiKey){if(old&&keys[old.id])throw new Error('更换接口或协议后，请重新填写 API Key');throw new Error('请填写 API Key');}
    if(/[\r\n]/.test(apiKey))throw new Error('API Key 不能包含换行');
    return {profile,apiKey,supplied};
  }
  async function testEditor(models=false){
    const output=document.querySelector('#ai-test-output'),form=document.querySelector('#ai-profile-form');
    try{
      const {profile,apiKey}=readForm(models);
      if(job)throw new Error('请先等待或取消正在进行的识别与解题');
      if(output)output.textContent=models?'正在读取模型列表…':'正在测试连接…';
      const response=await requestAI(profile,apiKey,models?'models':'test');
      if(document.querySelector('#ai-profile-form')!==form)return;
      if(models){modelOptions=response.models||[];document.querySelector('#ai-model-options').innerHTML=modelOptions.map(name=>`<option value="${esc(name)}"></option>`).join('');document.querySelector('#ai-model-hint').textContent=`已读取 ${modelOptions.length} 个模型；在模型名称框中输入或选择。`;if(!document.querySelector('[name="model"]').value&&modelOptions[0])document.querySelector('[name="model"]').value=modelOptions[0];}
      if(output?.isConnected)output.textContent=models?`模型列表读取完成，共 ${modelOptions.length} 个。`:'连接成功。保存配置后即可使用。';
    }catch(e){if(output?.isConnected)output.textContent=e.message;else toast(e.message,'error');}
  }
  function saveProfile(event){
    event.preventDefault();
    try{
      const {profile,apiKey}=readForm();
      if(!editingId&&config.profiles.length>=20)throw new Error('最多保存 20 套模型配置');
      const next=normalizeAIConfig({...config,profiles:config.profiles.filter(p=>p.id!==profile.id).concat(profile)});
      localStorage.setItem(AI_CONFIG_KEY,JSON.stringify(next));config=next;
      keys[profile.id]={apiKey,endpoint:`${profile.protocol}:${profile.baseUrl}`};persistKeys();statuses.delete(profile.id);
      closeModal();render();toast('模型配置已保存，API Key 仅在当前标签页会话中保留。');
    }catch(e){toast(e.message,'error');}
  }
  function toolbar(){
    const solve=profileFor('solve');
    return `<div class="ai-intake-toolbar"><div class="ai-toolbar-title">${icon('spark')}<span><strong>识别题干，或请助教讲解</strong><small>${solve?`${esc(solve.label)} · 核对后填入`:'本地 OCR 可直接使用；自动解题请先配置模型'}</small></span><button type="button" class="text-btn" data-ai="settings">模型设置</button></div><div class="ai-toolbar-actions"><button type="button" class="btn small" data-ai="ocr" ${job?'disabled':''}>${icon('image')}OCR 识别</button><button type="button" class="btn small" data-ai="solve" ${job?'disabled':''}>${icon('spark')}自动解题</button><button type="button" class="btn primary small" data-ai="pipeline" ${job?'disabled':''}>识别并解题 ${icon('arrow')}</button></div></div>`;
  }
  function requireProfile(task){
    const p=profileFor(task);
    if(!p){closeModal();navigate('ai');throw new Error(task==='ocr'?'请先添加支持图像的模型，并选择默认视觉模型':'请先添加模型配置并选择默认解题模型');}
    if(!keyFor(p)){closeModal();navigate('ai');editor(p.id);throw new Error('请先填写该模型的 API Key');}
    if(task==='ocr'&&!p.vision)throw new Error('请选择支持图像的模型');
    return p;
  }
  function begin(label){
    if(job)throw new Error('已有任务正在进行，可先取消再重试');
    job={id:uid(),controller:new AbortController(),label,started:Date.now()};updateJob(job,label);return job;
  }
  function updateJob(current,label,percent=null){
    if(job!==current)return;
    let el=document.querySelector('#ai-job');if(!el){el=document.createElement('div');el.id='ai-job';el.setAttribute('role','status');document.body.append(el);}
    el.innerHTML=`<span class="ai-spinner"></span><div><strong>${esc(label)}</strong><small>${percent===null?'请稍候，可取消；未确认的结果不会写入档案。':`${Math.round(percent*100)}% · 首次使用需下载识别字库`}</small></div><button data-ai="cancel" aria-label="取消任务">${icon('close')}</button>`;
  }
  function cancel(){const old=job;if(!old)return;job=null;old.controller.abort();document.querySelector('#ai-job')?.remove();render();}
  function finish(current){if(job===current){job=null;document.querySelector('#ai-job')?.remove();render();}}
  function snapshot(target){return JSON.stringify([target.content,target.photo,target.wrong,target.subject,target.answer,target.analysis]);}
  function context(recordId){const target=recordId?getState().records.find(r=>r.id===recordId&&!r.archived):getDraft();if(!target)throw new Error('请先打开一道题，或进入错题录入');return {target,recordId:recordId||null,snapshot:snapshot(target)};}
  function stillCurrent(ctx){const target=ctx.recordId?getState().records.find(r=>r.id===ctx.recordId&&!r.archived):getDraft();return target&&target===ctx.target&&snapshot(target)===ctx.snapshot;}
  async function solve(ctx,content,current){
    const p=requireProfile('solve');updateJob(current,`正在用 ${p.label} 生成答案与解析`);
    const response=await requestAI(p,keyFor(p),'solve',{content,subject:ctx.target.subject,wrong:ctx.target.wrong,knownKnowledge:getState().knowledge.filter(k=>k.subject===ctx.target.subject).map(k=>k.name)},current.controller.signal);
    return {result:response.result,source:{model:p.model,provider:p.provider,label:p.label,generatedAt:new Date().toISOString()}};
  }
  async function startSolve(recordId=null){
    let current;
    try{
      const ctx=context(recordId);if(!ctx.target.content.trim())throw new Error('请先填写题干，或先用 OCR 识别照片');
      requireProfile('solve');current=begin('正在准备解题');closeModal();
      const response=await solve(ctx,ctx.target.content,current);
      if(current.controller.signal.aborted)return;
      if(!stillCurrent(ctx))throw new Error('题目内容已改动，本次结果未应用；请根据新题干重新解题');
      pending={ctx,...response};showResult();
    }catch(e){if(e.name!=='AbortError')toast(e.message,'error');}finally{if(current)finish(current);}
  }
  async function startOcr(andSolve=false){
    let current;
    try{
      const ctx=context();if(!ctx.target.photo)throw new Error('请先上传原题照片');
      let vision;if(config.ocrEngine==='vision')vision=requireProfile('ocr');if(andSolve)requireProfile('solve');
      current=begin(config.ocrEngine==='local'?'正在启动本地 OCR':'正在识别题目照片');closeModal();
      let ocr;
      if(vision){const response=await requestAI(vision,keyFor(vision),'ocr',{photo:ctx.target.photo},current.controller.signal);ocr={...response.result,engine:'vision',model:vision.model};}
      else ocr=await recognizeLocal(ctx.target.photo,config.ocrLanguage,{signal:current.controller.signal,onProgress:m=>{const labels={'recognizing text':'正在识别题目文字','loading language traineddata':'正在下载识别字库','loading tesseract core':'正在加载 OCR 引擎','initializing api':'正在初始化 OCR'};updateJob(current,labels[m.status]||'正在准备本地 OCR',m.progress);}});
      if(current.controller.signal.aborted)return;
      if(!stillCurrent(ctx))throw new Error('题目或照片已改动，本次识别结果未应用，请重新识别');
      const response=andSolve?await solve(ctx,ocr.text,current):{};
      if(current.controller.signal.aborted)return;
      if(!stillCurrent(ctx))throw new Error('题目内容已改动，本次结果未应用，请重试');
      pending={ctx,ocr,...response};showResult();
    }catch(e){if(e.name!=='AbortError')toast(e.message,'error');}finally{if(current)finish(current);}
  }
  function showResult(){
    if(!pending)return;
    const {ocr,result,source,ctx}=pending;
    modal(`<div class="modal-heading"><span class="eyebrow">${result?'AI SOLUTION':'OCR RESULT'}</span><h2>${result?'答案与解析，先核对再收录。':'题目识别完成，请核对原题。'}</h2><p>${result?`${esc(source.label)} · ${esc(source.model)}`:ocr.engine==='local'?`本地 OCR · 识别置信度 ${Math.round(ocr.confidence)}%（不代表答案正确率）`:`视觉识别 · ${esc(ocr.model)}`}</p></div><form id="ai-result-form">${ocr?`<div class="field"><label>识别题干 <small>可直接修改，特别核对公式、单位与图示条件</small></label><textarea name="content" required rows="7" maxlength="30000">${esc(ocr.text)}</textarea></div>`:''}<div class="field"><label>所属学科</label><select name="subject">${choose(SUBJECTS.map(s=>[s,s]),result?.subject||ocr?.subject||ctx.target.subject)}</select></div>${result?`<div class="field"><label>参考答案 <small>模型生成，核对后采用</small></label><textarea name="answer" required maxlength="30000" rows="4">${esc(result.answer)}</textarea></div><div class="field"><label>分步解析与错因分析</label><textarea name="analysis" required maxlength="30000" rows="8">${esc(result.analysis)}</textarea></div><div class="field"><label>建议错因</label><select name="reason">${choose([['','保留当前错因'],...REASONS.map(r=>[r,r])],result.reason||'')}</select><small>无原始错误答案时，模型可能无法确定错因；请结合自己的作答核对。</small></div>${result.knowledgePoints.length?`<div class="field"><label>关联知识点 <small>勾选后加入知识路径，不覆盖已有讲解</small></label><div class="ai-point-options">${result.knowledgePoints.map((p,i)=>`<label><input type="checkbox" name="point" value="${i}" checked><span><strong>${esc(p.name)}</strong><small>${esc(p.explanation||'可在知识体系中补充讲解')}</small></span></label>`).join('')}</div></div>`:''}`:'<p class="inline-note">本地识别更适合清晰印刷体。模糊文字、手写与复杂公式请人工核对，或切换视觉模型。</p>'}<div class="modal-footer"><button type="button" class="btn" data-action="close">暂不采用</button><button type="submit" class="btn primary">${result?'采用答案与解析':'采用识别题干'} ${icon('check')}</button></div></form>`,true);
  }
  function applyResult(event){
    event.preventDefault();if(!pending)return;
    try{
      const {ctx,ocr,result,source}=pending;
      if(!stillCurrent(ctx))throw new Error('题目已改动或被删除，请重新识别/解题，避免覆盖新内容');
      const f=new FormData(event.target),subject=String(f.get('subject'));
      const changes={subject};
      if(ocr){const content=String(f.get('content')||'').trim();if(!content)throw new Error('识别题干不能为空');changes.content=content;changes.ocrSource={engine:ocr.engine,model:ocr.model||'',confidence:ocr.confidence??null,recognizedAt:new Date().toISOString()};if(!ctx.target.title)changes.title=ocr.title||content.slice(0,28);}
      let nextKnowledge=getState().knowledge,ids=subject===ctx.target.subject?[...(ctx.target.knowledgeIds||[])]:[];
      if(result){changes.answer=String(f.get('answer')||'').trim();changes.analysis=String(f.get('analysis')||'').trim();if(!changes.answer||!changes.analysis)throw new Error('答案和解析不能为空');if(f.get('reason'))changes.reason=String(f.get('reason'));if(!ctx.target.title)changes.title=result.title||(ocr?.text||ctx.target.content).slice(0,28);const points=f.getAll('point').map(i=>result.knowledgePoints[Number(i)]).filter(Boolean);const attached=attachAIKnowledge(getState(),points,subject);nextKnowledge=attached.knowledge;ids=[...new Set([...ids,...attached.ids])];changes.aiSource={...source,reviewed:true};}
      changes.knowledgeIds=ids;
      const nextState=structuredClone(getState());nextState.knowledge=nextKnowledge;
      if(ctx.recordId){const r=nextState.records.find(r=>r.id===ctx.recordId);Object.assign(r,changes,{updatedAt:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})});}else Object.assign(ctx.target,changes);
      const persisted=saveState(nextState);pending=null;closeModal();render();if(ctx.recordId)openRecord(ctx.recordId);if(persisted!==false)toast(result?'已填入答案、解析与知识点，学习状态保持原样。':'题干已填入，可继续编辑与归档。');
      if(ocr&&!result&&config.autoSolve&&!ctx.recordId)void startSolve();
    }catch(e){toast(e.message,'error');}
  }
  async function testSaved(id){
    const p=config.profiles.find(p=>p.id===id);if(!p)return;
    if(!keyFor(p)){editor(id);toast('请先填写 API Key。','error');return;}
    statuses.set(id,'正在测试连接…');render();
    try{await requestAI(p,keyFor(p),'test');statuses.set(id,'连接成功');toast('模型连接成功。');}catch(e){statuses.set(id,e.message);toast(e.message,'error');}render();
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-ai]');if(!button)return;event.preventDefault();const action=button.dataset.ai,id=button.dataset.id;
    if(action==='add')editor();
    if(action==='edit')editor(id);
    if(action==='settings'){closeModal();navigate('ai');}
    if(action==='models')void testEditor(true);
    if(action==='test-editor')void testEditor(false);
    if(action==='test-saved')void testSaved(id);
    if(action==='default-solve'){config.solveProfileId=id;persistConfig();render();}
    if(action==='delete')confirmDialog('删除这套模型配置？','已收录的题目、答案和学习记录会保留。',()=>{keys[id]=undefined;config=normalizeAIConfig({...config,profiles:config.profiles.filter(p=>p.id!==id)});persistConfig();persistKeys();closeModal();render();},'删除配置');
    if(action==='clear-keys'){keys={};persistKeys();statuses.clear();render();toast('当前标签页的 API Key 已清除，模型配置仍保留。');}
    if(action==='ocr')void startOcr(false);
    if(action==='pipeline')void startOcr(true);
    if(action==='solve')void startSolve(id||null);
    if(action==='cancel'){cancel();toast('操作已取消。');}
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.dataset.aiSetting){config[el.dataset.aiSetting]=el.type==='checkbox'?el.checked:el.value;persistConfig();render();}
    if(el.name==='provider'&&el.closest('#ai-profile-form')){const p=AI_PROVIDERS.find(p=>p.id===el.value);const form=el.form;form.elements.protocol.value=p.protocol;form.elements.baseUrl.value=p.baseUrl;form.elements.model.value=p.model;form.elements.vision.checked=p.vision;form.elements.apiKey.value='';form.elements.apiKey.placeholder='请填写该服务商的 API Key';document.querySelector('#ai-model-options').innerHTML='';document.querySelector('#ai-test-output').textContent='';}
  });
  document.addEventListener('submit',event=>{if(event.target.id==='ai-profile-form')saveProfile(event);if(event.target.id==='ai-result-form')applyResult(event);});
  return {page,toolbar,startSolve,startOcr,isBusy:()=>!!job,cancel,onPhotoUploaded:()=>{cancel();if(config.autoOcr)void startOcr(config.autoSolve);},sourceBadge:r=>r.aiSource?`<div class="ai-source-badge">${icon('spark')}答案与解析来自 ${esc(r.aiSource.model)} · 已核对采用</div>`:''};
}
