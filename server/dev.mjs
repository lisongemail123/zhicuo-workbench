import http from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAIRequest } from './gateway.js';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/plain; charset=utf-8'};
export function createAppServer() {
  return http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname==='/api/ai') {
        // Use the actual Host for origin comparison; bind to loopback by default.
        const requestUrl=`http://${req.headers.host||'127.0.0.1'}${req.url}`;
        const controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableEnded)controller.abort();});
        const request=new Request(requestUrl,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:req,duplex:'half',signal:controller.signal});
        const response=await handleAIRequest(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      if(url.pathname==='/api/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,version:'2.0.1',ai:true}));return;}
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Method not allowed');return;}
      const name=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
      const file=path.resolve(root,`.${name}`);
      if(!file.startsWith(root)||path.relative(root,file).split(path.sep).includes('server')){res.writeHead(404);res.end('Not found');return;}
      if(!(await stat(file)).isFile()){res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});
      res.end(req.method==='HEAD'?undefined:await readFile(file));
    }catch{if(!res.headersSent)res.writeHead(404);res.end('Not found');}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT)||4173;
  createAppServer().listen(port,'127.0.0.1',()=>console.log(`知错 · http://127.0.0.1:${port}`));
}
