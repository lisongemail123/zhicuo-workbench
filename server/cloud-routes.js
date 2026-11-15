import { workspaceContext,json,assertSameOrigin } from './accounts.js';
import { cloudReady,CLOUD_KINDS,validId,listEntities,writeEntity,normalizeCloudEntity,knowledgePool,readBounded,getEntity,removeUnusedPhoto } from './cloud-store.js';
export async function handleCloudRequest(request,env){
 try{
 const context=await workspaceContext(request,env,{write:request.method==='POST'});env=context.env;
 const url=new URL(request.url);
 if(url.pathname==='/api/cloud/status')return json({configured:cloudReady(env),storage:'cloud',chatgpt:true,photoLimitMb:12,workspaceId:context.workspace.id,role:context.workspace.role});
 if(!cloudReady(env))return json({error:'云端数据库或文件存储尚未配置'},503);
 const fileMatch=url.pathname.match(/^\/api\/files\/(photo-[a-f0-9]{64})$/);
 if(fileMatch){
  if(!['GET','HEAD'].includes(request.method))return json({error:'不支持的请求'},405);
  const file=await env.DB.prepare('SELECT * FROM workspace_photos WHERE workspace_id=? AND id=?').bind(env.WORKSPACE_ID,fileMatch[1]).first();if(!file)return json({error:'原图不存在'},404);
  const object=await env.BUCKET.get(file.storage_key);if(!object)return json({error:'原图不存在'},404);
  return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':file.mime_type,'Content-Length':String(file.byte_length),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(url.pathname==='/api/cloud/entities'&&request.method==='GET'){
  const kind=url.searchParams.get('kind');if(!CLOUD_KINDS.includes(kind))return json({error:'同步类型无效'},400);
  const offset=Math.max(0,Number.parseInt(url.searchParams.get('offset')||'0')||0),entities=await listEntities(env,kind,offset,100);
  return json({entities,nextOffset:entities.length===100?offset+100:null});
 }
 if(url.pathname==='/api/cloud/sync'&&request.method==='POST'){
  assertSameOrigin(request);
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'请使用 JSON 请求'},415);
  try{
   const body=JSON.parse(new TextDecoder().decode(await readBounded(request.body,12*1024*1024)));
   if(!Array.isArray(body.changes)||body.changes.length>50)throw new Error('每次同步最多 50 个条目');
   let pool=await knowledgePool(env);const results=[];
   // Knowledge is sent before questions and questions before learning records.
   for(const change of body.changes){
    if(!CLOUD_KINDS.includes(change.kind)||!validId(change.id))throw new Error('条目无效');
    if(change.payload?.demo)throw new Error('示例学习数据不会上传到云端');
    const before=change.kind==='records'&&change.deleted?await getEntity(env,'records',change.id):null;
    const payload=change.deleted?{}:await normalizeCloudEntity(env,change.kind,{...change.payload,id:change.id},pool);
    const result=await writeEntity(env,{...change,payload,deleted:!!change.deleted});results.push(result);
    if(result.accepted&&before?.payload?.photo)await removeUnusedPhoto(env,before.payload.photo);
    if(result.accepted&&change.kind==='knowledge')pool=change.deleted?pool.filter(k=>k.id!==change.id):pool.filter(k=>k.id!==change.id).concat(result.entity.payload);
   }
   return json({results});
  }catch(e){return json({error:e.message||'同步失败'},400);}
 }
 return json({error:'请求不存在'},404);
 }catch(e){return json({error:e.status?e.message:'云端服务暂时不可用'},e.status||500);}
}
