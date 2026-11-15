import { digest,readBounded } from './cloud-store.js';

export class APIError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const now=()=>new Date().toISOString();
export const randomToken=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
export const hashToken=token=>digest(new TextEncoder().encode(token));
export function json(data,status=200,headers={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
export function safeUser(row){return {id:row.id,username:row.username,displayName:row.display_name,email:row.email,role:row.role,status:row.status,hasPassword:!!row.password_hash,chatgptLinked:!!row.site_user_id,createdAt:row.created_at};}
export function assertSameOrigin(request){const origin=request.headers.get('origin');if(origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')throw new APIError('请从本站页面提交操作',403);}
export async function readJSON(request){if(!request.headers.get('content-type')?.includes('application/json'))throw new APIError('请使用 JSON 请求',415);try{return JSON.parse(new TextDecoder().decode(await readBounded(request.body,32*1024)));}catch{throw new APIError('请求内容无效或过大');}}
export function usernameOf(value){const username=String(value||'').trim().toLowerCase();if(!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username))throw new APIError('用户名需为 3–40 位字母、数字、点、下划线或短横线');return username;}
export function checkPassword(password){if(typeof password!=='string'||password.length<10||password.length>128)throw new APIError('密码需为 10–128 个字符');return password;}
export async function passwordHash(password,salt=crypto.getRandomValues(new Uint8Array(16))){
 checkPassword(password);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256);return `pbkdf2-sha256$100000$${hex(salt)}$${hex(new Uint8Array(bits))}`;
}
export async function verifyPassword(password,stored){
 if(typeof password!=='string'||password.length>128)return false;
 const parts=String(stored||'').split('$');if(parts.length!==4||parts[0]!=='pbkdf2-sha256'||parts[1]!=='100000'||!/^[a-f0-9]{32}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))return false;
 if(password.length<10)return false;const salt=Uint8Array.from(parts[2].match(/../g),x=>parseInt(x,16)),actual=await passwordHash(password,salt);let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^stored.charCodeAt(i);return diff===0;
}
export const sessionCookie=(request,value,maxAge=1209600)=>`zhicuo_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
export function cookie(request,name){const match=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return match?match.slice(name.length+1):'';}
export async function audit(env,actor,action,target){await env.DB.prepare('INSERT INTO audit_logs (id,actor_id,action,target,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,String(target).slice(0,200),now()).run();}
export async function rateLimit(env,request,action,identifier=''){
 const ip=request.headers.get('cf-connecting-ip')||'local';const key=await hashToken(`${action}:${ip}:${identifier}`),at=now(),expires=new Date(Date.now()+15*60*1000).toISOString();
 await env.DB.prepare('INSERT INTO auth_limits (key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_limits.expires_at<? THEN 1 ELSE auth_limits.attempts+1 END,expires_at=CASE WHEN auth_limits.expires_at<? THEN excluded.expires_at ELSE auth_limits.expires_at END').bind(key,expires,at,at).run();
 const row=await env.DB.prepare('SELECT attempts FROM auth_limits WHERE key=?').bind(key).first();if(row.attempts>20)throw new APIError('尝试次数较多，请 15 分钟后重试',429);
}
export async function createUser(env,{username=null,password=null,displayName,email='',siteUserId=null,role='user'}){
 const id=crypto.randomUUID(),at=now(),workspace='personal-'+id,hash=password?await passwordHash(password):null;
 await env.DB.batch([
  env.DB.prepare('INSERT INTO users (id,username,display_name,email,password_hash,site_user_id,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,\'active\',?,?)').bind(id,username,String(displayName||username||'学习者').slice(0,60),String(email).slice(0,160),hash,siteUserId,role,at,at),
  env.DB.prepare('INSERT INTO workspaces (id,owner_id,name,personal,created_at) VALUES (?,?,?,1,?)').bind(workspace,id,'我的个人错题本',at),
  env.DB.prepare('INSERT INTO workspace_members (workspace_id,user_id,role,created_at) VALUES (?,?,\'owner\',?)').bind(workspace,id,at)
 ]);return env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
}
export async function startSession(env,user,request){
 const token=randomToken();await env.DB.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').bind(await hashToken(token),user.id,new Date(Date.now()+14*86400000).toISOString(),now()).run();
 // Remove expired sessions in bounded batches.
 await env.DB.prepare('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at<? LIMIT 100)').bind(now()).run();
 return sessionCookie(request,token);
}
export async function resolveUser(request,env,{siteOnly=false,ignoreSignedOut=false}={}){
 let user=null;
 const token=siteOnly?'':cookie(request,'zhicuo_session');
 if(token&&token!=='signed-out')user=await env.DB.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').bind(await hashToken(token),now()).first();
 if(!user&&env.TRUST_SITE_IDENTITY&&(!token||siteOnly||ignoreSignedOut)){
  const siteId=request.headers.get('oai-authenticated-user-id');
  if(siteId){
   user=await env.DB.prepare('SELECT * FROM users WHERE site_user_id=?').bind(siteId).first();
   if(!user){
    const email=request.headers.get('oai-authenticated-user-email')||'';
    let name=request.headers.get('oai-authenticated-user-full-name')||email.split('@')[0]||'学习者';try{if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8')name=decodeURIComponent(name);}catch{}
    // Only the platform-verified owner's email can bootstrap the hosted administrator.
    const role=env.ADMIN_EMAIL&&email.toLowerCase()===env.ADMIN_EMAIL.toLowerCase()?'admin':'user';
    if(role!=='admin'&&(await env.DB.prepare("SELECT value FROM app_settings WHERE key='registration_open'").first())?.value==='false')throw new APIError('当前已关闭新用户注册，请联系管理员',403);
    try{user=await createUser(env,{displayName:name,email,siteUserId:siteId,role});}catch(e){user=await env.DB.prepare('SELECT * FROM users WHERE site_user_id=?').bind(siteId).first();if(!user)throw e;}
   }
   const verifiedEmail=request.headers.get('oai-authenticated-user-email')||'';
   if(user.role==='admin'&&env.ADMIN_EMAIL&&verifiedEmail.toLowerCase()===env.ADMIN_EMAIL.toLowerCase())await env.DB.prepare("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('hosted_owner_user_id',?)").bind(user.id).run();
  }
 }
 if(!user)throw new APIError('请先登录账号',401);if(user.status!=='active')throw new APIError('账号已停用，请联系管理员',403);return user;
}
export async function userWorkspaces(env,userId){return (await env.DB.prepare('SELECT w.id,w.name,w.personal,w.owner_id,m.role,w.created_at FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.personal DESC,w.created_at').bind(userId).all()).results;}
export async function workspaceContext(request,env,{write=false,siteOnly=false,workspaceId=null}={}){
 const user=await resolveUser(request,env,{siteOnly}),spaces=await userWorkspaces(env,user.id);
 const wanted=workspaceId||new URL(request.url).searchParams.get('workspace')||request.headers.get('x-workspace-id')||spaces.find(w=>w.personal)?.id;
 const workspace=spaces.find(w=>w.id===wanted);if(!workspace)throw new APIError('无权访问此学习空间',403);if(write&&workspace.role==='viewer')throw new APIError('只读成员不能修改此学习空间',403);
 return {user,workspace,env:{...env,WORKSPACE_ID:workspace.id}};
}
export async function requireAdmin(request,env){const user=await resolveUser(request,env);if(user.role!=='admin')throw new APIError('需要管理员权限',403);return user;}
export async function migrateLegacy(env,user){
 if(user.role!=='admin'||!user.site_user_id)return;
 const owner=await env.DB.prepare("SELECT value FROM app_settings WHERE key='hosted_owner_user_id'").first();if(owner?.value!==user.id)return;
 const workspace='personal-'+user.id,key='legacy_migrated_to';
 const prior=await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first();if(prior)return;
 // Runtime backfill is isolated from schema migrations; the fixed owner's space is the only target.
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO workspace_entities (workspace_id,kind,id,payload,revision,deleted,updated_at) SELECT ?,kind,id,payload,revision,deleted,updated_at FROM cloud_entities').bind(workspace),
  env.DB.prepare('INSERT OR IGNORE INTO workspace_photos (workspace_id,id,storage_key,mime_type,byte_length,file_name,created_at) SELECT ?,id,storage_key,mime_type,byte_length,file_name,created_at FROM cloud_photos').bind(workspace),
  env.DB.prepare('INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)').bind(key,workspace)
 ]);
}
