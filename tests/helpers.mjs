import { createLocalCloud } from '../server/local-cloud.mjs';
import { createUser } from '../server/accounts.js';
export const testIdentity={'oai-authenticated-user-id':'test-site-user','oai-authenticated-user-email':'tester@example.com'};
export async function createTestCloud(){
 const env=createLocalCloud({memory:true});const user=await createUser(env,{displayName:'测试学习者',siteUserId:testIdentity['oai-authenticated-user-id'],role:'admin'});
 Object.assign(env,{TRUST_SITE_IDENTITY:true,ADMIN_EMAIL:'tester@example.com',WORKSPACE_ID:'personal-'+user.id,testUser:user});return env;
}
