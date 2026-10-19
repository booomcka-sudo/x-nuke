import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {profileRoute,type ScanView} from '../../../packages/shared/src/index.js';
import {Panel,useScan} from './Panel.js';
import {send} from './bridge.js';
import {explainError} from './errors.js';
import {Icon} from './Icon.js';
import css from './style.css?inline';
import extraCss from './extra.css?inline';
const hostId='x-nuke-root';
function App() {
 const [username,setUsername]=useState(profileRoute(location.pathname));
 const [open,setOpen]=useState(false);
 const [id,setId]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const generation=useRef(0);
 const {scan,error:pollError,reload}=useScan(open?id:null);
 useEffect(()=>{
  let previous=location.pathname;
  let timer:ReturnType<typeof setTimeout>;
  const check=()=>{
   if(previous===location.pathname)return;
   previous=location.pathname;generation.current++;
   setUsername(profileRoute(previous));setId(null);setError('');setBusy(false);
  };
  const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(check,150);});
  observer.observe(document.body,{childList:true});
  const interval=setInterval(check,700);
  window.addEventListener('popstate',check);
  return()=>{observer.disconnect();clearTimeout(timer);clearInterval(interval);window.removeEventListener('popstate',check);generation.current++;};
 },[]);
 useEffect(()=>{
  if(!username||!open)return;
  const request=generation.current;
  void send<ScanView|null>({type:'CURRENT',username}).then(current=>{
   if(request!==generation.current)return;
   if(current)setId(current.id);else void start('quick');
  }).catch(cause=>{if(request===generation.current)setError(explainError(cause));});
 },[username,open]);
 async function start(mode:'quick'|'deep') {
  if(!username||busy)return;
  const request=++generation.current;const requested=username;
  setBusy(true);setError('');
  try{
   const response=await send<{id:string}>({type:'SCAN',username:requested,mode});
   if(request!==generation.current||profileRoute(location.pathname)!==requested)return;
   setId(response.id);reload();
  }catch(cause){if(request===generation.current)setError(explainError(cause));}
  finally{if(request===generation.current)setBusy(false);}
 }
 if(!username)return null;
 return <>{!open&&<button className="scan-launcher" onClick={()=>setOpen(true)}><Icon name="nuke"/>Scan @{username}</button>}{open&&<Panel scan={scan?.username===username?scan:null} username={username} error={error||pollError} busy={busy} onClose={()=>setOpen(false)} onScan={()=>void start('quick')} onDeep={()=>void start('deep')}/>}</>;
}
if(!document.getElementById(hostId)) {
 const host=document.createElement('div');host.id=hostId;document.documentElement.append(host);
 const shadow=host.attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=css+extraCss;shadow.append(style);
 const mount=document.createElement('div');shadow.append(mount);createRoot(mount).render(<App/>);
}
