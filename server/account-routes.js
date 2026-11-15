import { APIError,now,randomToken,hashToken,json,safeUser,assertSameOrigin,readJSON,usernameOf,checkPassword,passwordHash,verifyPassword,sessionCookie,cookie,rateLimit,createUser,startSession,resolveUser,userWorkspaces,workspaceContext,requireAdmin,audit,migrateLegacy } from './accounts.js';

const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const run=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).run();
async function registrationOpen(env){return (await one(env,"SELECT value FROM app_settings WHERE key='registration_open'"))?.value!=='false';}
async function accountState(env,user){await migrateLegacy(env,user);const legacy=await one(env,"SELECT value FROM app_settings WHERE key='legacy_migrated_to'");return {authenticated:true,user:safeUser(user),workspaces:await userWorkspaces(env,user.id),legacyImportAllowed:legacy?.value==='personal-'+user.id};}
async function ownerContext(request,env,workspaceId){const context=await workspaceContext(request,env,{workspaceId});if(context.workspace.role!=='owner'||context.workspace.personal)throw new APIError('仅共享空间的拥有者可以管理成员',403);return context;}
async function acceptInvite(env,user,token){
 if((await userWorkspaces(env,user.id)).length>=30)throw new APIError('每个账号最多加入 30 个学习空间');
 const hash=await hashToken(String(token||'')),invite=await one(env,'SELECT * FROM workspace_invites WHERE token_hash=? AND used_by IS NULL AND expires_at>?',hash,now());if(!invite)throw new APIError('邀请码无效、已使用或已过期');
 if(await one(env,'SELECT user_id FROM workspace_members WHERE workspace_id=? AND user_id=?',invite.workspace_id,user.id))throw new APIError('你已经是此空间的成员');
 const claimed=await one(env,'UPDATE workspace_invites SET used_by=? WHERE token_hash=? AND used_by IS NULL AND expires_at>? RETURNING workspace_id,role',user.id,hash,now());if(!claimed)throw new APIError('邀请码已被使用或已过期');
 await run(env,'INSERT INTO workspace_members (workspace_id,user_id,role,created_at) VALUES (?,?,?,?)',claimed.workspace_id,user.id,claimed.role,now());
 await audit(env,user.id,'workspace.join',claimed.workspace_id);return claimed.workspace_id;
}
export async function handleAccountRequest(request,env){
 try{
  const url=new URL(request.url),path=url.pathname;
  if(request.method!=='GET'&&request.method!=='POST')return json({error:'不支持的请求'},405);
  const body=request.method==='POST'?(assertSameOrigin(request),await readJSON(request)):null;
  if(path==='/api/auth/me'&&request.method==='GET'){
   try{return json({...await accountState(env,await resolveUser(request,env)),registrationOpen:await registrationOpen(env),chatgptAvailable:!!env.TRUST_SITE_IDENTITY});}
   catch(e){if(e.status===401)return json({authenticated:false,registrationOpen:await registrationOpen(env),chatgptAvailable:!!env.TRUST_SITE_IDENTITY});throw e;}
  }
  if(path==='/api/auth/register'&&body){
   await rateLimit(env,request,'register');if(!await registrationOpen(env))throw new APIError('当前已关闭新用户注册，请联系管理员',403);
   const username=usernameOf(body.username);checkPassword(body.password);
   if(await one(env,'SELECT id FROM users WHERE username=?',username))throw new APIError('用户名已被使用',409);
   let user;try{user=await createUser(env,{username,password:body.password,displayName:body.displayName||username,email:body.email||''});}catch(e){if(/UNIQUE/i.test(e.message))throw new APIError('用户名已被使用',409);throw e;}
   await audit(env,user.id,'account.register',user.id);return json(await accountState(env,user),201,{'Set-Cookie':await startSession(env,user,request)});
  }
  if(path==='/api/auth/login'&&body){
   await rateLimit(env,request,'login');const username=String(body.username||'').trim().toLowerCase();const user=await one(env,'SELECT * FROM users WHERE username=?',username);
   const dummy='pbkdf2-sha256$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
   const valid=await verifyPassword(body.password,user?.password_hash||dummy);if(!valid||!user)throw new APIError('用户名或密码不正确',401);if(user.status!=='active')throw new APIError('账号已停用，请联系管理员',403);
   await audit(env,user.id,'account.login',user.id);return json(await accountState(env,user),200,{'Set-Cookie':await startSession(env,user,request)});
  }
  if(path==='/api/auth/reset-password'&&body){
   await rateLimit(env,request,'reset');const password=await passwordHash(body.password);
   const reset=await one(env,'UPDATE password_resets SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? RETURNING user_id',now(),await hashToken(String(body.token||'')),now());if(!reset)throw new APIError('重置码无效、已使用或已过期');
   await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').bind(password,now(),reset.user_id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(reset.user_id)]);await audit(env,reset.user_id,'account.password_reset',reset.user_id);return json({ok:true});
  }
  if(path==='/api/auth/site-login'&&body){const user=await resolveUser(request,env,{siteOnly:true});return json(await accountState(env,user),200,{'Set-Cookie':sessionCookie(request,'',0)});}
  if(path==='/api/auth/logout'&&body){const token=cookie(request,'zhicuo_session');if(token)await run(env,'DELETE FROM sessions WHERE token_hash=?',await hashToken(token));return json({ok:true},200,{'Set-Cookie':sessionCookie(request,'signed-out')});}
  const user=await resolveUser(request,env);
  if(path==='/api/auth/profile'&&body){
   const name=String(body.displayName||'').trim();if(!name||name.length>60)throw new APIError('显示名称需为 1–60 个字符');
   await run(env,'UPDATE users SET display_name=?,email=?,updated_at=? WHERE id=?',name,String(body.email||'').trim().slice(0,160),now(),user.id);return json({ok:true});
  }
  if(path==='/api/auth/password'&&body){
   await rateLimit(env,request,'password',user.id);if(user.password_hash&&!await verifyPassword(body.currentPassword,user.password_hash))throw new APIError('当前密码不正确',403);
   const username=usernameOf(body.username||user.username),hash=await passwordHash(body.password);
   if(await one(env,'SELECT id FROM users WHERE username=? AND id<>?',username,user.id))throw new APIError('用户名已被使用',409);
   await env.DB.batch([env.DB.prepare('UPDATE users SET username=?,password_hash=?,updated_at=? WHERE id=?').bind(username,hash,now(),user.id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)]);
   await audit(env,user.id,'account.password_changed',user.id);return json({ok:true},200,{'Set-Cookie':await startSession(env,user,request)});
  }
  if(path==='/api/auth/link-chatgpt'&&body){
   const siteId=env.TRUST_SITE_IDENTITY&&request.headers.get('oai-authenticated-user-id');if(!siteId)throw new APIError('请先通过本站的 ChatGPT 登录入口登录',401);
   const existing=await one(env,'SELECT id FROM users WHERE site_user_id=?',siteId);if(existing&&existing.id!==user.id)throw new APIError('此 ChatGPT 已绑定另一个账号。请用原账号设置用户名和密码，实现同一账号跨设备使用',409);
   if(user.site_user_id&&user.site_user_id!==siteId)throw new APIError('此账号已绑定其他 ChatGPT',409);
   await run(env,'UPDATE users SET site_user_id=?,updated_at=? WHERE id=?',siteId,now(),user.id);await audit(env,user.id,'account.chatgpt_linked',user.id);return json({ok:true});
  }
  if(path==='/api/auth/logout-all'&&body){await run(env,'DELETE FROM sessions WHERE user_id=?',user.id);return json({ok:true},200,{'Set-Cookie':sessionCookie(request,'signed-out')});}
  if(path==='/api/workspaces'&&request.method==='GET')return json({workspaces:await userWorkspaces(env,user.id)});
  if(path==='/api/workspaces/create'&&body){
   const name=String(body.name||'').trim();if(!name||name.length>60)throw new APIError('空间名称需为 1–60 个字符');if((await userWorkspaces(env,user.id)).length>=30)throw new APIError('每个账号最多加入 30 个学习空间');
   const id='space-'+crypto.randomUUID(),at=now();await env.DB.batch([env.DB.prepare('INSERT INTO workspaces (id,owner_id,name,personal,created_at) VALUES (?,?,?,0,?)').bind(id,user.id,name,at),env.DB.prepare('INSERT INTO workspace_members (workspace_id,user_id,role,created_at) VALUES (?,?,\'owner\',?)').bind(id,user.id,at)]);await audit(env,user.id,'workspace.create',id);return json({id},201);
  }
  if(path==='/api/workspaces/join'&&body)return json({id:await acceptInvite(env,user,body.token)});
  if(path==='/api/workspaces/members'&&request.method==='GET'){
   const {workspace}=await workspaceContext(request,env,{workspaceId:url.searchParams.get('id')});return json({members:(await env.DB.prepare('SELECT u.id,u.display_name,m.role FROM users u JOIN workspace_members m ON m.user_id=u.id WHERE m.workspace_id=? ORDER BY m.created_at').bind(workspace.id).all()).results});
  }
  if(path==='/api/workspaces/invite'&&body){
   const {workspace}=await ownerContext(request,env,body.workspaceId);if(!['editor','viewer'].includes(body.role))throw new APIError('成员权限无效');
   const token=randomToken(),expires=new Date(Date.now()+7*86400000).toISOString();await run(env,'INSERT INTO workspace_invites (token_hash,workspace_id,role,created_by,expires_at,created_at) VALUES (?,?,?,?,?,?)',await hashToken(token),workspace.id,body.role,user.id,expires,now());await audit(env,user.id,'workspace.invite',workspace.id);return json({token,expiresAt:expires,url:new URL('/#account?invite='+token,request.url).href});
  }
  if(path==='/api/workspaces/revoke-invites'&&body){const {workspace}=await ownerContext(request,env,body.workspaceId);await run(env,'DELETE FROM workspace_invites WHERE workspace_id=? AND used_by IS NULL',workspace.id);await audit(env,user.id,'workspace.invites_revoked',workspace.id);return json({ok:true});}
  if(path==='/api/workspaces/member'&&body){
   const {workspace}=await ownerContext(request,env,body.workspaceId);if(body.userId===workspace.owner_id)throw new APIError('不能移除拥有者或修改其权限');
   if(body.remove)await run(env,'DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?',workspace.id,String(body.userId));else{if(!['editor','viewer'].includes(body.role))throw new APIError('成员权限无效');await run(env,'UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?',body.role,workspace.id,String(body.userId));}
   await audit(env,user.id,body.remove?'workspace.member_removed':'workspace.role_changed',workspace.id+':'+String(body.userId));return json({ok:true});
  }
  if(path==='/api/workspaces/leave'&&body){const {workspace}=await workspaceContext(request,env,{workspaceId:body.workspaceId});if(workspace.role==='owner')throw new APIError('拥有者不能退出自己的空间');await run(env,'DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?',workspace.id,user.id);return json({ok:true});}
  if(path.startsWith('/api/admin/')){
   await requireAdmin(request,env);
   if(path==='/api/admin/overview'&&request.method==='GET'){
    const counts={};for(const [key,table] of [['users','users'],['workspaces','workspaces'],['photos','workspace_photos']])counts[key]=(await one(env,`SELECT count(*) AS n FROM ${table}`)).n;
    counts.records=(await one(env,"SELECT count(*) AS n FROM workspace_entities WHERE kind='records' AND deleted=0")).n;
    const offset=Math.max(0,Math.min(100000,Number.parseInt(url.searchParams.get('offset')||'0')||0));
    const rows=(await env.DB.prepare('SELECT u.*, (SELECT count(*) FROM workspace_members m WHERE m.user_id=u.id) AS spaces FROM users u ORDER BY u.created_at DESC,u.id LIMIT 50 OFFSET ?').bind(offset).all()).results;
    const logs=(await env.DB.prepare('SELECT a.id,a.action,a.target,a.created_at,u.display_name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 50').all()).results;
    return json({counts,users:rows.map(u=>({...safeUser(u),spaces:u.spaces})),nextOffset:rows.length===50?offset+50:null,audit:logs,registrationOpen:await registrationOpen(env)});
   }
   if(path==='/api/admin/registration'&&body){if(typeof body.open!=='boolean')throw new APIError('注册设置无效');await run(env,"INSERT INTO app_settings (key,value) VALUES ('registration_open',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(body.open));await audit(env,user.id,'admin.registration',String(body.open));return json({ok:true});}
   if(path==='/api/admin/user'&&body){
    const target=await one(env,'SELECT * FROM users WHERE id=?',String(body.userId));if(!target)throw new APIError('用户不存在',404);if(target.id===user.id)throw new APIError('请勿通过后台修改自己的角色或状态');
    const role=body.role??target.role,status=body.status??target.status;if(!['admin','user'].includes(role)||!['active','disabled'].includes(status))throw new APIError('角色或状态无效');
    const result=await run(env,"UPDATE users SET role=?,status=?,updated_at=? WHERE id=? AND (role<>'admin' OR ?='admin' AND ?='active' OR (SELECT count(*) FROM users WHERE role='admin' AND status='active')>1)",role,status,now(),target.id,role,status);if(!result.meta.changes)throw new APIError('至少保留一名启用的管理员');
    await run(env,'DELETE FROM sessions WHERE user_id=?',target.id);await audit(env,user.id,'admin.user_updated',target.id);return json({ok:true});
   }
   if(path==='/api/admin/revoke-sessions'&&body){await run(env,'DELETE FROM sessions WHERE user_id=?',String(body.userId));await audit(env,user.id,'admin.sessions_revoked',String(body.userId));return json({ok:true});}
   if(path==='/api/admin/reset-password'&&body){
    const target=await one(env,'SELECT id FROM users WHERE id=?',String(body.userId));if(!target)throw new APIError('用户不存在',404);const token=randomToken(),expires=new Date(Date.now()+30*60000).toISOString();
    await run(env,'DELETE FROM password_resets WHERE user_id=?',target.id);await run(env,'INSERT INTO password_resets (token_hash,user_id,expires_at) VALUES (?,?,?)',await hashToken(token),target.id,expires);await audit(env,user.id,'admin.password_reset_issued',target.id);return json({token,expiresAt:expires});
   }
  }
  return json({error:'接口不存在'},404);
 }catch(e){return json({error:e.status?e.message:'服务暂时不可用，请稍后重试'},e.status||500);}
}
