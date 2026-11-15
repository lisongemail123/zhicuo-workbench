import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,readFileSync,readdirSync } from 'node:fs';
import { mkdir,readFile,writeFile,unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export function createLocalCloud({directory=path.join(projectRoot,'work/cloud'),memory=false}={}){
 if(!memory)mkdirSync(directory,{recursive:true});
 const database=new DatabaseSync(memory?':memory:':path.join(directory,'workspace.sqlite'));
 database.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
 for(const name of readdirSync(path.join(projectRoot,'drizzle')).filter(n=>n.endsWith('.sql')).sort()){
  if(!database.prepare('SELECT name FROM _local_migrations WHERE name=?').get(name)){database.exec('BEGIN');try{database.exec(readFileSync(path.join(projectRoot,'drizzle',name),'utf8'));database.prepare('INSERT INTO _local_migrations (name) VALUES (?)').run(name);database.exec('COMMIT');}catch(e){database.exec('ROLLBACK');throw e;}}
 }
 function prepared(sql,args=[]){return {execute(){const r=database.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};},bind:(...values)=>prepared(sql,values),async first(){return database.prepare(sql).get(...args)||null;},async all(){return {results:database.prepare(sql).all(...args)};},async run(){const result=database.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};}
 const objects=new Map();
 const bucket={async put(key,value){const data=new Uint8Array(value);if(memory){objects.set(key,data);return;}const p=path.join(directory,'photos',key.replace(/[^a-zA-Z0-9_/-]/g,''));await mkdir(path.dirname(p),{recursive:true});await writeFile(p,data);},async get(key){try{const data=memory?objects.get(key):await readFile(path.join(directory,'photos',key.replace(/[^a-zA-Z0-9_/-]/g,'')));return data?{body:data,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)}:null;}catch{return null;}},async delete(key){if(memory)objects.delete(key);else await unlink(path.join(directory,'photos',key.replace(/[^a-zA-Z0-9_/-]/g,''))).catch(()=>{});}};
 return {DB:{prepare:sql=>prepared(sql),async batch(statements){database.exec('BEGIN');try{const results=statements.map(s=>s.execute());database.exec('COMMIT');return results;}catch(e){database.exec('ROLLBACK');throw e;}}},BUCKET:bucket,close:()=>database.close()};
}
