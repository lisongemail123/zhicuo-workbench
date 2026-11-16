import { build } from 'esbuild';
import { readdir,readFile,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const staticRoot=path.join(root,'dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/plain; charset=utf-8','.woff2':'font/woff2'};
const assets={};
async function visit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='server')continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await visit(file);else {const key='/'+path.relative(staticRoot,file).split(path.sep).join('/'),binary=path.extname(file)==='.woff2';assets[key]={content:await readFile(file,binary?'base64':'utf8'),type:types[path.extname(file)]||'text/plain; charset=utf-8',...(binary?{encoding:'base64'}:{})};}}}
await visit(staticRoot);await mkdir(path.join(staticRoot,'server'),{recursive:true});
await build({entryPoints:[path.join(root,'server/worker.js')],outfile:path.join(staticRoot,'server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'inline',plugins:[{name:'embedded-site-assets',setup(builder){builder.onResolve({filter:/^site-assets$/},()=>({path:'site-assets',namespace:'site'}));builder.onLoad({filter:/.*/,namespace:'site'},()=>({contents:`export default ${JSON.stringify(assets)}`,loader:'js'}));}}]});
console.log(`Built standalone Worker with ${Object.keys(assets).length} static assets and /api/ai gateway.`);
