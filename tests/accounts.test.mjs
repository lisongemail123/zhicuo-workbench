import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalCloud } from '../server/local-cloud.mjs';
import { routeAPI } from '../server/router.js';
import { createUser,passwordHash,verifyPassword,hashToken } from '../server/accounts.js';
import { createInitialState } from '../dist/model.js';
const origin='https://desk.example.com',password='a secure password 123';
async function call(env,path,body,{cookie='',headers={},method=body?'POST':'GET'}={}){
 const response=await routeAPI(new Request(origin+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),env);
 let data;const text=await response.text();try{data=JSON.parse(text);}catch{data=text;}
 return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]||'',headers:response.headers};
}
async function register(env,username){const result=await call(env,'/api/auth/register',{username,password,displayName:username});assert.equal(result.status,201,JSON.stringify(result.data));return result;}
const sample=()=>({...createInitialState(true).records[0],id:'same-question-id',demo:false,photo:''});
const sync=(env,cookie,workspace,changes)=>call(env,'/api/cloud/sync',{changes},{cookie,headers:{'X-Workspace-ID':workspace}});
const change=record=>({kind:'records',id:record.id,payload:record,baseRevision:0});
test('passwords are salted, verified and never returned; sessions support a second device',async()=>{
 const a=await passwordHash(password),b=await passwordHash(password);assert.notEqual(a,b);assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('incorrect password',a),false);
 const env=createLocalCloud({memory:true});try{
  const first=await register(env,'learner-one');assert.equal(first.data.user.role,'user');assert.ok(!JSON.stringify(first.data).includes(password));assert.match(first.headers.get('set-cookie'),/HttpOnly/);assert.match(first.headers.get('set-cookie'),/Secure/);assert.match(first.headers.get('set-cookie'),/SameSite=Strict/);
  const second=await call(env,'/api/auth/login',{username:'LEARNER-ONE',password});assert.equal(second.status,200);assert.equal(second.data.user.id,first.data.user.id);assert.notEqual(second.cookie,first.cookie);
  const row=await env.DB.prepare('SELECT * FROM sessions WHERE user_id=?').bind(first.data.user.id).first();assert.ok(!row.token_hash.includes(first.cookie.split('=')[1]));
  const ws=first.data.workspaces[0].id;assert.equal((await sync(env,first.cookie,ws,[change(sample())])).status,200);
  const response=await call(env,'/api/cloud/entities?kind=records',null,{cookie:second.cookie,headers:{'X-Workspace-ID':ws}});assert.equal(response.data.entities[0].payload.id,sample().id);
  await call(env,'/api/auth/logout',{}, {cookie:first.cookie});assert.equal((await call(env,'/api/cloud/status',null,{cookie:first.cookie})).status,401);assert.equal((await call(env,'/api/cloud/status',null,{cookie:second.cookie})).status,200);
 }finally{env.close();}
});
test('unrelated accounts cannot read or overwrite records or original photos, even with known IDs',async()=>{
 const env=createLocalCloud({memory:true});try{
  const a=await register(env,'alice'),b=await register(env,'bob');const wsA=a.data.workspaces[0].id,wsB=b.data.workspaces[0].id;
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=';
  const saved=await sync(env,a.cookie,wsA,[change({...sample(),photo:'data:image/png;base64,'+png})]);const photo=saved.data.results[0].entity.payload.photo;
  assert.equal((await call(env,'/api/cloud/entities?kind=records',null,{cookie:b.cookie,headers:{'X-Workspace-ID':wsA}})).status,403);
  assert.equal((await call(env,photo+'?workspace='+wsA,null,{cookie:b.cookie})).status,403);
  assert.equal((await sync(env,b.cookie,wsA,[change(sample())])).status,403);
  assert.equal((await sync(env,b.cookie,wsB,[change({...sample(),answer:'B only'})])).status,200);
  const record=await call(env,'/api/cloud/entities?kind=records',null,{cookie:a.cookie,headers:{'X-Workspace-ID':wsA}});assert.notEqual(record.data.entities[0].payload.answer,'B only');
  assert.equal((await call(env,'/api/cloud/status')).status,401);
 }finally{env.close();}
});
test('shared spaces enforce invitations, read-only roles and immediate membership revocation',async()=>{
 const env=createLocalCloud({memory:true});try{
  const owner=await register(env,'parent'),viewer=await register(env,'child'),outsider=await register(env,'outsider');
  const space=await call(env,'/api/workspaces/create',{name:'家庭共学'},{cookie:owner.cookie});const ws=space.data.id;
  const invite=await call(env,'/api/workspaces/invite',{workspaceId:ws,role:'viewer'},{cookie:owner.cookie});
  assert.equal((await call(env,'/api/workspaces/join',{token:invite.data.token},{cookie:viewer.cookie})).status,200);
  assert.equal((await call(env,'/api/workspaces/join',{token:invite.data.token},{cookie:outsider.cookie})).status,400);
  assert.equal((await sync(env,owner.cookie,ws,[change(sample())])).status,200);
  assert.equal((await call(env,'/api/cloud/entities?kind=records',null,{cookie:viewer.cookie,headers:{'X-Workspace-ID':ws}})).data.entities.length,1);
  assert.equal((await sync(env,viewer.cookie,ws,[change({...sample(),id:'denied'})])).status,403);
  assert.equal((await call(env,'/api/workspaces/invite',{workspaceId:ws,role:'editor'},{cookie:viewer.cookie})).status,403);
  assert.equal((await call(env,'/api/workspaces/member',{workspaceId:ws,userId:viewer.data.user.id,role:'editor'},{cookie:owner.cookie})).status,200);
  assert.equal((await sync(env,viewer.cookie,ws,[change({...sample(),id:'editor-question'})])).status,200);
  await call(env,'/api/workspaces/member',{workspaceId:ws,userId:viewer.data.user.id,remove:true},{cookie:owner.cookie});
  assert.equal((await call(env,'/api/cloud/status',null,{cookie:viewer.cookie,headers:{'X-Workspace-ID':ws}})).status,403);
  const personal=owner.data.workspaces[0].id;assert.equal((await call(env,'/api/workspaces/invite',{workspaceId:personal,role:'viewer'},{cookie:owner.cookie})).status,403);
 }finally{env.close();}
});
test('only administrators can control registration, suspend accounts, revoke sessions and issue single-use password resets',async()=>{
 const env=createLocalCloud({memory:true});try{
  await createUser(env,{username:'admin',password,displayName:'管理员',role:'admin'});const admin=await call(env,'/api/auth/login',{username:'admin',password}),member=await register(env,'member');
  assert.equal((await call(env,'/api/admin/overview',null,{cookie:member.cookie})).status,403);
  assert.equal((await call(env,'/api/admin/registration',{open:false},{cookie:admin.cookie})).status,200);assert.equal((await call(env,'/api/auth/register',{username:'closed',password})).status,403);
  await call(env,'/api/admin/user',{userId:member.data.user.id,status:'disabled'},{cookie:admin.cookie});assert.equal((await call(env,'/api/cloud/status',null,{cookie:member.cookie})).status,401);assert.equal((await call(env,'/api/auth/login',{username:'member',password})).status,403);
  await call(env,'/api/admin/user',{userId:member.data.user.id,status:'active'},{cookie:admin.cookie});
  const reset=await call(env,'/api/admin/reset-password',{userId:member.data.user.id},{cookie:admin.cookie});assert.ok(reset.data.token);
  const fresh='new secure password 456';assert.equal((await call(env,'/api/auth/reset-password',{token:reset.data.token,password:fresh})).status,200);assert.equal((await call(env,'/api/auth/reset-password',{token:reset.data.token,password:fresh})).status,400);
  assert.equal((await call(env,'/api/auth/login',{username:'member',password})).status,401);assert.equal((await call(env,'/api/auth/login',{username:'member',password:fresh})).status,200);
  assert.equal((await call(env,'/api/admin/user',{userId:admin.data.user.id,status:'disabled'},{cookie:admin.cookie})).status,400);
  const overview=await call(env,'/api/admin/overview',null,{cookie:admin.cookie});assert.equal(overview.data.counts.users,2);assert.ok(overview.data.audit.some(a=>a.action==='admin.password_reset_issued'));assert.ok(!JSON.stringify(overview.data).includes(reset.data.token));assert.ok(!JSON.stringify(overview.data).includes('password_hash'));
 }finally{env.close();}
});
test('password updates invalidate older sessions and CSRF writes and brute-force logins are rejected',async()=>{
 const env=createLocalCloud({memory:true});try{
  const first=await register(env,'password-user'),other=await call(env,'/api/auth/login',{username:'password-user',password});
  assert.equal((await call(env,'/api/auth/password',{password:'new password 123',currentPassword:'not correct'},{cookie:first.cookie})).status,403);
  const changed=await call(env,'/api/auth/password',{password:'new password 123',currentPassword:password},{cookie:first.cookie});assert.equal(changed.status,200);assert.equal((await call(env,'/api/cloud/status',null,{cookie:other.cookie})).status,401);
  assert.equal((await call(env,'/api/auth/logout',{}, {cookie:changed.cookie,headers:{Origin:'https://evil.example.com'}})).status,403);
  for(let i=0;i<21;i++)await call(env,'/api/auth/login',{username:'unknown',password:'wrong password'});
  assert.equal((await call(env,'/api/auth/login',{username:'unknown',password})).status,429);
 }finally{env.close();}
});
test('verified ChatGPT identity maps to one account and its private archive; header spoofing is disabled on standalone deployments',async()=>{
 const env=createLocalCloud({memory:true});try{
  const headers={'oai-authenticated-user-id':'site-owner','oai-authenticated-user-email':'owner@example.com'};
  assert.equal((await call(env,'/api/auth/me',null,{headers})).data.authenticated,false);
  Object.assign(env,{TRUST_SITE_IDENTITY:true,ADMIN_EMAIL:'owner@example.com'});
  const owner=await call(env,'/api/auth/me',null,{headers});assert.equal(owner.data.user.role,'admin');
  const same=await call(env,'/api/auth/me',null,{headers});assert.equal(same.data.user.id,owner.data.user.id);
  const mcp=await call(env,'/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_capture_status',arguments:{}}},{headers});assert.equal(JSON.parse(mcp.data.result.content[0].text).workspace_id,owner.data.workspaces[0].id);
  const denied=await call(env,'/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_capture_status',arguments:{}}});assert.equal(denied.data.result.isError,true);
  const logout=await call(env,'/api/auth/logout',{}, {headers});assert.equal((await call(env,'/api/auth/me',null,{cookie:logout.cookie,headers})).data.authenticated,false);
  const login=await call(env,'/api/auth/site-login',{}, {cookie:logout.cookie,headers});assert.equal(login.data.user.id,owner.data.user.id);
 }finally{env.close();}
});
test('legacy cloud data and image references migrate only to the verified administrator personal workspace',async()=>{
 const env=createLocalCloud({memory:true});try{
  const record=sample();await env.DB.prepare('INSERT INTO cloud_entities (kind,id,payload,revision,deleted,updated_at) VALUES (?,?,?,1,0,?)').bind('records',record.id,JSON.stringify(record),new Date().toISOString()).run();
  const ordinary=await register(env,'ordinary');assert.equal((await call(env,'/api/cloud/entities?kind=records',null,{cookie:ordinary.cookie})).data.entities.length,0);
  Object.assign(env,{TRUST_SITE_IDENTITY:true,ADMIN_EMAIL:'owner@example.com'});const headers={'oai-authenticated-user-id':'verified-owner','oai-authenticated-user-email':'owner@example.com'};
  await call(env,'/api/auth/me',null,{headers});let rows=await call(env,'/api/cloud/entities?kind=records',null,{headers});assert.equal(rows.data.entities.length,1);assert.equal(rows.data.entities[0].id,record.id);
  await call(env,'/api/auth/me',null,{headers});rows=await call(env,'/api/cloud/entities?kind=records',null,{headers});assert.equal(rows.data.entities.length,1);
 }finally{env.close();}
});
test('expired and revoked invitations cannot grant access, and the registration switch also gates new ChatGPT accounts',async()=>{
 const env=createLocalCloud({memory:true});try{
  Object.assign(env,{TRUST_SITE_IDENTITY:true,ADMIN_EMAIL:'owner@example.com'});const headers={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com'};
  await call(env,'/api/auth/me',null,{headers});const member=await register(env,'invited-learner');const created=await call(env,'/api/workspaces/create',{name:'班级空间'},{headers});const ws=created.data.id;
  const expired=await call(env,'/api/workspaces/invite',{workspaceId:ws,role:'viewer'},{headers});await env.DB.prepare('UPDATE workspace_invites SET expires_at=? WHERE token_hash=?').bind('2000-01-01T00:00:00.000Z',await hashToken(expired.data.token)).run();
  assert.equal((await call(env,'/api/workspaces/join',{token:expired.data.token},{cookie:member.cookie})).status,400);
  const revoked=await call(env,'/api/workspaces/invite',{workspaceId:ws,role:'editor'},{headers});await call(env,'/api/workspaces/revoke-invites',{workspaceId:ws},{headers});assert.equal((await call(env,'/api/workspaces/join',{token:revoked.data.token},{cookie:member.cookie})).status,400);
  await call(env,'/api/admin/registration',{open:false},{headers});assert.equal((await call(env,'/api/auth/me',null,{headers:{'oai-authenticated-user-id':'new-site-user'}})).status,403);
 }finally{env.close();}
});
test('the same image in independent spaces has independent storage and deletion ownership',async()=>{
 const env=createLocalCloud({memory:true});try{
  const first=await register(env,'image-owner-a'),second=await register(env,'image-owner-b'),png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=';
  const record={...sample(),photo:'data:image/png;base64,'+png},a=await sync(env,first.cookie,first.data.workspaces[0].id,[change(record)]),b=await sync(env,second.cookie,second.data.workspaces[0].id,[change(record)]);
  const file=b.data.results[0].entity.payload.photo;await sync(env,first.cookie,first.data.workspaces[0].id,[{kind:'records',id:record.id,baseRevision:a.data.results[0].entity.revision,deleted:true}]);
  assert.equal((await call(env,file,null,{cookie:first.cookie})).status,404);assert.equal((await call(env,file,null,{cookie:second.cookie})).status,200);
 }finally{env.close();}
});
test('ChatGPT tools authorize shared workspace selection and reject writes by read-only members',async()=>{
 const env=createLocalCloud({memory:true});try{
  env.TRUST_SITE_IDENTITY=true;const ownerHeaders={'oai-authenticated-user-id':'mcp-owner'},viewerHeaders={'oai-authenticated-user-id':'mcp-viewer'};
  const owner=await call(env,'/api/auth/me',null,{headers:ownerHeaders}),viewer=await call(env,'/api/auth/me',null,{headers:viewerHeaders});
  const space=await call(env,'/api/workspaces/create',{name:'MCP 共享'},{headers:ownerHeaders});const ws=space.data.id;
  await env.DB.prepare('INSERT INTO workspace_members (workspace_id,user_id,role,created_at) VALUES (?,?,?,?)').bind(ws,viewer.data.user.id,'viewer',new Date().toISOString()).run();
  let result=await call(env,'/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_capture_status',arguments:{workspace_id:ws}}},{headers:viewerHeaders});assert.equal(result.data.result.isError,undefined);assert.equal(JSON.parse(result.data.result.content[0].text).workspace_id,ws);
  result=await call(env,'/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'archive_mistakes',arguments:{workspace_id:ws}}},{headers:viewerHeaders});assert.equal(result.data.result.isError,true);assert.match(result.data.result.content[0].text,/只读/);
  result=await call(env,'/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_capture_status',arguments:{workspace_id:owner.data.workspaces[0].id}}},{headers:viewerHeaders});assert.equal(result.data.result.isError,true);
 }finally{env.close();}
});
