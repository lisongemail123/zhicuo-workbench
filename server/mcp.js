import { workspaceContext,migrateLegacy,userWorkspaces } from './accounts.js';
import { archiveFromChatGPT,allEntities,getEntity,cloudReady,readBounded } from './cloud-store.js';
import { SUBJECTS,REASONS } from '../dist/model.js';

const fileSchema={type:'object',properties:{download_url:{type:'string',description:'由 ChatGPT 文件参数机制提供的临时下载地址，不要猜测或编造'},file_id:{type:'string'},mime_type:{type:'string'},file_name:{type:'string'}},required:['download_url','file_id'],additionalProperties:false};
const pointSchema={type:'object',properties:{name:{type:'string',maxLength:80},explanation:{type:'string',maxLength:5000},prerequisites:{type:'array',items:{type:'string'},maxItems:8}},required:['name'],additionalProperties:false};
const mistakeSchema={type:'object',properties:{title:{type:'string',maxLength:160},content:{type:'string',maxLength:30000},subject:{type:'string',enum:SUBJECTS},type:{type:'string',enum:['选择题','填空题','解答题']},difficulty:{type:'integer',enum:[1,2,3]},wrong:{type:'string',description:'照片中可见的学生错误答案；未提供时留空，不编造'},answer:{type:'string',maxLength:30000,description:'参考答案；条件不完整时明确说明无法确定'},analysis:{type:'string',maxLength:30000,description:'面向学生的分步讲解、关键依据及有证据的错因分析'},reason:{type:['string','null'],enum:[...REASONS,null],description:'只有能从原错解判断时选择，否则传 null，标记待核对'},knowledgePoints:{type:'array',items:pointSchema,minItems:1,maxItems:12},needsReview:{type:'boolean',description:'有模糊题干、缺少条件或其他未确定内容时为 true'}},required:['content','subject','answer','analysis','knowledgePoints'],additionalProperties:false};
const readAnnotations={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
export const MCP_TOOLS=[
 {name:'get_capture_status',title:'查看知错手机归档状态',description:'读取个人错题本云端状态、支持学科和手机拍照归档流程。用户在知错应用对话中发来题目照片时，先识别题干、分析知识点和错误原因，再调用 archive_mistakes 保存原图与结构化结果。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:readAnnotations},
 {name:'archive_mistakes',title:'拍照分析并归档错题',description:'将用户在知错应用对话中发送的原始题目照片与已完成的结构化分析一起保存到个人云端错题本。用户的目标是拍照后自动识别、解答、分类并归档，通常无需再次询问是否归档。调用前由 ChatGPT 根据图片转写题干、生成答案和分步解析、提取知识点，并在有原错解证据时选择错因；不清楚处标待核对。原始照片通过 photo 文件参数传入，不能用虚构下载地址。每张照片可含 1–20 道题，按图片中顺序放入 mistakes。成功后会返回可回看的工作台链接和下一次复习日期；同一照片重试不会重复归档。',inputSchema:{type:'object',properties:{photo:fileSchema,mistakes:{type:'array',items:mistakeSchema,minItems:1,maxItems:20}},required:['photo','mistakes'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:true},_meta:{'openai/fileParams':['photo'],'openai/toolInvocation/invoking':'正在保存原图与错题分析','openai/toolInvocation/invoked':'错题已归档并安排复习'}},
 {name:'search_mistakes',title:'查找个人错题',description:'按学科或关键词查询已归档错题，可用于去重、回顾与复习。',inputSchema:{type:'object',properties:{subject:{type:'string',enum:SUBJECTS},query:{type:'string',maxLength:200},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false},annotations:readAnnotations},
 {name:'get_mistake',title:'回看错题与解析',description:'读取一条已归档错题的原题、答案、错因、知识点、原图链接与复习日期。',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},annotations:readAnnotations}
];
for(const tool of MCP_TOOLS)tool.inputSchema.properties.workspace_id={type:'string',description:'可选：已授权的共享空间 ID；默认保存到当前账号的个人空间'};
const content=data=>({content:[{type:'text',text:JSON.stringify(data)}]});
const summary=(record,origin)=>({id:record.id,title:record.title,subject:record.subject,reason:record.reason||'待核对',status:record.status,nextReview:record.nextReview,needsReview:!!record.captureSource?.needsReview,photo_saved:!!record.photo,url:origin+'/#notebook'});
export async function executeMCPTool(name,args,env,origin,options={}){
 if(!cloudReady(env))throw new Error('云端归档尚未配置完成');
 if(name==='get_capture_status'){
  const rows=await allEntities(env,'records');return {ready:true,workspace_id:env.WORKSPACE_ID,archived_count:rows.filter(e=>!e.deleted&&!e.payload.archived).length,subjects:SUBJECTS,photo_archive:true,workflow:'在手机 ChatGPT 选择已连接的知错应用，拍照并发送。由 ChatGPT 识别、解题与分类后调用 archive_mistakes，自动保留原图并归档。看不清或无法判断的内容标记待核对。',workbench_url:origin};
 }
 if(name==='archive_mistakes'){
  const result=await archiveFromChatGPT(env,args,options);
  return {archived_count:result.records.length-result.duplicateCount,duplicate_count:result.duplicateCount,photo_saved:result.photoSaved,records:result.records.map(r=>summary(r,origin)),message:'已保存到云端，原图、题干、知识点、答案与解析一同归档；首次复习默认安排在明天。未确定的错因保留为待核对。'};
 }
 if(name==='search_mistakes'){
  const rows=await allEntities(env,'records'),query=String(args.query||'').trim().toLowerCase();
  const records=rows.filter(e=>!e.deleted&&!e.payload.archived).map(e=>e.payload).filter(r=>(!args.subject||r.subject===args.subject)&&(!query||[r.title,r.content,r.analysis].join(' ').toLowerCase().includes(query))).slice(0,Math.max(1,Math.min(50,Number(args.limit)||20)));
  return {records:records.map(r=>summary(r,origin)),count:records.length};
 }
 if(name==='get_mistake'){const entity=await getEntity(env,'records',String(args.id||''));if(!entity||entity.deleted)throw new Error('未找到这道错题');return {record:entity.payload,photo_url:entity.payload.photo?origin+entity.payload.photo+'?workspace='+encodeURIComponent(env.WORKSPACE_ID):null,workbench_url:origin+'/#notebook'};}
 throw new Error('工具不存在');
}
export async function handleMCP(request,env,options={}){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
 let body;
 try{body=JSON.parse(new TextDecoder().decode(await readBounded(request.body,12*1024*1024)));}catch{return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}},{status:400});}
 const id=body?.id??null,respond=result=>Response.json({jsonrpc:'2.0',id,result},{headers:{'Cache-Control':'no-store'}});
 if(body.method==='notifications/initialized')return new Response(null,{status:202});
 if(body.method==='server/discover')return respond({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(body.method==='initialize')return respond({protocolVersion:body.params?.protocolVersion==='2026-07-28'?'2026-07-28':'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'知错 · 拍照归档',version:'4.0.0'},instructions:'用户在知错对话中发来题目照片时，识别题干、解题、按学科/知识点/错因分类，并调用 archive_mistakes 保存原图和结构化结果。不能确定的内容标为待核对，不编造学生原始错解。'});
 if(body.method==='ping')return respond({});
 if(body.method==='tools/list')return respond({tools:MCP_TOOLS});
 if(body.method==='tools/call'){
  try{const context=await workspaceContext(request,env,{write:body.params?.name==='archive_mistakes',siteOnly:true,workspaceId:body.params?.arguments?.workspace_id});await migrateLegacy(env,context.user);const result=await executeMCPTool(body.params?.name,body.params?.arguments||{},context.env,new URL(request.url).origin,options);if(body.params?.name==='get_capture_status'){result.account={id:context.user.id,displayName:context.user.display_name,role:context.user.role};result.workspaces=await userWorkspaces(env,context.user.id);}return respond(content(result));}catch(e){return respond({isError:true,content:[{type:'text',text:e.message||'归档处理失败，请重试'}]});}
 }
 return Response.json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}},{headers:{'Cache-Control':'no-store'}});
}
