import { typesetMath,attachMathPreviews,splitStudyText } from './math.js';
import { createAccountUI } from './accounts.js';
import { scopedKey,photoURL } from './account-context.js';
import { AI_CONFIG_KEY,AI_SESSION_KEY,normalizeAIConfig } from './ai.js';
import { createCloudSync } from './cloud.js';
import { createAIWorkspace } from './ai-ui.js';
import { VERSION, STORAGE_KEY, SUBJECTS, REASONS, INTERVALS, uid, today, addDays, dateLabel, activeRecords, dueRecords, knowledgeStats, applyReview, learningPath, suggestKnowledge, selectPaper, createInitialState, validateState } from './model.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
 book:'<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h3z"/>',
 home:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 layers:'<rect x="5" y="3" width="14" height="17" rx="2"/><path d="M8 7h8M8 11h8M8 15h4M2 7v14h13"/>',
 learn:'<path d="m2 8 10-5 10 5-10 5zM6 10v7c4 3 8 3 12 0v-7M22 8v8"/>',
 chart:'<path d="M4 3v17h17M8 15v-4M13 15V7M18 15V4"/>',
 map:'<rect x="8" y="2" width="8" height="5" rx="1"/><rect x="2" y="17" width="7" height="5" rx="1"/><rect x="15" y="17" width="7" height="5" rx="1"/><path d="M12 7v5H5v5M12 12h7v5"/>',
 print:'<path d="M7 8V3h10v5M7 17H4V9h16v8h-3"/><path d="M7 14h10v8H7zM16 11h1"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>', chevron:'<path d="m9 5 7 7-7 7"/>', down:'<path d="m6 9 6 6 6-6"/>',
 check:'<path d="m5 12 4 4L19 6"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 star:'<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9z"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>', upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>', image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
 spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01"/>',
 leaf:'<path d="M20 3c-11-1-18 4-15 12 8 5 15-1 15-12ZM3 21 15 9"/>',
 shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6"/>',
 edit:'<path d="m15 4 5 5M3 21l5-1L21 7l-5-5L3 15z"/>', refresh:'<path d="M20 7a9 9 0 1 0 1 9M20 3v5h-5"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
};
const icon = (name,cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.book}</svg>`;
const subjectClass = s => ({数学:'math',物理:'physics',英语:'english',化学:'chemistry',生物:'biology',语文:'chinese',其他:'other'}[s]||'other');
const badge = r => `<span class="status ${r.status}"><i></i>${({new:'待学习',reviewing:'复习中',mastered:'已掌握'})[r.status]}</span>`;
const reasonLabel=r=>r.reason||'待核对';
const subjectBadge = s => `<span class="subject-icon ${subjectClass(s)}">${({数学:'𝑥',物理:'⚛',英语:'A',化学:'H₂',生物:'生',语文:'文',其他:'◇'})[s]||'◇'}</span>`;
const options = (values,value) => values.map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(v)}</option>`).join('');
const empty = (title,detail,action='new',label='录入第一道错题') => `<div class="empty">${icon('book')}<h3>${esc(title)}</h3><p>${esc(detail)}</p>${action?`<button class="btn primary" data-action="${action}">${esc(label)}</button>`:''}</div>`;
let cloud=null;
let initialWarning='',storageKey=STORAGE_KEY,initialized=false;
let state=createInitialState(false);
let view=['dashboard','notebook','intake','learning','knowledge','reports','print','ai','cloud','trash','account','admin'].includes(location.hash.slice(1).split('?')[0])?location.hash.slice(1).split('?')[0]:'dashboard';
let filters={subject:'全部',status:'全部',reason:'全部',q:'',sort:'due',star:false};
let selected=new Set(), learningMode='questions', reportDays=7, knowledgeSubject='全部';
let session=null, draft=null, draftStep=1, confirmHandler=null, editKnowledgeId=null, importCandidate=null;
let paper={strategy:'due',count:6,subject:'全部',title:'我的错题巩固练习',space:'normal',answers:true,ids:[]};
let paperVersion=0, isMobileMenu=false, currentPaperIds=[];
let ai=null;
async function initializeAccount(context){
 storageKey=scopedKey(STORAGE_KEY,true);initialWarning='';
 try{let raw=localStorage.getItem(storageKey);const legacy=!raw&&context.legacyImportAllowed&&context.workspace.personal&&!localStorage.getItem('zhicuo.legacy.claimed');if(legacy)raw=localStorage.getItem(STORAGE_KEY);state=raw?validateState(JSON.parse(raw)):createInitialState(false);if(!raw)state.prefs.name=context.user.displayName;localStorage.setItem(storageKey,JSON.stringify(state));if(legacy&&raw)localStorage.setItem('zhicuo.legacy.claimed',context.user.id);}catch{state=createInitialState(false);initialWarning='本机缓存暂时无法读取，云端连接后将重新载入。';}
 try{if(context.legacyImportAllowed&&!localStorage.getItem('zhicuo.ai.legacy.claimed')){const configKey=scopedKey(AI_CONFIG_KEY),secretKey=scopedKey(AI_SESSION_KEY),oldConfig=localStorage.getItem(AI_CONFIG_KEY),oldKeys=sessionStorage.getItem(AI_SESSION_KEY);if(oldConfig&&!localStorage.getItem(configKey))localStorage.setItem(configKey,JSON.stringify(normalizeAIConfig(JSON.parse(oldConfig))));if(oldKeys&&!sessionStorage.getItem(secretKey)){sessionStorage.setItem(secretKey,oldKeys);sessionStorage.removeItem(AI_SESSION_KEY);}localStorage.setItem('zhicuo.ai.legacy.claimed',context.user.id);}}catch{}
 ai=createAIWorkspace({getState:()=>state,getDraft:()=>draft,saveState:next=>{state=validateState(next);return save();},render,modal,closeModal,toast,navigate:next=>go(next),icon,esc,openRecord,confirmDialog});
 cloud=createCloudSync({getState:()=>state,applyState:next=>{state=next;try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{toast('本机缓存空间不足，请等待云端同步完成或导出备份。','error');}},render,toast,esc,icon,openRecord});
 initialized=true;cloud.start();if(initialWarning)toast(initialWarning,'error');
}


function toast(message,kind='success') {
 const el=document.createElement('div');el.className=`toast ${kind}`;el.textContent=message;$('#toasts').append(el);setTimeout(()=>el.remove(),4200);
}
function save() {
 try { localStorage.setItem(storageKey,JSON.stringify(state));cloud?.queue();return true; }
 catch {cloud?.queue();toast('浏览器存储空间不足或不可用。请等待云端同步完成，或导出备份。','error');return false;}
}
function commit(fn,message) { fn(); const saved=save();render(); if(message&&saved)toast(message); }
function navigate(next,subject) {
 if(view==='intake'&&draft&&next!=='intake'&&draft.content.trim()&&!draft.saved) {
  confirmDialog('离开错题录入？','尚未归档的内容会暂留到本次页面关闭，可返回继续编辑。',()=>go(next,subject),'继续离开');return;
 }
 go(next,subject);
}
function go(next,subject) {
 view=next; if(subject) filters.subject=subject;isMobileMenu=false;
 history.replaceState(null,'',`#${next}`);render();window.scrollTo({top:0,behavior:'instant'});
}
function modal(html,wide=false) {
 const d=$('#dialog');d.className=wide?'wide':'';d.innerHTML=`<button class="modal-close icon-btn" data-action="close" aria-label="关闭">${icon('close')}</button>${html}`;
 typesetMath(d);attachMathPreviews(d);
 if(!d.open)d.showModal();d.scrollTop=0;
}
function closeModal(){ $('#dialog').close(); }
function confirmDialog(title,description,handler,label='确认',danger=false) {
 confirmHandler=handler;modal(`<div class="modal-heading">${icon(danger?'trash':'help')}<h2>${esc(title)}</h2><p>${esc(description)}</p></div><div class="modal-footer"><button class="btn" data-action="close">取消</button><button class="btn ${danger?'danger':'primary'}" data-action="confirm">${esc(label)}</button></div>`);
}
const todayLogs=()=>state.logs.filter(l=>l.date===today());
const active=()=>activeRecords(state);
const navItems=[['dashboard','home','工作台'],['notebook','layers','错题档案'],['learning','learn','学习中心'],['knowledge','map','知识体系'],['reports','chart','学习报告'],['print','print','组卷打印'],['ai','spark','模型与 OCR'],['cloud','upload','手机归档与同步'],['account','shield','账号与共享空间']];
function render() {
 if(!account.isReady()){$('#app').innerHTML='<div class="account-loader">正在连接知错账号…</div>';return;}
 if(!account.isAuthenticated()){$('#app').innerHTML=account.authPage();return;}
 if(!initialized){$('#app').innerHTML='<div class="account-loader">正在加载学习空间…</div>';return;}
 const links=account.isAdmin()?[...navItems,['admin','settings','服务端管理后台']]:navItems;
 const due=dueRecords(state).length, total=active().length;
 const count=todayLogs().length, goal=state.prefs.dailyGoal;
 $('#app').innerHTML=`<div class="workspace ${isMobileMenu?'menu-open':''}"><div class="nav-scrim" data-action="menu"></div><aside class="sidebar">
 <button class="brand" data-nav="dashboard"><span class="brand-mark">${icon('book')}</span><span><strong>知错<span class="brand-dot">.</span></strong><small>让学习，每一步有迹可循</small></span></button>
 <div class="space-label">${account.workspace.personal?'个人学习工作台':'共享学习空间'} <span>${account.workspace.personal?'PERSONAL':'SHARED'}</span></div><div class="space-switch"><label for="active-space">当前学习空间</label><select id="active-space">${accountSpacesOptions()}</select></div>
 <nav aria-label="主导航">${links.map(([id,ic,label])=>`<button data-nav="${id}" class="nav-item ${view===id?'active':''}">${icon(ic)}<span>${label}</span>${id==='learning'&&due?`<b class="nav-count">${due}</b>`:id==='notebook'?`<small>${total}</small>`:''}</button>`).join('')}</nav>
 <div class="sidebar-section"><span>我的学科</span><button class="icon-btn" data-action="new" aria-label="新增错题">${icon('plus')}</button></div>
 <div class="subject-nav">${SUBJECTS.filter(s=>s!=='其他'||active().some(r=>r.subject===s)).map(s=>`<button data-subject="${s}" class="${view==='notebook'&&filters.subject===s?'chosen':''}"><i class="subject-dot ${subjectClass(s)}"></i><span>${s}</span><small>${active().filter(r=>r.subject===s).length}</small></button>`).join('')}</div>
 <div class="sidebar-bottom"><div class="daily-card"><div>${icon('leaf')}<span>每天一点，稳稳向前</span></div><p>今日已学习 <strong>${count}</strong><span> / ${goal} 题</span></p><div class="progress-track"><i style="width:${Math.min(100,count/goal*100)}%"></i></div><small>${count>=goal?'今日目标达成，继续保持。':`再学习 ${goal-count} 题，完成今日小目标`}</small></div>
 <button class="profile" data-nav="account"><span class="avatar">知</span><span><strong>${esc(account.user.displayName)}</strong><small><i class="green-dot"></i>${cloud?.isConfigured()?'本机缓存 · 云端同步':'数据暂存当前浏览器'}</small></span>${icon('settings')}</button></div></aside>
 <div class="main-shell"><header class="topbar"><div class="breadcrumb"><button class="icon-btn mobile-menu" data-action="menu" aria-label="打开导航">${icon('menu')}</button><span>学习空间</span>${icon('chevron')}<strong>${links.find(i=>i[0]===view)?.[2]||(view==='intake'?'录入错题':'回收站')}</strong></div><div class="topbar-actions"><button class="local-status" data-nav="cloud"><i class="green-dot"></i><span data-cloud-status>${cloud?.label()||'本机保存'}</span></button><button class="icon-btn" data-action="search" aria-label="搜索错题">${icon('search')}</button><button class="icon-btn" data-action="help" aria-label="使用与设计说明">${icon('help')}</button><button class="icon-btn" data-action="settings" aria-label="学习偏好">${icon('settings')}</button><button class="header-avatar" data-nav="account" aria-label="账号与共享">知</button></div></header><main id="main" tabindex="-1"></main><footer class="site-footer"><span>知错 · 把错题留下，把知识带走。</span><button data-action="help">使用与设计说明 ${icon('arrow')}</button></footer></div></div>`;
 renderMain();
}
function renderMain() {
 const pages={dashboard:dashboard,notebook:notebook,intake:intake,learning:learning,knowledge:knowledgePage,reports:reports,print:printPage,ai:()=>ai.page(),cloud:()=>cloud.page(),account:()=>account.page(),admin:()=>account.adminPage(),trash:trashPage};
 $('#main').innerHTML=(account.isReadonly()&&!['account','admin'].includes(view)?'<div class="readonly-banner">你是此共享空间的只读成员，可以查看错题、解析和报告。编辑或记录复习结果需由拥有者调整权限。</div>':'')+pages[view]();
 typesetMath($('#main'));attachMathPreviews($('#main'));
 if(view==='print') requestAnimationFrame(()=>{buildPaper();document.fonts?.ready.then(()=>{if(view==='print')buildPaper(false);});});
}
function pageHeading(eyebrow,title,description,actions='') {
 return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div><div class="page-actions">${actions}</div></div>`;
}
function dashboard() {
 const records=active(), due=dueRecords(state), mastered=records.filter(r=>r.status==='mastered').length;
 const weak=knowledgeStats(state).filter(k=>k.total>0).sort((a,b)=>a.rate-b.rate||b.total-a.total);
 const count=todayLogs().length;
 const date=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(new Date());
 const demo=state.records.some(r=>r.demo);
 return `${pageHeading(`${date} <span class="eyebrow-separator">/</span> 每一小步，都是进步`,'今天，也在离掌握更近一点。','从一道错题开始，慢慢建立属于你的知识体系。',`<button class="btn" data-nav="reports">${icon('chart')}查看报告</button><button class="btn primary" data-action="new">${icon('plus')}录入错题</button>`)}
 ${demo?`<div class="demo-note">${icon('spark')}<span>你正在查看示例学习数据。录入自己的题目，开始建立专属错题本。</span><button data-action="clear-demo">清除示例 ${icon('close')}</button></div>`:''}
 <section class="stats-grid" aria-label="学习概况">${[
 ['layers','累计收录',records.length,'道','每一道错题，都值得被理解','warm'],
 ['clock','今日待复习',due.length,'道',due.filter(r=>r.nextReview<today()).length?`${due.filter(r=>r.nextReview<today()).length} 道已到期，优先温习`:'跟随节奏，让记忆更牢固','red'],
 ['shield','已经掌握',mastered,'道',`当前掌握率 ${records.length?Math.round(mastered/records.length*100):0}%`,'sage'],
 ['map','关联知识点',new Set(records.flatMap(r=>r.knowledgeIds)).size,'个','把零散的题，连成知识的网','sand']
 ].map(([ic,label,value,unit,note,tone])=>`<div class="stat-card"><div class="stat-label">${label}<span class="stat-icon ${tone}">${icon(ic)}</span></div><div class="stat-value">${value}<small>${unit}</small></div><p>${note}</p></div>`).join('')}</section>
 <div class="dashboard-middle"><section class="review-hero"><div class="hero-copy"><span class="small-label"><i></i>今日学习计划</span><h2>让错题，成为下一次的底气。</h2><p>${due.length?`已经为你整理好 ${due.length} 道到期错题。<br>从薄弱处再走一遍，让知识真正留下来。`:'今天的到期错题已清空。<br>不妨温习一个知识点，或收录新的学习发现。'}</p><button class="btn primary" data-action="start-due">${due.length?'开始今日复习':'去学习中心'} ${icon('arrow')}</button><span class="hero-hint">1 · 2 · 4 · 7 天，让复习自有节奏</span></div><div class="book-art" aria-hidden="true"><div class="art-orbit"></div><svg viewBox="0 0 300 230"><path d="M234 59c-16-34-55-41-86-24" fill="none" stroke="#cdbb9e" stroke-width="1.5" stroke-dasharray="4 5"/><path d="m241 61-11-3 8-7" fill="none" stroke="#cdbb9e"/><ellipse cx="151" cy="203" rx="91" ry="12" fill="#cdbba5" opacity=".3"/><path d="m63 170 103 20 82-43-102-19z" fill="#916348"/><path d="m63 158 103 20 82-43v12l-82 43-103-20z" fill="#f7efe0"/><path d="m63 153 103 20 82-43-103-20z" fill="#c7b99a"/><path d="m74 140 102 18 67-39-104-16z" fill="#a7533f"/><path d="m74 127 102 18 67-39v13l-67 39-102-18z" fill="#fbf6e9"/><path d="m74 122 102 18 67-39-104-16z" fill="#b86851"/><path d="m93 117 73-40 77 22-67 40z" fill="#a7533f"/><path d="m155 54-56 32 16 55 56-31 66 8-16-55z" fill="#f4e7d0" stroke="#e1ccb0" stroke-width="1.5"/><path d="m155 54 16 56m-61-18 35-20m-31 30 35-20m-31 30 35-20m35-17 37 6m-35 5 38 7m-35 5 38 6" stroke="#cdbd9f" stroke-width="2"/><path d="m177 56 5 18 9-6 11 10-5-18z" fill="#a7533f"/><path d="m53 80 4-11 4 11 11 4-11 4-4 11-4-11-11-4z" fill="#bb8d58"/><circle cx="246" cy="165" r="6" fill="#a4af93"/><path d="M213 186c4-28 25-29 27-51-28 4-30 27-27 51Z" fill="#87957a"/><path d="M213 186c0-15-12-28-26-28 0 18 11 26 26 28Z" fill="#afbaa2"/></svg></div></section>
 <section class="card rhythm-card"><div class="section-title"><h2>本周学习节奏</h2><span class="subtle">最近 7 天</span></div><div class="rhythm-total"><strong>${state.logs.filter(l=>l.date>=addDays(today(),-6)).length}</strong><span>次复习 <span class="subtle">/ 稳步积累中</span></span></div>${barChart(7)}<div class="rhythm-bottom">${icon('leaf')}今天已学习 ${count} 题，${count>=state.prefs.dailyGoal?'目标已完成':'继续保持自己的节奏'}</div></section></div>
 <div class="dashboard-bottom"><section class="card recent-card"><div class="section-title"><h2>最近收录 <span class="section-caption">从记录到真正理解</span></h2><button class="text-btn" data-nav="notebook">全部错题 ${icon('arrow')}</button></div>${records.length?recordTable([...records].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,4),false):empty('给学习留下一点痕迹','收录第一道错题，知识路径和复习计划会一起建立。')}</section>
 <section class="card weak-card"><div class="section-title"><h2>值得再巩固的知识</h2>${icon('target')}</div><p class="section-desc">先补薄弱处，再向前一步。</p><div class="weak-list">${weak.slice(0,4).map((k,i)=>`<button data-knowledge="${esc(k.id)}"><span class="weak-index">0${i+1}</span><span class="weak-body"><strong>${esc(k.name)}</strong><small>${esc(k.subject)} · ${k.total} 道关联错题</small><span class="progress-track"><i style="width:${k.rate}%"></i></span></span><span class="weak-rate">${k.rate}<small>%</small></span></button>`).join('')||'<p class="subtle">收录题目后，这里会给出巩固建议。</p>'}</div><button class="btn full" data-nav="knowledge">查看知识体系 ${icon('arrow')}</button></section></div>`;
}
function barChart(days=7) {
 const dates=Array.from({length:days},(_,i)=>addDays(today(),i-days+1));
 const counts=dates.map(d=>state.logs.filter(l=>l.date===d).length), max=Math.max(1,...counts);
 return `<div class="bar-chart" role="img" aria-label="${esc(dates.map((d,i)=>`${d}：复习${counts[i]}次`).join('；'))}">${dates.map((d,i)=>`<div class="bar-column"><span class="bar-number">${counts[i]||''}</span><div class="bar-well"><div class="bar ${i===dates.length-1?'today':''}" style="height:${counts[i]?Math.max(5,counts[i]/max*100):3}%"></div></div><span class="bar-label">${days===7?['日','一','二','三','四','五','六'][new Date(`${d}T12:00Z`).getUTCDay()]:d.slice(5)}</span></div>`).join('')}</div>`;
}
function filteredRecords(archived=false) {
 let list=state.records.filter(r=>r.archived===archived);
 if(filters.subject!=='全部')list=list.filter(r=>r.subject===filters.subject);
 if(filters.status!=='全部')list=list.filter(r=>r.status===filters.status);
 if(filters.reason!=='全部')list=list.filter(r=>reasonLabel(r)===filters.reason);
 if(filters.star)list=list.filter(r=>r.starred);
 if(filters.q.trim()){const q=filters.q.toLowerCase().trim();list=list.filter(r=>[r.title,r.content,r.source,r.reason,...r.knowledgeIds.map(id=>state.knowledge.find(k=>k.id===id)?.name||'')].join(' ').toLowerCase().includes(q));}
 if(filters.sort==='recent')list.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 else if(filters.sort==='hard')list.sort((a,b)=>b.difficulty-a.difficulty);
 else list.sort((a,b)=>(a.nextReview||'9999').localeCompare(b.nextReview||'9999'));
 return list;
}
function filterBar() {
 return `<div class="filter-bar"><label class="search-field">${icon('search')}<input id="filter-q" value="${esc(filters.q)}" placeholder="搜索题目、知识点或来源…" aria-label="搜索错题"></label><select data-filter="subject" aria-label="筛选学科">${options(['全部',...SUBJECTS],filters.subject)}</select><select data-filter="status" aria-label="筛选状态">${[['全部','全部状态'],['new','待学习'],['reviewing','复习中'],['mastered','已掌握']].map(([v,l])=>`<option value="${v}" ${filters.status===v?'selected':''}>${l}</option>`).join('')}</select><select data-filter="reason" aria-label="筛选错因">${options(['全部',...REASONS,'待核对'],filters.reason)}</select><button class="btn icon-only ${filters.star?'pressed':''}" data-action="filter-star" aria-label="只看收藏" aria-pressed="${filters.star}">${icon('star')}</button><button class="text-btn reset-filter" data-action="reset-filters">重置</button></div>`;
}
function notebook() {
 const records=filteredRecords();
 return `${pageHeading('MISTAKE ARCHIVE','让错题有迹可循。','题干、错因、知识点和复习状态，都在同一处归档。',`<button class="btn" data-action="export">${icon('download')}备份数据</button><button class="btn primary" data-action="new">${icon('plus')}录入错题</button>`)}
 <div class="subject-tabs"><button class="${filters.subject==='全部'?'active':''}" data-subject="全部">全部学科 <small>${active().length}</small></button>${SUBJECTS.filter(s=>s!=='其他'||active().some(r=>r.subject===s)).map(s=>`<button class="${filters.subject===s?'active':''}" data-subject="${s}">${s}<small>${active().filter(r=>r.subject===s).length}</small></button>`).join('')}</div>
 <section class="card notebook-card">${filterBar()}<div class="list-summary"><span>共 <strong>${records.length}</strong> 道错题 ${selected.size?`<span class="selected-info">已选择 ${selected.size} 道</span>`:''}</span><div class="inline-actions">${selected.size?`<button class="text-btn" data-action="print-selected">${icon('print')}选题组卷</button><button class="text-btn" data-action="learn-selected">${icon('learn')}集中学习</button><button class="text-btn danger-text" data-action="delete-selected">${icon('trash')}移入回收站</button>`:''}<select data-filter="sort" aria-label="错题排序">${[['due','复习到期优先'],['recent','最近录入优先'],['hard','难度优先']].map(([v,l])=>`<option value="${v}" ${filters.sort===v?'selected':''}>${l}</option>`).join('')}</select></div></div>${records.length?recordTable(records,true):empty('没有找到符合条件的错题','试试其他筛选条件，或录入一道新的错题。','reset-filters','清除筛选')}<div class="table-footer"><span>按 1 / 2 / 4 / 7 天自动安排复习</span><button data-nav="trash">${icon('trash')}回收站（${state.records.filter(r=>r.archived).length}）</button></div></section>`;
}
function recordTable(records,checkable=false) {
 return `<div class="table-scroll"><table class="record-table"><thead><tr>${checkable?`<th class="check-col"><input type="checkbox" aria-label="选择当前全部题目" data-select-all ${records.every(r=>selected.has(r.id))?'checked':''}></th>`:''}<th>题目 / 知识点</th><th>错因</th><th>学习状态</th><th>下次复习</th><th class="actions-col"></th></tr></thead><tbody>${records.map(r=>`<tr>${checkable?`<td><input type="checkbox" data-select="${esc(r.id)}" aria-label="选择${esc(r.title)}" ${selected.has(r.id)?'checked':''}></td>`:''}<td><button class="record-title" data-record="${esc(r.id)}">${subjectBadge(r.subject)}<span><strong>${esc(r.title)}</strong><small>${esc(r.knowledgeIds.map(id=>state.knowledge.find(k=>k.id===id)?.name).filter(Boolean).join(' · ')||r.subject+' · 暂无关联知识点')}</small></span></button></td><td><span class="reason-tag">${esc(reasonLabel(r))}</span></td><td>${badge(r)}</td><td><span class="due-label ${r.nextReview&&r.nextReview<=today()?'is-due':''}">${r.nextReview&&r.nextReview<=today()?icon('clock'):''}${dateLabel(r.nextReview)}</span></td><td><button class="icon-btn row-star ${r.starred?'starred':''}" data-star="${esc(r.id)}" aria-label="${r.starred?'取消收藏':'收藏'}${esc(r.title)}">${icon('star')}</button><button class="icon-btn" data-record="${esc(r.id)}" aria-label="查看${esc(r.title)}">${icon('chevron')}</button></td></tr>`).join('')}</tbody></table></div>`;
}
function pathHtml(ids) {
 const path=learningPath(state.knowledge,ids);
 if(!path.length)return '<p class="subtle">关联知识点后，会按前置关系生成学习路径。</p>';
 const depths=new Map();path.forEach(k=>depths.set(k.id,k.prerequisites.length?1+Math.max(...k.prerequisites.map(id=>depths.get(id)||0)):0));
 const levels=Array.from({length:Math.max(...depths.values())+1},(_,depth)=>path.filter(k=>depths.get(k.id)===depth));
 return `<div class="learning-path">${levels.map((nodes,depth)=>`<div class="path-level"><span class="path-level-label">${depth===0?'先巩固基础':`第 ${depth+1} 层 · 向前一步`}</span><div class="path-level-nodes">${nodes.map(k=>`<button class="path-node ${ids.includes(k.id)?'current':''}" data-knowledge="${esc(k.id)}"><small>${ids.includes(k.id)?'本题知识点':'前置基础'}</small><strong>${esc(k.name)}</strong>${k.prerequisites.length?`<span>前置：${esc(k.prerequisites.map(id=>state.knowledge.find(p=>p.id===id)?.name||'').join('、'))}</span>`:'<span>从这里开始</span>'}</button>`).join('')}</div></div>`).join(`<span class="path-arrow">${icon('arrow')}</span>`)}</div>`;
}
function openRecord(id) {
 const r=state.records.find(r=>r.id===id);if(!r)return;
 const history=state.logs.filter(l=>l.recordId===id).slice(-5).reverse();
 modal(`<div class="detail-heading"><div class="tag-row"><span class="pill ${subjectClass(r.subject)}">${esc(r.subject)}</span><span class="pill">${esc(r.type)}</span><span class="pill">${['','基础','中等','挑战'][r.difficulty]}</span>${badge(r)}</div><h2>${esc(r.title)}</h2><p>${esc(r.source||'个人收录')} · 收录于 ${r.createdAt}</p>${r.captureSource?.needsReview?'<span class="capture-review-tag">有内容待核对</span>':''}${ai.sourceBadge(r)}</div><div class="detail-content"><section><h3>原题</h3><div class="question-text">${esc(r.content)}</div>${r.photo?`<a href="${esc(photoURL(r.photo))}" target="_blank" rel="noopener"><img class="original-photo" src="${esc(photoURL(r.photo))}" alt="保存的原题照片"></a><a class="text-btn" href="${esc(photoURL(r.photo))}" target="_blank" rel="noopener">查看 / 保存原图 ${icon('arrow')}</a>`:''}</section><div class="answer-columns"><section class="answer-block wrong"><h3>当时的答案</h3><p>${esc(r.wrong||'尚未填写')}</p></section><section class="answer-block correct"><h3>参考答案</h3><p>${esc(r.answer||'尚未填写，可点击编辑补充')}</p></section></div><section><h3>错因与复盘 <span class="reason-tag">${esc(reasonLabel(r))}</span></h3><p class="prewrap">${esc(r.analysis||'尚未补充解析。回忆当时卡住的一步，下次会更有方向。')}</p></section><section><h3>知识点学习路径</h3>${pathHtml(r.knowledgeIds)}<small class="subtle">按前置关系排序；每个节点都可以打开学习。</small></section><section class="schedule-detail"><h3>复习节奏</h3><div class="schedule-steps">${INTERVALS.map((n,i)=>`<span class="${i<r.stage?'done':''}">${i<r.stage?icon('check'):icon('clock')}第 ${i+1} 轮 <small>${n} 天间隔</small></span>`).join('')}</div><p>下次复习：<strong>${r.nextReview?`${r.nextReview}（${dateLabel(r.nextReview)}）`:'四轮巩固已完成'}</strong></p>${history.length?`<div class="review-history">${history.map(l=>`<span>${l.date} · ${l.mastered?'已掌握':'仍需复习'}</span>`).join('')}</div>`:''}</section></div><div class="modal-footer"><button class="btn danger-text" data-delete="${esc(id)}">${icon('trash')}移入回收站</button><span class="flex-space"></span><button class="btn" data-ai="solve" data-id="${esc(id)}">${icon('spark')}AI 解题</button><button class="btn" data-edit="${esc(id)}">${icon('edit')}编辑</button><button class="btn primary" data-study="${esc(id)}">${icon('learn')}开始学习</button></div>`,true);
}
function learning() {
 if(session)return sessionPage();
 const due=dueRecords(state), stats=knowledgeStats(state).filter(k=>k.total).sort((a,b)=>a.rate-b.rate);
 return `${pageHeading('LEARN & REVIEW','不止记住答案，更要理解为什么。','按到期错题复习，或从一个薄弱知识点开始补齐。',`<button class="btn primary" data-action="start-due">${icon('learn')}开始今日复习 ${due.length?`· ${due.length} 题`:''}</button>`)}<div class="learning-banner"><div>${icon('refresh')}<span><strong>让复习自己往前走</strong><small>归档后第 1 天开始；标记掌握后依次按 2、4、7 天复测。仍需复习则回到 1 天后。</small></span></div><span class="interval-badges">${INTERVALS.map(n=>`<b>${n}<small>天</small></b>`).join('<i>·</i>')}</span></div><div class="subject-tabs"><button class="${learningMode==='questions'?'active':''}" data-learning-mode="questions">${icon('layers')}按错题学习</button><button class="${learningMode==='points'?'active':''}" data-learning-mode="points">${icon('map')}按知识点学习</button></div>
 ${learningMode==='questions'?`<section class="card"><div class="section-title"><h2>今日复习清单 <span class="count-pill">${due.length}</span></h2><span class="subtle">到期的排在前面</span></div>${due.length?`<div class="review-list">${due.map((r,i)=>reviewRow(r,i)).join('')}</div>`:empty('今天没有到期错题','可以继续学习其他题目，或按知识点补齐薄弱处。','switch-points','按知识点学习')}</section><section class="card spaced"><div class="section-title"><h2>接下来要温习的题</h2><span class="subtle">现在也可以提前学习</span></div><div class="review-list">${active().filter(r=>!due.some(d=>d.id===r.id)).sort((a,b)=>(a.nextReview||'9999').localeCompare(b.nextReview||'9999')).slice(0,8).map((r,i)=>reviewRow(r,i)).join('')||'<p class="subtle pad">暂无其他题目。</p>'}</div></section>`:`<div class="knowledge-grid">${stats.map(k=>knowledgeCard(k)).join('')||empty('还没有关联错题的知识点','先收录错题，再按知识点集中学习。')}</div>`}`;
}
function reviewRow(r,i) {
 return `<div class="review-row"><span class="row-number">${String(i+1).padStart(2,'0')}</span>${subjectBadge(r.subject)}<button class="review-row-title" data-record="${esc(r.id)}"><strong>${esc(r.title)}</strong><small>${esc(reasonLabel(r))} · ${esc(r.knowledgeIds.map(id=>state.knowledge.find(k=>k.id===id)?.name||'').join(' / '))}</small></button><span class="due-label ${r.nextReview&&r.nextReview<=today()?'is-due':''}">${dateLabel(r.nextReview)}</span><button class="btn small" data-study="${esc(r.id)}">开始学习 ${icon('arrow')}</button></div>`;
}
function startSession(ids) {
 const valid=ids.filter(id=>active().some(r=>r.id===id));
 if(!valid.length){toast('还没有可学习的错题，先录入一道吧。');go('learning');return;}
 session={ids:[...new Set(valid)],index:0,revealed:false,results:[]};closeModal();go('learning');
}
function sessionPage() {
 const r=state.records.find(r=>r.id===session.ids[session.index]);
 if(!r)return '';
 return `${pageHeading('FOCUS SESSION','给这道错题，再一次机会。','先独立回想解法，再对照答案，最后如实标记掌握情况。',`<button class="btn" data-action="end-session">结束本次学习</button>`)}<div class="session-progress"><span>本次学习 ${session.index+1} / ${session.ids.length}</span><div class="progress-track"><i style="width:${session.index/session.ids.length*100}%"></i></div></div><div class="study-layout"><section class="card study-card"><div class="tag-row"><span class="pill ${subjectClass(r.subject)}">${esc(r.subject)}</span><span class="pill">${esc(r.type)}</span><span class="pill">${esc(reasonLabel(r))}</span></div><h2>${esc(r.title)}</h2><p class="question-text">${esc(r.content)}</p>${r.photo?`<img class="original-photo" src="${esc(photoURL(r.photo))}" alt="原题照片">`:''}<label class="reflection-label">我的再次思考<textarea id="scratch-answer" rows="4" placeholder="试着写下关键步骤（仅在本次题目中暂存，不作为正式答案）…"></textarea></label>${!session.revealed?`<button class="btn primary full" data-action="reveal">我已思考，查看答案与解析 ${icon('down')}</button>`:`<div class="revealed-answer"><h3>${icon('check')}参考答案</h3><p class="prewrap">${esc(r.answer||'这道题还没有填写答案，可退出学习后编辑补充。')}</p><h3>解析与错因回顾</h3><p class="prewrap">${esc(r.analysis||'暂无解析，请结合原题与参考答案自行复盘。')}</p>${r.wrong?`<details><summary>回顾上次的错误答案</summary><p>${esc(r.wrong)}</p></details>`:''}</div><div class="grade-area"><p>现在，这道题你掌握了吗？</p><div><button class="btn" data-grade="again">${icon('refresh')}仍需复习 <small>1 天后再见</small></button><button class="btn primary" data-grade="mastered">${icon('check')}已掌握 <small>${r.stage+1>=4?'完成四轮巩固':`${INTERVALS[Math.min(r.stage+1,3)]} 天后复测`}</small></button></div></div>`}</section><aside class="study-aside"><section class="card"><div class="section-title"><h2>先补什么，再学什么</h2>${icon('map')}</div>${pathHtml(r.knowledgeIds)}</section><section class="card"><h3>一个小提醒</h3><p class="subtle">“做对过”和“真正掌握”之间，隔着几次独立回想。不要急着打勾，给自己一点消化的时间。</p><span class="small-label">学习状态会回写报告与复习计划</span></section></aside></div>`;
}
function grade(mastered) {
 const r=applyReview(state,session.ids[session.index],mastered);
 session.results.push({id:r.id,mastered});save();
 if(session.index+1<session.ids.length){session.index++;session.revealed=false;render();window.scrollTo(0,0);}
 else {const result=session.results;session=null;render();modal(`<div class="completion"><span class="completion-icon">${icon('leaf')}</span><span class="eyebrow">ONE STEP FORWARD</span><h2>认真复习，就有收获。</h2><p>本次完成 ${result.length} 道错题，${result.filter(r=>r.mastered).length} 道标记为已掌握。<br>新的复习日期已自动安排。</p><button class="btn primary" data-action="done-reports">查看更新后的学习报告 ${icon('arrow')}</button><button class="text-btn" data-action="close">继续留在学习中心</button></div>`);}
}
function knowledgeCard(k) {
 return `<article class="card knowledge-card"><div class="knowledge-card-top">${subjectBadge(k.subject)}<span>${esc(k.subject)}</span><span class="flex-space"></span><span class="rate-pill ${k.rate>=70?'good':''}">${k.rate}% 掌握</span></div><button class="knowledge-name" data-knowledge="${esc(k.id)}">${esc(k.name)} ${icon('arrow')}</button><p>${esc(k.explanation||'尚未补充讲解，可进入编辑。')}</p><div class="knowledge-meta"><span>${k.total} 道关联错题</span><span>${k.prerequisites.length} 个前置知识点</span></div><div class="progress-track"><i style="width:${k.rate}%"></i></div><div class="knowledge-card-actions"><button class="text-btn" data-knowledge="${esc(k.id)}">知识讲解与练习</button><button class="text-btn" data-study-knowledge="${esc(k.id)}">集中学习 ${icon('arrow')}</button></div></article>`;
}
function knowledgePage() {
 const stats=knowledgeStats(state).filter(k=>knowledgeSubject==='全部'||k.subject===knowledgeSubject);
 const used=stats.filter(k=>k.total>0);
 return `${pageHeading('KNOWLEDGE MAP','把零散的题，连成知识的网。','知识点之间有前置关系。沿着路径学习，找到真正卡住的那一步。',`<button class="btn" data-action="add-knowledge">${icon('plus')}新增知识点</button>`)}<div class="subject-tabs"><button class="${knowledgeSubject==='全部'?'active':''}" data-knowledge-subject="全部">全部学科</button>${SUBJECTS.filter(s=>state.knowledge.some(k=>k.subject===s)).map(s=>`<button class="${knowledgeSubject===s?'active':''}" data-knowledge-subject="${s}">${s}</button>`).join('')}</div><section class="card map-card"><div class="section-title"><h2>知识体系总图</h2><span class="subtle">从左到右沿前置关系推进 · 点击节点开始学习</span></div>${SUBJECTS.filter(s=>stats.some(k=>k.subject===s)).map(s=>{const nodes=stats.filter(k=>k.subject===s);const ordered=learningPath(state.knowledge,nodes.map(n=>n.id)).filter(k=>nodes.some(n=>n.id===k.id));return `<div class="map-subject"><div class="map-root ${subjectClass(s)}">${subjectBadge(s)}<strong>${s}</strong></div><div class="map-branches">${ordered.map(k=>{const st=stats.find(n=>n.id===k.id);return `<button class="map-node ${st.total&&st.rate<50?'weak':''}" data-knowledge="${esc(k.id)}"><small>${k.prerequisites.length?`${esc(k.prerequisites.map(id=>state.knowledge.find(n=>n.id===id)?.name).join(' + '))} →`:'基础起点'}</small><strong>${esc(k.name)}</strong><span>${st.total?`${st.total} 题 · ${st.rate}% 掌握`:'尚无关联错题'}</span></button>`;}).join('')}</div></div>`;}).join('')||empty('还没有知识点','新增知识点，并为它设置前置关系。','add-knowledge','新增知识点')}</section><div class="section-title outside"><h2>知识点学习卡 <span class="section-caption">${used.length} 个已关联错题</span></h2><span class="subtle">掌握度依据关联错题的当前学习状态计算</span></div><div class="knowledge-grid">${stats.map(k=>knowledgeCard(k)).join('')}</div>`;
}
function openKnowledge(id,practice=false) {
 const k=knowledgeStats(state).find(k=>k.id===id);if(!k)return;
 modal(`<div class="detail-heading"><div class="tag-row"><span class="pill ${subjectClass(k.subject)}">${esc(k.subject)}</span><span class="pill">${k.builtin?'内置知识库':'我的知识点'}</span><span class="rate-pill">${k.rate}% 掌握</span></div><h2>${esc(k.name)}</h2><p>${k.total} 道关联错题 · 从基础理解走向独立运用</p></div><div class="detail-content"><section><h3>知识点讲解</h3><p class="prewrap">${esc(k.explanation||'还没有讲解内容，点击编辑补充。')}</p></section>${k.example?`<section class="example-block"><h3>看一个例子</h3><p class="prewrap">${esc(k.example)}</p></section>`:''}<section><h3>前置关系与学习路径</h3>${pathHtml([id])}</section><section class="practice-block"><h3>相似题型训练 <span class="pill">${k.builtin?'内置题库':'自定义练习'}</span></h3>${k.exercise?`<p class="question-text">${esc(k.exercise)}</p><textarea rows="3" placeholder="先独立尝试，再查看解析…" aria-label="练习草稿"></textarea><details ${practice?'open':''}><summary>查看练习答案与解析</summary><div class="practice-solution"><strong>${esc(k.answer||'尚未填写答案')}</strong><p class="prewrap">${esc(k.solution||'尚未填写解析')}</p></div></details><small class="subtle">变式练习用于巩固理解。请回到关联错题标记掌握状态。</small>`:'<p class="subtle">这个知识点还没有练习题，可点击编辑补充。</p>'}</section>${k.total?`<section><h3>关联错题</h3><div class="linked-records">${k.records.map(r=>`<button data-record="${esc(r.id)}"><span>${esc(r.title)}</span>${badge(r)}${icon('chevron')}</button>`).join('')}</div></section>`:''}</div><div class="modal-footer"><button class="btn" data-edit-knowledge="${esc(id)}">${icon('edit')}编辑知识点</button><span class="flex-space"></span><button class="btn primary" data-study-knowledge="${esc(id)}">${icon('learn')}学习关联错题</button></div>`,true);
}
function reports() {
 const records=active(), mastered=records.filter(r=>r.status==='mastered').length;
 const logs=state.logs.filter(l=>l.date>=addDays(today(),1-reportDays));
 const stats=knowledgeStats(state).filter(k=>k.total).sort((a,b)=>a.rate-b.rate);
 const reasons=REASONS.map(reason=>({reason,count:records.filter(r=>r.reason===reason).length})).sort((a,b)=>b.count-a.count);
 const tomorrow=dueRecords(state,addDays(today(),1));
 return `${pageHeading('LEARNING INSIGHTS','看见进步，也看清下一步。','报告不是终点。点击每个知识点和错因，都能回到具体的题目。',`<div class="segmented"><button class="${reportDays===7?'active':''}" data-report-days="7">近 7 天</button><button class="${reportDays===14?'active':''}" data-report-days="14">近 14 天</button></div>`)}<section class="stats-grid report-stats">${[['累计学习',logs.length,'次','所选时段内的复习记录'],['标记掌握',logs.filter(l=>l.mastered).length,'次','本时段学习后的掌握反馈'],['当前掌握率',records.length?Math.round(mastered/records.length*100):0,'%','全部在册错题的当前状态'],['待继续巩固',records.length-mastered,'道','待学习与复习中的错题']].map(([label,value,unit,desc])=>`<div class="stat-card"><span class="stat-label">${label}</span><div class="stat-value">${value}<small>${unit}</small></div><p>${desc}</p></div>`).join('')}</section><div class="report-grid"><section class="card report-trend"><div class="section-title"><h2>学习趋势</h2><span class="subtle">每天完成的复习次数</span></div>${barChart(reportDays)}</section><section class="card cause-card"><div class="section-title"><h2>错因分布</h2><button class="text-btn" data-report-reason="待核对">固定 8 类${records.some(r=>r.reason===null)?` · ${records.filter(r=>r.reason===null).length} 题待核对`:''}</button></div><div class="cause-bars">${reasons.map(({reason,count})=>`<button data-report-reason="${reason}" aria-label="查看${reason}的${count}道题"><span>${reason}</span><div class="progress-track"><i style="width:${records.length?count/Math.max(1,...reasons.map(r=>r.count))*100:0}%"></i></div><b>${count}</b></button>`).join('')}</div></section></div><section class="card matrix-card"><div class="section-title"><h2>知识点掌握度矩阵</h2><button class="text-btn" data-nav="knowledge">查看知识体系总图 ${icon('arrow')}</button></div>${stats.length?`<div class="table-scroll"><table class="matrix-table"><thead><tr><th>知识点</th><th>学科</th><th>关联错题</th><th>已掌握</th><th>掌握程度</th><th>下一步</th></tr></thead><tbody>${stats.map(k=>`<tr><td><button class="text-link" data-knowledge="${esc(k.id)}">${esc(k.name)}</button></td><td>${k.subject}</td><td>${k.total}</td><td>${k.mastered}</td><td><div class="matrix-rate"><div class="progress-track"><i style="width:${k.rate}%"></i></div><span>${k.rate}%</span></div></td><td><button class="text-btn" data-study-knowledge="${esc(k.id)}">${k.rate<50?'优先补齐':'巩固复测'} ${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div>`:empty('报告会随着学习慢慢长出来','收录错题、完成复习，就能看到知识掌握情况。')}</section><section class="next-step"><div>${icon('spark')}<span><h2>明天，先做这两件事。</h2><p>${tomorrow.length?`复习 ${tomorrow.length} 道截至明天到期的错题（含尚未完成的题目）。`:'目前没有明天到期的错题，可温习近期新学内容。'}${stats[0]?`再温习「${esc(stats[0].name)}」，从前置知识点补起。`:'录入一道新错题，建立第一条学习路径。'}</p></span></div><button class="btn primary" data-action="learn-tomorrow">查看建议题单 ${icon('arrow')}</button></section>`;
}
function freshDraft(record=null) {
 draft=record?{...structuredClone(record),editing:true,saved:false}:{title:'',subject:'数学',content:'',source:'',type:'解答题',difficulty:2,photo:'',wrong:'',answer:'',analysis:'',reason:REASONS[0],knowledgeIds:[],nextReview:addDays(today(),1),editing:false,saved:false};draftStep=1;
}
function intake() {
 if(!draft)freshDraft();
 const d=draft;
 const stepNames=['留存题目','结构化分析','确认归档'];
 const reasonTips={概念不清:'先用自己的话解释概念，再对照适用条件；沿知识路径补齐前置基础。',知识遗忘:'回看关键定义与公式，尝试不看笔记复述，按 1/2/4/7 天巩固。',审题遗漏:'圈出所有已知条件与所求量，列出条件清单，再核对每个条件是否使用。',计算失误:'保留中间步骤，重点复核符号、括号和单位，最后将结果代回验证。',方法不当:'比较题目条件与方法的适用范围，先判断题型，再决定解法。',推理不严:'逐步写出依据，检查是否漏解、是否需要分类讨论，以及结论是否充分。',表达不规范:'写清符号含义、公式依据、关键步骤和单位，让每一步都可被核对。',时间不足:'先练习识别题型与关键条件，再分步限时训练，优先保证基础步骤准确。'};
 return `${pageHeading(d.editing?'EDIT MISTAKE':'CAPTURE & CONNECT',d.editing?'再完善一次，理解就更清晰。':'把这次出错，变成下一步方向。','保存原题，连接知识点，建立能继续推进的学习档案。',`<button class="btn" data-action="cancel-intake">返回错题档案</button>`)}<div class="intake-steps">${stepNames.map((name,i)=>`<div class="${draftStep===i+1?'active':draftStep>i+1?'complete':''}"><span>${draftStep>i+1?icon('check'):i+1}</span><strong>${name}</strong><small>${['照片与题干','知识点与错因','路径与首次复习'][i]}</small></div>`).join('')}</div>
 <form id="intake-form"><div class="intake-layout"><section class="card intake-card">${draftStep<3?ai.toolbar():''}
 ${draftStep===1?`<div class="section-title"><h2>01 · 留下这道题</h2><span class="subtle">粘贴题干，或用 OCR 从照片识别</span></div><div class="field"><label for="draft-title">题目标题 <small>可留空，自动取题干前 28 字</small></label><input id="draft-title" data-draft="title" value="${esc(d.title)}" maxlength="160" placeholder="例如：二次函数顶点与最值"></div><div class="form-grid"><div class="field"><label>所属学科</label><select data-draft="subject">${options(SUBJECTS,d.subject)}</select></div><div class="field"><label>题型</label><select data-draft="type">${options(['选择题','填空题','解答题'],d.type)}</select></div><div class="field"><label>难度</label><select data-draft="difficulty">${[[1,'基础'],[2,'中等'],[3,'挑战']].map(([v,l])=>`<option value="${v}" ${Number(d.difficulty)===v?'selected':''}>${l}</option>`).join('')}</select></div></div><div class="field"><label for="draft-content">题干 <em>*</em></label><textarea id="draft-content" data-draft="content" maxlength="30000" rows="7" placeholder="粘贴完整题干，保留已知条件与问题…">${esc(d.content)}</textarea><small>可粘贴题干，也可上传照片后点击 OCR 识别；识别结果支持修改。</small></div><div class="field"><label>原题照片 <small>可选 · JPG / PNG / WebP，1.5 MB 以内</small></label><div class="upload-zone" id="upload-zone">${d.photo?`<img src="${d.photo}" alt="已选择的原题照片"><div><button type="button" class="text-btn" data-action="replace-photo">更换照片</button><button type="button" class="text-btn danger-text" data-action="remove-photo">移除</button></div>`:`<label for="photo-input">${icon('image')}<strong>点击上传，或拖放照片到这里</strong><span>支持 OCR 识别，原图与题干一并保存</span></label>`}<input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp" hidden></div></div><div class="field"><label>题目来源</label><input data-draft="source" maxlength="200" value="${esc(d.source)}" placeholder="例如：数学期中测验 · 第 18 题"></div>`:
 draftStep===2?`<div class="section-title"><h2>02 · 找到真正卡住的一步</h2><span class="pill">${d.subject}</span></div><div class="field"><label>本题相关知识点 <em>*</em></label><p class="subtle">候选来自关键词匹配或已采用的 AI 建议。请核对，可多选、可手动补充。</p><div class="knowledge-picker">${state.knowledge.filter(k=>k.subject===d.subject).map(k=>`<button type="button" class="${d.knowledgeIds.includes(k.id)?'picked':''}" data-toggle-knowledge="${esc(k.id)}">${d.knowledgeIds.includes(k.id)?icon('check'):icon('plus')}${esc(k.name)}</button>`).join('')}</div><div class="add-point-row"><input id="manual-point" maxlength="80" placeholder="没有合适的？输入自定义知识点"><button type="button" class="btn small" data-action="draft-add-point">${icon('plus')}添加</button></div></div><div class="field"><label>主要错因 <em>*</em><small>固定分类，让报告能给出方向</small></label><div class="reason-picker">${REASONS.map((reason,i)=>`<button type="button" class="${d.reason===reason?'picked':''}" data-draft-reason="${reason}"><span>0${i+1}</span>${reason}${d.reason===reason?icon('check'):''}</button>`).join('')}</div></div><div class="tip-box">${icon('spark')}<span><strong>试试这样改进</strong>${reasonTips[d.reason]}</span></div><div class="answer-columns"><div class="field"><label>当时的答案</label><textarea data-draft="wrong" rows="3" maxlength="30000" placeholder="记录当时的思路或答案…">${esc(d.wrong)}</textarea></div><div class="field"><label>参考答案</label><textarea data-draft="answer" rows="3" maxlength="30000" placeholder="粘贴核对后的答案…">${esc(d.answer)}</textarea></div></div><div class="field"><label>错因分析与解析</label><textarea data-draft="analysis" maxlength="30000" rows="5" placeholder="具体哪一步出了问题？正确思路是什么？">${esc(d.analysis)}</textarea><small>可手动填写，也可点击“自动解题”生成答案与解析，核对后填入。</small></div>`:
 `<div class="section-title"><h2>03 · 一次归档，下一步也安排好</h2>${icon('check')}</div><div class="archive-summary"><span class="pill ${subjectClass(d.subject)}">${d.subject}</span><h2>${esc(d.title||d.content.slice(0,28))}</h2><p class="prewrap">${esc(d.content)}</p><div class="tag-row"><span class="reason-tag">${d.reason}</span>${d.knowledgeIds.map(id=>`<span class="pill">${esc(state.knowledge.find(k=>k.id===id)?.name)}</span>`).join('')}</div></div><section class="archive-path"><h3>自动生成的知识学习路径</h3>${pathHtml(d.knowledgeIds)}<p class="subtle">路径依据前置知识关系生成，与题目一同保存。</p></section><div class="schedule-confirm">${icon('clock')}<div><strong>${d.editing?'下一次复习日期':'首次复习，已经为你留好位置'}</strong><p>${d.editing?'可调整复习日期；留空表示暂不安排。':'默认明天开始，后续跟随学习反馈自动推进。'}</p></div><input type="date" data-draft="nextReview" value="${d.nextReview||''}" aria-label="下次复习日期"></div><div class="check-list"><span>${icon('check')}题干与原题照片</span><span>${icon('check')}知识点及前置路径</span><span>${icon('check')}固定错因与分析</span><span>${icon('check')}学习状态与复习日</span></div>${!d.answer?'<p class="inline-note">还没有填写参考答案；归档后可随时编辑补充。</p>':''}`}
 <div class="intake-footer"><button type="button" class="btn" data-action="${draftStep===1?'cancel-intake':'draft-back'}">${draftStep===1?'稍后再录':'上一步'}</button><span class="flex-space"></span><span class="subtle">第 ${draftStep} / 3 步</span><button type="submit" class="btn primary">${draftStep===3?(d.editing?'保存修改':'归档并加入复习'):'下一步'} ${icon(draftStep===3?'check':'arrow')}</button></div></section>
 <aside class="intake-aside"><section class="card"><span class="small-label">不是抄一遍，而是懂一次</span><h3>每道错题，留下四样东西。</h3><ol><li><strong>完整的原题</strong><p>保留条件，方便再次独立作答。</p></li><li><strong>明确的知识点</strong><p>从题目走向知识，也能从知识回到题目。</p></li><li><strong>具体的错因</strong><p>知道为什么错，才知道如何改。</p></li><li><strong>下一次复习</strong><p>不用靠想起来，按节奏再见一次。</p></li></ol></section><div class="local-reminder">${icon('shield')}<span>云端连接可用时，归档和学习结果自动同步；离线改动暂存本机，联网后继续同步。</span></div></aside></div></form>`;
}
function submitDraft() {
 if(ai.isBusy()){toast('识别或解题仍在进行，请等待结果或取消任务后再继续。','error');return;}
 if(draftStep===1){if(!draft.content.trim()){toast('请先粘贴题干，或用 OCR 识别照片。','error');$('#draft-content').focus();return;}if(!draft.title.trim())draft.title=draft.content.trim().slice(0,28);if(!draft.knowledgeIds.length)draft.knowledgeIds=suggestKnowledge(draft.content,draft.subject,state.knowledge);draftStep=2;renderMain();}
 else if(draftStep===2){if(!draft.knowledgeIds.length){toast('请至少选择或补充一个知识点。','error');return;}draftStep=3;renderMain();}
 else {
  const existing=draft.editing?state.records.find(r=>r.id===draft.id):null;
  const record={...draft,id:existing?.id||uid(),createdAt:existing?.createdAt||today(),updatedAt:today(),stage:existing?.stage||0,status:existing?.status||'new',nextReview:draft.nextReview||(draft.editing?null:addDays(today(),1)),archived:false,starred:!!existing?.starred,demo:false};
  delete record.editing;delete record.saved;if(draft.editing&&record.aiSource&&record.reason){record.aiSource={...record.aiSource,reviewed:true};}
  const nextState=structuredClone(state);
  if(existing)nextState.records[nextState.records.findIndex(r=>r.id===existing.id)]=record;else nextState.records.unshift(record);
  try {validateState(nextState);}catch(e){toast(e.message,'error');return;}
  state=nextState;const saved=save();draft.saved=true;draft=null;filters={subject:'全部',status:'全部',reason:'全部',q:'',sort:'recent',star:false};go('notebook');if(saved)toast(existing?'错题已更新，学习路径同步保存。':'归档完成，首次复习已加入计划。');
 }
 window.scrollTo(0,0);
}
function printPage() {
 const available=active().filter(r=>paper.subject==='全部'||r.subject===paper.subject);
 return `${pageHeading('PAPER & PRACTICE','把复习，变成一张可以动笔的卷子。','自动出题或逐题勾选，A4 练习卷与答案页分开。',`<button class="btn" data-action="reroll">${icon('refresh')}重新组题</button><button class="btn primary" data-action="print">${icon('print')}打印 / 保存 PDF</button>`)}<div class="print-layout"><aside class="paper-controls card"><div class="section-title"><h2>组卷设置</h2>${icon('settings')}</div><div class="field"><label>组题方式</label><select data-paper="strategy">${[['due','到期优先'],['weak','薄弱知识点优先'],['frequent','高频错因优先'],['random','随机抽题'],['manual','手动选择题目']].map(([v,l])=>`<option value="${v}" ${paper.strategy===v?'selected':''}>${l}</option>`).join('')}</select><small id="strategy-description">${{due:'按下次复习日期从早到晚选题，覆盖到期和即将复习的题。',weak:'按关联知识点的最低掌握度优先选题。',frequent:'先选当前错题本中出现次数最多的错因类别。',random:'从符合学科条件的错题中随机抽取，点击重新组题换一组。',manual:'勾选需要的题目，顺序按当前错题本排列。'}[paper.strategy]}</small></div><div class="field"><label>学科范围</label><select data-paper="subject">${options(['全部',...SUBJECTS],paper.subject)}</select></div>${paper.strategy!=='manual'?`<div class="field"><label>题目数量 <small>当前可用 ${available.length} 道</small></label><input type="number" data-paper="count" min="1" max="30" value="${paper.count}"></div>`:`<div class="manual-question-list">${available.map(r=>`<label><input type="checkbox" data-paper-id="${esc(r.id)}" ${paper.ids.includes(r.id)?'checked':''}><span>${esc(r.title)}<small>${r.subject} · ${r.reason}</small></span></label>`).join('')||'<p class="subtle">暂无题目</p>'}</div>`}<div class="field"><label>试卷标题</label><input data-paper="title" maxlength="60" value="${esc(paper.title)}"></div><div class="field"><label>作答空间</label><select data-paper="space">${[['compact','紧凑 · 约 2 cm'],['normal','适中 · 约 4 cm'],['large','宽裕 · 约 6 cm']].map(([v,l])=>`<option value="${v}" ${paper.space===v?'selected':''}>${l}</option>`).join('')}</select></div><label class="checkbox-label"><input type="checkbox" data-paper="answers" ${paper.answers?'checked':''}>附独立答案与解析页</label><div class="print-tip">${icon('print')}<p>纯白卷面、深色文字。打印时选择 A4，并关闭浏览器页眉页脚。</p></div><div class="paper-count" id="paper-count"></div></aside><section class="paper-preview"><div class="preview-topline"><span><i class="green-dot"></i>A4 卷面预览</span><span>210 × 297 mm</span></div><div id="paper-pages"></div></section></div>`;
}
function buildPaper(reselect=true) {
 if(view!=='print'||!$('#paper-pages'))return;
 const revision=++paperVersion;
 const records=reselect?selectPaper(state,paper):currentPaperIds.map(id=>state.records.find(r=>r.id===id)).filter(r=>r&&!r.archived);
 if(reselect)currentPaperIds=records.map(r=>r.id);
 const pages=$('#paper-pages');pages.innerHTML='';
 if(!records.length){pages.innerHTML=empty('当前没有可组卷的题目','录入错题，或调整学科与手动选择范围。','new','去录入错题');$('#paper-count').textContent='已选 0 道题';return;}
 let sequence=0;
 function newPage(answer=false) {
  const p=document.createElement('section');p.className='a4';sequence++;
  p.innerHTML=`<header class="paper-header"><span>知错 · ${answer?'答案与解析':'错题巩固练习'}</span><span>${today()}</span></header><h2>${esc(paper.title||'我的错题巩固练习')}${answer?' · 答案':''}</h2><div class="paper-meta">${answer?'独立答案页 · 请完成练习后再核对':`姓名：____________　日期：____________　共 ${records.length} 道题`}</div><div class="paper-body"></div><footer class="paper-footer"><span>${answer?'理解每一步，比记住答案更重要。':'独立思考，写下过程。'}</span><span>第 <b>${sequence}</b> 页</span></footer>`;
  pages.append(p);return p.querySelector('.paper-body');
 }
 function addContent(answer=false) {
  let body=newPage(answer), count=0;
  records.forEach((r,i)=>{
   const heading=`${i+1}. ${r.title} 〔${r.subject} · ${r.type}〕`;
   const text=answer?`参考答案：${r.answer||'尚未填写，请自行补充。'}\n\n解析：${r.analysis||'尚未填写。'}\n\n主要错因：${reasonLabel(r)}\n知识点：${r.knowledgeIds.map(id=>state.knowledge.find(k=>k.id===id)?.name||'').join('、')}`:r.content;
   const pieces=splitStudyText(text).map(x=>({text:x}));
   if(!answer&&r.photo)pieces.push({photo:r.photo});
   let block=null;
   function makeBlock(continuation=false){block=document.createElement('article');block.className='paper-question';block.innerHTML=`<h3>${esc(heading)}${continuation?'（续）':''}</h3>`;body.append(block);}
   if(count>=3||(!answer&&paper.space==='large'&&count>=2)){body=newPage(answer);count=0;}
   makeBlock();
   for(const piece of pieces){
    const part=document.createElement(piece.photo?'img':'p');
    if(piece.photo){part.src=piece.photo;part.alt='原题照片';}else {part.textContent=piece.text;part.className='paper-question-text';typesetMath(part);}
    block.append(part);
    if(body.scrollHeight>body.clientHeight+1){part.remove();if(block.children.length===1)block.remove();body=newPage(answer);count=0;makeBlock(true);block.append(part);}
   }
   if(!answer){const space=document.createElement('div');space.className=`answer-space ${paper.space}`;block.append(space);if(body.scrollHeight>body.clientHeight+1){space.remove();body=newPage(answer);count=0;makeBlock(true);block.append(space);}}
   count++;
  });
 }
 addContent(false);if(paper.answers)addContent(true);
 if(revision===paperVersion)$('#paper-count').textContent=`已选 ${records.length} 道题 · 共 ${sequence} 页${paper.answers?'（含独立答案）':''}`;
}
function trashPage() {
 const records=state.records.filter(r=>r.archived);
 return `${pageHeading('RECYCLE BIN','给暂时移走的题，留一个回来的位置。','恢复后保留原有知识关联、学习记录与复习日期。',`<button class="btn" data-nav="notebook">返回错题档案</button>`)}<section class="card">${records.length?`<div class="review-list">${records.map(r=>`<div class="review-row">${subjectBadge(r.subject)}<div class="review-row-title"><strong>${esc(r.title)}</strong><small>${r.createdAt} · ${r.subject}</small></div><button class="btn small" data-restore="${esc(r.id)}">恢复</button><button class="icon-btn danger-text" data-purge="${esc(r.id)}" aria-label="永久删除${esc(r.title)}">${icon('trash')}</button></div>`).join('')}</div>`:empty('回收站是空的','从错题档案移走的题目会先保存在这里。','nav-notebook','返回档案')}</section>`;
}
function knowledgeEditor(id=null) {
 editKnowledgeId=id;
 const k=state.knowledge.find(k=>k.id===id)||{name:'',subject:draft?.subject||'数学',prerequisites:[],explanation:'',example:'',exercise:'',answer:'',solution:'',keywords:[]};
 modal(`<div class="modal-heading"><span class="eyebrow">KNOWLEDGE EDITOR</span><h2>${id?'编辑':'新增'}知识点</h2><p>为知识点设置前置基础、讲解和相似题型，让学习路径真正有内容。</p></div><form id="knowledge-form"><div class="form-grid two"><div class="field"><label>知识点名称 *</label><input name="name" required maxlength="80" value="${esc(k.name)}"></div><div class="field"><label>学科</label><select name="subject">${options(SUBJECTS,k.subject)}</select></div></div><div class="field"><label>前置知识点 <small>先学这些，再学当前知识点</small></label><div class="prerequisite-picker">${state.knowledge.filter(n=>n.id!==id).map(n=>`<label><input type="checkbox" name="prerequisites" value="${esc(n.id)}" ${k.prerequisites.includes(n.id)?'checked':''}>${esc(n.name)}<small>${n.subject}</small></label>`).join('')}</div></div><div class="field"><label>关键词 <small>用于从题干匹配候选，逗号分隔</small></label><input name="keywords" value="${esc(k.keywords.join('，'))}" placeholder="例如：抛物线，顶点，二次函数"></div><div class="field"><label>知识点讲解</label><textarea name="explanation" rows="4" maxlength="30000">${esc(k.explanation)}</textarea></div><div class="field"><label>示例</label><textarea name="example" rows="2" maxlength="30000">${esc(k.example)}</textarea></div><div class="field"><label>相似题型训练</label><textarea name="exercise" rows="3" maxlength="30000">${esc(k.exercise)}</textarea></div><div class="field"><label>练习答案</label><textarea name="answer" rows="2" maxlength="30000">${esc(k.answer)}</textarea></div><div class="field"><label>练习解析</label><textarea name="solution" rows="3" maxlength="30000">${esc(k.solution)}</textarea></div><div class="modal-footer"><button type="button" class="btn" data-action="close">取消</button><button class="btn primary" type="submit">保存知识点 ${icon('check')}</button></div></form>`,true);
}
function settings() {
 const bytes=new Blob([JSON.stringify(state)]).size;
 modal(`<div class="modal-heading"><span class="eyebrow">MY LEARNING SPACE</span><h2>我的学习空间</h2><p>定一个小目标，再为自己的学习留一份备份。</p></div><form id="settings-form"><div class="field"><label>空间名称</label><input name="name" required maxlength="30" value="${esc(state.prefs.name)}"></div><div class="field"><label>每日学习目标 <small>1–50 道</small></label><input type="number" name="dailyGoal" min="1" max="50" required value="${state.prefs.dailyGoal}"></div><button class="btn primary full" type="submit">保存设置</button></form><div class="settings-storage"><h3>${icon('spark')}OCR 与大模型</h3><p class="subtle">选择解题模型、配置 API Key，并设置照片识别方式。</p><button class="btn" data-ai="settings">打开模型与 OCR 设置 ${icon('arrow')}</button></div><div class="settings-storage"><h3>${icon('shield')}数据与备份</h3><p>当前 ${state.records.length} 道题、${state.knowledge.length} 个知识点、${state.logs.length} 条学习记录。约 ${(bytes/1024).toFixed(0)} KB。</p><p class="subtle">已启用云端时，真实错题和学习记录会自动同步，本机保留缓存。也可导出 JSON 备份；云端原图通过工作台私有地址访问。</p><div class="inline-actions"><button class="btn" data-action="export">${icon('download')}导出备份</button><button class="btn" data-action="import">${icon('upload')}导入备份</button></div>${initialWarning?'<button class="text-btn" data-action="export-raw">导出无法读取的原始数据</button>':''}</div>${state.records.some(r=>r.demo)?`<div class="settings-demo"><h3>示例学习数据</h3><p class="subtle">清除预置题目和示例学习记录，保留你自行收录的题目与知识点。</p><button class="btn danger-text" data-action="clear-demo">清除示例数据</button></div>`:''}`);
}
function help() {
 modal(`<div class="modal-heading"><span class="eyebrow">HOW ZHICUO WORKS</span><h2>让下一次复习，不用靠想起来。</h2><p>根据你提供的文章《我用 WorkBuddy 做了个会自己推进的错题本》构建。</p></div><div class="help-flow"><span>录入</span>${icon('arrow')}<span>学习</span>${icon('arrow')}<span>报告</span>${icon('arrow')}<span>打印</span></div><div class="help-sections"><section><h3>01 · 录入，产生结构化档案</h3><p>上传原题照片，可用本地 OCR 或视觉模型识别题干，也可直接粘贴。知识点候选来自关键词匹配或 AI 解题结果，可增删和自定义；选择 8 类固定错因，核对答案与解析后归档。归档时保存知识前置路径，并默认安排 1 天后首次复习。</p></section><section><h3>02 · 学习，回写真实状态</h3><p>按错题（到期优先）或按知识点（掌握度优先）学习。查看讲解、路径和内置相似练习后，标记“已掌握”或“仍需复习”。掌握后依次在 2、4、7 天后复测，四轮后完成；仍需复习则回到 1 天后。</p></section><section><h3>03 · 报告，给出下一步</h3><p>趋势统计复习次数，当前掌握率依据错题状态，错因分布与知识矩阵均可点击回看原题。知识体系根据前置关系生成。建议题单包含截至明天到期且尚未完成的题。</p></section><section><h3>04 · 打印，完成线下复测</h3><p>支持到期优先、薄弱知识点优先、高频错因优先、随机抽题四种自动策略，以及逐题手动勾选。A4 练习卷与答案页分开，使用浏览器打印或保存 PDF。线下完成后，回到学习中心标记状态。</p></section><section><h3>当前版本的边界</h3><p>个人工作台，沿用本站 ChatGPT 访问权限；真实错题、原图和学习记录支持云端保存，本机保留缓存。手机 ChatGPT 首次连接知错应用后，可发送照片进行识别分析并自动归档。新增本地 OCR、视觉模型识别与自动解题。模型支持 OpenAI 兼容或 Anthropic 接口，API Key 仅保存在当前标签页会话；选择云端模型时，题干或照片会发送给所选服务商。本地 OCR 首次需要联网加载引擎和字库，手写与复杂公式请核对。AI 结果先预览再采用，不会自动标记已掌握。变式题来自可编辑的内置题库。没有关联错题的知识点不计入掌握率。示例数据可在首页或设置中清除。</p></section></div><div class="modal-footer"><button class="btn" data-action="export">${icon('download')}备份我的数据</button><button class="btn primary" data-action="close">开始使用 ${icon('arrow')}</button></div>`,true);
}
function resetFilters(){filters={subject:'全部',status:'全部',reason:'全部',q:'',sort:'due',star:false};}
function removeRecords(ids) {
 confirmDialog('将选中错题移入回收站？','题目会从学习清单和当前统计中移除，仍可在回收站恢复。',()=>{closeModal();commit(()=>{state.records.forEach(r=>{if(ids.includes(r.id))r.archived=true;});selected.clear();},'已移入回收站，可随时恢复。');},'移入回收站');
}
function exportBackup(raw=false) {
 const content=raw?localStorage.getItem(STORAGE_KEY):JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2);
 if(!content){toast('没有可导出的数据。','error');return;}
 const blob=new Blob([content],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=`知错${raw?'-原始数据':'-学习备份'}-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('备份已生成，请保存下载的 JSON 文件。');
}
async function readPhoto(file) {
 if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('请选择 JPG、PNG 或 WebP 图片。','error');return;}
 if(file.size>1.5*1024*1024){toast('照片请控制在 1.5 MB 以内，以便保存在浏览器。','error');return;}
 const target=draft;
 try{const result=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});if(draft&&draft===target){draft.photo=result;delete draft.ocrSource;renderMain();ai.onPhotoUploaded();}}catch{toast('照片读取失败，请重新选择。','error');}
}
function clearDemo(){
 confirmDialog('清除示例学习数据？','将删除预置的示例题目及其学习记录。你自己录入的题目、已有知识点和设置会保留。',()=>{closeModal();commit(()=>{const demoIds=new Set(state.records.filter(r=>r.demo).map(r=>r.id));state.records=state.records.filter(r=>!r.demo);state.logs=state.logs.filter(l=>!l.demo&&!demoIds.has(l.recordId));selected=new Set([...selected].filter(id=>!demoIds.has(id)));session=null;},'示例已清除，现在开始记录自己的学习。');},'清除示例');
}
function addDraftPoint(){
 const name=$('#manual-point')?.value.trim();if(!name){toast('先输入一个知识点名称。','error');return;}
 let k=state.knowledge.find(k=>k.name===name&&k.subject===draft.subject);
 if(!k){if(state.knowledge.length>=500){toast('本地版本最多支持 500 个知识点。','error');return;}k={id:uid(),name,subject:draft.subject,prerequisites:[],keywords:[name],explanation:'',example:'',exercise:'',answer:'',solution:'',builtin:false};state.knowledge.push(k);save();}
 if(!draft.knowledgeIds.includes(k.id))draft.knowledgeIds.push(k.id);renderMain();toast('知识点已添加，可在知识体系中补充前置关系与讲解。');
}
const actions={
 close:closeModal,
 confirm:()=>{const fn=confirmHandler;confirmHandler=null;fn?.();},
 menu:()=>{isMobileMenu=!isMobileMenu;render();},
 new:()=>{closeModal();if(draft&&!draft.saved&&draft.content.trim()){confirmDialog('继续上次尚未归档的题目？','填写的内容仍在本次页面中，可以继续完成归档。',()=>{closeModal();go('intake');},'继续录入');}else{freshDraft();go('intake');}},
 'cancel-intake':()=>navigate('notebook'),
 'draft-back':()=>{draftStep=Math.max(1,draftStep-1);renderMain();window.scrollTo(0,0);},
 'draft-add-point':addDraftPoint,
 'replace-photo':()=>$('#photo-input')?.click(),
 'remove-photo':()=>{ai.cancel();draft.photo='';delete draft.ocrSource;renderMain();},
 settings,help,
 search:()=>{closeModal();go('notebook');$('#filter-q')?.focus();},
 export:()=>exportBackup(),
 'export-raw':()=>exportBackup(true),
 import:()=>$('#import-file').click(),
 'clear-demo':clearDemo,
 'filter-star':()=>{filters.star=!filters.star;renderMain();},
 'reset-filters':()=>{resetFilters();render();},
 'start-due':()=>{const ids=dueRecords(state).map(r=>r.id);if(ids.length)startSession(ids);else {learningMode='points';go('learning');}},
 'switch-points':()=>{learningMode='points';renderMain();},
 'print-selected':()=>{paper.ids=[...selected].filter(id=>active().some(r=>r.id===id));paper.strategy='manual';paper.subject='全部';go('print');},
 'learn-selected':()=>startSession([...selected]),
 'delete-selected':()=>removeRecords([...selected]),
 'nav-notebook':()=>go('notebook'),
 'add-knowledge':()=>knowledgeEditor(),
 reveal:()=>{const answer=$('#scratch-answer')?.value||'';session.revealed=true;renderMain();if($('#scratch-answer'))$('#scratch-answer').value=answer;},
 'end-session':()=>confirmDialog('结束本次学习？','已标记的学习结果已经保存，当前尚未标记的题目保持原状态。',()=>{session=null;closeModal();render();},'结束学习'),
 'done-reports':()=>{closeModal();go('reports');},
 'learn-tomorrow':()=>{const ids=dueRecords(state,addDays(today(),1)).map(r=>r.id);if(ids.length)startSession(ids);else {go('learning');toast('目前没有截至明天到期的题目，可按知识点温习。');}},
 reroll:()=>buildPaper(),
 print:()=>{if(!$('#paper-pages .a4')){toast('请先选择至少一道题。','error');return;}closeModal();window.print();}
};
document.addEventListener('click',event=>{
 const el=event.target.closest('button,a,[data-action]');if(!el)return;
 const d=el.dataset;
 if(d.action){event.preventDefault();actions[d.action]?.();return;}
 if(d.nav){event.preventDefault();closeModal();if(d.nav==='notebook'&&view!=='notebook')resetFilters();navigate(d.nav);return;}
 if(d.subject){resetFilters();navigate('notebook',d.subject);return;}
 if(d.record){openRecord(d.record);return;}
 if(d.knowledge){openKnowledge(d.knowledge);return;}
 if(d.star){commit(()=>{const r=state.records.find(r=>r.id===d.star);if(r)r.starred=!r.starred;});return;}
 if(d.study){startSession([d.study]);return;}
 if(d.edit){const r=state.records.find(r=>r.id===d.edit);if(r){closeModal();freshDraft(r);go('intake');}return;}
 if(d.delete){removeRecords([d.delete]);return;}
 if(d.restore){commit(()=>{const r=state.records.find(r=>r.id===d.restore);if(r)r.archived=false;},'题目已恢复，原有学习记录保留。');return;}
 if(d.purge){confirmDialog('永久删除这道错题？','原题、照片以及这道题的学习记录都将删除，无法从回收站恢复。',()=>{closeModal();commit(()=>{state.records=state.records.filter(r=>r.id!==d.purge);state.logs=state.logs.filter(l=>l.recordId!==d.purge);},'题目已永久删除。');},'永久删除',true);return;}
 if(d.learningMode){learningMode=d.learningMode;renderMain();return;}
 if(d.studyKnowledge){const records=active().filter(r=>r.knowledgeIds.includes(d.studyKnowledge)).sort((a,b)=>(a.nextReview||'9999').localeCompare(b.nextReview||'9999'));if(!records.length){toast('这个知识点还没有关联错题，可先阅读讲解与练习。');openKnowledge(d.studyKnowledge);return;}startSession(records.map(r=>r.id));return;}
 if(d.knowledgeSubject){knowledgeSubject=d.knowledgeSubject;renderMain();return;}
 if(d.editKnowledge){knowledgeEditor(d.editKnowledge);return;}
 if(d.reportDays){reportDays=Number(d.reportDays);renderMain();return;}
 if(d.reportReason){resetFilters();filters.reason=d.reportReason;go('notebook');return;}
 if(d.draftReason){draft.reason=d.draftReason;if(draft.captureSource)draft.captureSource.needsReview=false;renderMain();return;}
 if(d.toggleKnowledge){const i=draft.knowledgeIds.indexOf(d.toggleKnowledge);if(i>=0)draft.knowledgeIds.splice(i,1);else draft.knowledgeIds.push(d.toggleKnowledge);renderMain();return;}
 if(d.grade&&session?.revealed){el.disabled=true;grade(d.grade==='mastered');}
});
document.addEventListener('input',event=>{
 const el=event.target,d=el.dataset;
 if(d.draft&&draft)draft[d.draft]=d.draft==='difficulty'?Number(el.value):el.value;
 if(el.id==='filter-q'){
  const pos=el.selectionStart;filters.q=el.value;renderMain();$('#filter-q').focus();$('#filter-q').setSelectionRange(pos,pos);
 }
 if(d.paper&&['title','count'].includes(d.paper)){
  paper[d.paper]=d.paper==='count'?Math.max(1,Math.min(30,Number(el.value)||1)):el.value;buildPaper();
 }
});
document.addEventListener('change',event=>{
 const el=event.target,d=el.dataset;
 if(d.filter){filters[d.filter]=el.value;renderMain();return;}
 if(d.draft==='subject'&&draft){draft.subject=el.value;draft.knowledgeIds=[];return;}
 if(d.select){if(el.checked)selected.add(d.select);else selected.delete(d.select);renderMain();return;}
 if(el.hasAttribute('data-select-all')){filteredRecords().forEach(r=>el.checked?selected.add(r.id):selected.delete(r.id));renderMain();return;}
 if(el.id==='photo-input'){readPhoto(el.files?.[0]);return;}
 if(d.paperId){if(el.checked&&!paper.ids.includes(d.paperId))paper.ids.push(d.paperId);else if(!el.checked)paper.ids=paper.ids.filter(id=>id!==d.paperId);buildPaper();return;}
 if(d.paper){paper[d.paper]=el.type==='checkbox'?el.checked:d.paper==='count'?Number(el.value):el.value;if(['strategy','subject'].includes(d.paper))renderMain();else buildPaper();return;}
 if(el.id==='import-file'){
  const file=el.files?.[0];el.value='';if(!file)return;
  if(file.size>8*1024*1024){toast('备份文件请控制在 8 MB 以内。','error');return;}
  file.text().then(text=>{
   try{importCandidate=validateState(JSON.parse(text));confirmDialog('用备份恢复学习空间？',`已检查：${importCandidate.records.length} 道题、${importCandidate.knowledge.length} 个知识点、${importCandidate.logs.length} 条记录。导入会替换当前数据，建议先导出当前备份。`,()=>{try{localStorage.setItem(storageKey,JSON.stringify(importCandidate));}catch{toast('空间不足，未导入。当前数据保持原样。','error');return;}state=importCandidate;importCandidate=null;selected.clear();session=null;draft=null;initialWarning='';closeModal();resetFilters();go('dashboard');toast('备份恢复完成，知识关系与复习计划已保留。');},'确认替换并恢复');}catch(e){toast(`导入失败：${e.message}`,'error');}
  }).catch(()=>toast('文件读取失败，请重新选择。','error'));
 }
});
document.addEventListener('submit',event=>{
 event.preventDefault();const form=event.target;
 if(form.id==='intake-form'){submitDraft();return;}
 if(form.id==='settings-form'){const values=new FormData(form);state.prefs.name=values.get('name').trim()||'我的学习空间';state.prefs.dailyGoal=Math.max(1,Math.min(50,Number(values.get('dailyGoal'))||6));closeModal();commit(()=>{},'学习目标已更新。');return;}
 if(form.id==='knowledge-form'){
  const values=new FormData(form),old=state.knowledge.find(k=>k.id===editKnowledgeId);
  const k={id:old?.id||uid(),name:values.get('name').trim(),subject:values.get('subject'),prerequisites:values.getAll('prerequisites'),keywords:values.get('keywords').split(/[,，、]/).map(x=>x.trim()).filter(Boolean),explanation:values.get('explanation').trim(),example:values.get('example').trim(),exercise:values.get('exercise').trim(),answer:values.get('answer').trim(),solution:values.get('solution').trim(),builtin:!!old?.builtin};
  if(!k.name){toast('请填写知识点名称。','error');return;}
  if(state.knowledge.some(n=>n.id!==k.id&&n.name===k.name&&n.subject===k.subject)){toast('同学科已有这个知识点，请编辑已有条目。','error');return;}
  const next=state.knowledge.filter(n=>n.id!==k.id).concat(k);
  try{learningPath(next,next.map(n=>n.id));}catch(e){toast(e.message,'error');return;}
  if(next.length>500){toast('本地版本最多支持 500 个知识点。','error');return;}
  state.knowledge=next;closeModal();commit(()=>{},'知识点与前置关系已保存。');
 }
});
document.addEventListener('keydown',event=>{
 if(event.key==='Enter'&&event.target.id==='manual-point'){event.preventDefault();addDraftPoint();}
});
document.addEventListener('dragover',event=>{if(event.target.closest('#upload-zone')){event.preventDefault();event.target.closest('#upload-zone').classList.add('dragging');}});
document.addEventListener('dragleave',event=>event.target.closest('#upload-zone')?.classList.remove('dragging'));
document.addEventListener('drop',event=>{if(event.target.closest('#upload-zone')){event.preventDefault();readPhoto(event.dataTransfer.files[0]);}});
$('#dialog').addEventListener('click',event=>{if(event.target===$('#dialog')){const rect=$('#dialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeModal();}});
window.addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(['dashboard','notebook','intake','learning','knowledge','reports','print','ai','cloud','trash','account','admin'].includes(v.split('?')[0])){view=v.split('?')[0];if(account.isAuthenticated()&&initialized)render();}});
window.addEventListener('beforeprint',()=>{if(view==='print')buildPaper(false);});
window.addEventListener('storage',event=>{
 if(event.key===storageKey&&event.newValue){try{state=validateState(JSON.parse(event.newValue));selected.clear();session=null;render();toast('已载入另一标签页更新的学习数据。');}catch{toast('另一标签页的数据暂时无法读取，请导入备份。','error');}}
});
const account=createAccountUI({esc,icon,render,toast,modal,closeModal,confirmDialog,onReady:initializeAccount,onExit:async()=>{await cloud?.sync();await cloud?.stop();}});
function accountSpacesOptions(){return account.workspaces.map(w=>`<option value="${esc(w.id)}" ${w.id===account.workspace.id?'selected':''}>${esc(w.name)} · ${{owner:'拥有者',editor:'可编辑',viewer:'只读'}[w.role]}</option>`).join('');}
document.addEventListener('change',event=>{if(event.target.id==='active-space')account.selectSpace(event.target.value).catch(e=>toast(e.message,'error'));});
// Stop mutation controls before their individual handlers run in a read-only space.
document.addEventListener('click',event=>{if(!account.isReadonly())return;const el=event.target.closest('button,[data-action]');if(!el)return;const d=el.dataset;const actions=new Set(['new','save-draft','add-knowledge','confirm-import','load-demo','reset-data','clear-trash','import','delete-selected','clear-demo']);if(actions.has(d.action)||d.edit||d.delete||d.purge||d.restore||d.star||d.grade||d.editKnowledge||d.ai&&['apply','pipeline','solve'].includes(d.ai)){event.preventDefault();event.stopImmediatePropagation();toast('当前空间为只读，无法修改。','error');}},true);
document.addEventListener('submit',event=>{if(account.isReadonly()&&['intake-form','knowledge-form','ai-result-form'].includes(event.target.id)){event.preventDefault();event.stopImmediatePropagation();toast('当前空间为只读，无法修改。','error');}},true);
render();void account.start();
