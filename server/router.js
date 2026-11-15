import { handleAccountRequest } from './account-routes.js';
import { handleCloudRequest } from './cloud-routes.js';
import { handleMCP } from './mcp.js';
import { handleAIRequest } from './gateway.js';
import { cloudReady } from './cloud-store.js';
import { resolveUser,assertSameOrigin,json } from './accounts.js';
export async function routeAPI(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/api/health')return json({ok:true,version:'4.0.0',ai:true,cloud:cloudReady(env),chatgpt:true,accounts:true});
 if(path==='/mcp')return handleMCP(request,env);
 if(/^\/api\/(auth|workspaces|admin)(\/|$)/.test(path))return handleAccountRequest(request,env);
 if(path.startsWith('/api/cloud/')||path.startsWith('/api/files/'))return handleCloudRequest(request,env);
 if(path==='/api/ai'){
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  try{await resolveUser(request,env);assertSameOrigin(request);return handleAIRequest(request);}catch(e){return json({error:e.status?e.message:'请求失败'},e.status||500);}
 }
 if(path.startsWith('/api/'))return json({error:'接口不存在'},404);
 return null;
}
