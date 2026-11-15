import assets from 'site-assets';
import { handleAIRequest } from './gateway.js';
export default {
  async fetch(request) {
    const url=new URL(request.url);
    if(url.pathname==='/api/ai')return handleAIRequest(request);
    if(url.pathname==='/api/health')return Response.json({ok:true,version:'2.0.1',ai:true},{headers:{'Cache-Control':'no-store'}});
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    let path;try{path=decodeURIComponent(url.pathname);}catch{return new Response('Bad request',{status:400});}
    const asset=assets[path==='/'?'/index.html':path];
    if(!asset)return new Response('Not found',{status:404});
    return new Response(request.method==='HEAD'?null:asset.content,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
  }
};
