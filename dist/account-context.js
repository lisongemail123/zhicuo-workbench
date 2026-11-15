let context=null;
export const setAccountContext=value=>{context=value;};
export const getAccountContext=()=>context;
export const scopedKey=(key,workspace=false)=>context?`${key}:${context.user.id}${workspace?':'+context.workspace.id:''}`:key;
export const workspaceHeaders=()=>context?{'X-Workspace-ID':context.workspace.id}:{};
export const photoURL=photo=>photo?.startsWith('/api/files/')&&context?`${photo}?workspace=${encodeURIComponent(context.workspace.id)}`:photo;
