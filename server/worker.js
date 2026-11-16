import assets from 'site-assets';
import { routeAPI } from './router.js';
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    // Only the Sites entrypoint trusts identity headers injected by its authentication gateway.
    const response=await routeAPI(request,{...env,TRUST_SITE_IDENTITY:true});if(response)return response;
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    let path;try{path=decodeURIComponent(url.pathname);}catch{return new Response('Bad request',{status:400});}
    const asset=assets[path==='/'?'/index.html':path];
    if(!asset)return new Response('Not found',{status:404});
    const body=asset.encoding==='base64'?Uint8Array.from(atob(asset.content),c=>c.charCodeAt(0)):asset.content;
    return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
  }
};
