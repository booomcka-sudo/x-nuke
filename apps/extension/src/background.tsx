import {z} from 'zod';
import {messageSchema,profileRoute} from '../../../packages/shared/src/index.js';
const origin=import.meta.env.VITE_API_ORIGIN!;
const sessionSchema=z.object({accessToken:z.string(),refreshToken:z.string()});
type Session=z.infer<typeof sessionSchema>;
const storageReady=Promise.all([
 chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),
 chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),
]);
let refreshing:Promise<Session>|null=null;
class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
async function perform(path:string,body:unknown,token?:string) {
 let response:Response;
 try{response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}
 catch{throw new ApiError(503,'service_unavailable');}
 let data:unknown;
 try{data=await response.json();}catch{throw new ApiError(503,'The backend returned an invalid response. Check the API deployment.');}
 if(!response.ok){const parsed=z.object({error:z.string()}).safeParse(data);throw new ApiError(response.status,parsed.success?parsed.data.error:'service_unavailable');}
 return data;
}
async function fetchApi(path:string,body?:unknown,auth=true):Promise<unknown> {
 await storageReady;
 let session=sessionSchema.safeParse((await chrome.storage.local.get('session')).session);
 if(auth&&!session.success)throw new ApiError(401,'unauthorized');
 try{return await perform(path,body,auth&&session.success?session.data.accessToken:undefined);}
 catch(error) {
  if(!(error instanceof ApiError)||error.status!==401||!auth||!session.success)throw error;
  const current=session.data;
  if(!refreshing)refreshing=perform('/v1/auth/refresh',{refreshToken:current.refreshToken}).then(async value=>{
   const next=sessionSchema.parse(value);await chrome.storage.local.set({session:next});return next;
  }).finally(()=>{refreshing=null;});
  try{session={success:true,data:await refreshing};}catch(cause){if(cause instanceof ApiError&&cause.status===401)await chrome.storage.local.remove('session');throw cause;}
  return perform(path,body,session.data.accessToken);
 }
}
chrome.runtime.onMessage.addListener((raw,sender,respond)=>{
 void (async()=>{
  if(sender.id!==chrome.runtime.id)throw Error('Invalid sender');
  const message=messageSchema.parse(raw);
  const internal=!!sender.url?.startsWith(chrome.runtime.getURL(''));
  const url=sender.url?new URL(sender.url):null;
  const origins=['https://x.com','https://twitter.com',...(import.meta.env.DEV?['http://localhost:5173','http://127.0.0.1:5173']:[])];
  const content=!!url&&origins.includes(url.origin);
  if(!internal&&!content)throw Error('Invalid origin');
  if(!internal&&['LOGIN','LOGOUT','HISTORY','ME','STATUS'].includes(message.type))throw Error('Trusted page required');
  await storageReady;
  switch(message.type) {
   case 'STATUS':return fetchApi('/v1/status',undefined,false);
   case 'LOGIN':{
    const session=sessionSchema.parse(await fetchApi('/v1/auth/login',{email:message.email,password:message.password},false));
    await chrome.storage.local.set({session});return {ok:true};
   }
   case 'LOGOUT':try{await fetchApi('/v1/auth/logout',{});}finally{await chrome.storage.local.remove('session');}return {ok:true};
   case 'ME':return fetchApi('/v1/me');
   case 'HISTORY':return fetchApi('/v1/history');
   case 'CURRENT':
    if(content&&profileRoute(url!.pathname)!==message.username)throw Error('Profile mismatch');
    return fetchApi('/v1/scans/current?username='+encodeURIComponent(message.username));
   case 'SCAN':
    if(content&&profileRoute(url!.pathname)!==message.username)throw Error('Profile mismatch');
    return fetchApi('/v1/scans',{username:message.username,mode:message.mode});
   case 'GET_SCAN':return fetchApi('/v1/scans/'+message.id);
   case 'REPORT':await chrome.tabs.create({url:chrome.runtime.getURL('report.html?id='+message.id)});return {ok:true};
   case 'OPTIONS':await chrome.runtime.openOptionsPage();return {ok:true};
  }
 })().then(data=>respond({data}),error=>respond({error:error instanceof Error?error.message:'service_unavailable'}));
 return true;
});
