import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const roots=['dist','server','scripts','tests','db'];let count=0;
async function check(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='vendor'||dir==='dist'&&e.name==='server')continue;const p=path.join(dir,e.name);if(e.isDirectory())await check(p);else if(/\.(m?js)$/.test(p)){const r=spawnSync(process.execPath,['--check',p],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);count++;}}}
for(const dir of roots)await check(dir);console.log(`Syntax checked ${count} source files.`);
