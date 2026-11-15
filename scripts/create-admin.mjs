import readline from 'node:readline/promises';
import { createLocalCloud } from '../server/local-cloud.mjs';
import { createUser,usernameOf,checkPassword } from '../server/accounts.js';
const terminal=readline.createInterface({input:process.stdin,output:process.stdout});let env;
try{
 const username=usernameOf(await terminal.question('管理员用户名（3–40 位）: '));
 const displayName=await terminal.question('显示名称: ');
 process.stdout.write('密码（10–128 字符，输入不回显）: ');
 terminal.close();
 if(!process.stdin.isTTY)throw new Error('请在交互式终端运行');
 process.stdin.setRawMode(true);process.stdin.resume();let password='';
 await new Promise((resolve,reject)=>{function input(chunk){for(const c of chunk.toString()){if(c==='\u0003'){cleanup();reject(new Error('已取消'));return;}if(c==='\r'||c==='\n'){cleanup();resolve();return;}if(c==='\u007f'||c==='\b')password=password.slice(0,-1);else if(c>=' ')password+=c;}}function cleanup(){process.stdin.off('data',input);process.stdin.setRawMode(false);process.stdin.pause();}process.stdin.on('data',input);});
 checkPassword(password);env=createLocalCloud();await createUser(env,{username,password,displayName:displayName||username,role:'admin'});process.stdout.write('\n管理员已创建，请通过网页登录。\n');
}catch(e){process.stderr.write('\n'+e.message+'\n');process.exitCode=1;}finally{terminal.close();env?.close();}
