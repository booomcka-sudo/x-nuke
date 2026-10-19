import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {profileRoute} from '../../../packages/shared/src/index.js';
import {Panel,useScan} from './Panel.js';
import {send} from './bridge.js';
import css from './style.css?inline';
const hostId='x-nuke-root';
function App(){const [username,setUsername]=useState(profileRoute(location.pathname));const [open,setOpen]=useState(false);const [id,setId]=useState<string|null>(null);const [error,setError]=useState('');const {scan,error:pollError}=useScan(open?id:null);
 useEffect(()=>{let previous=location.pathname;let timer:ReturnType<typeof setTimeout>;const check=()=>{if(previous!==location.pathname){previous=location.pathname;setUsername(profileRoute(previous));setId(null);setError('');}};const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(check,150);});observer.observe(document.body,{childList:true});const interval=setInterval(check,700);window.addEventListener('popstate',check);return()=>{observer.disconnect();clearTimeout(timer);clearInterval(interval);window.removeEventListener('popstate',check);};},[]);
 async function start(){if(!username)return;const requested=username;setOpen(true);setError('');try{const response=await send<{id:string}>({type:'SCAN',username:requested,mode:'deep'});if(profileRoute(location.pathname)===requested)setId(response.id);}catch(cause){if(profileRoute(location.pathname)===requested)setError(cause instanceof Error?cause.message:'Backend unavailable');}}
 if(!username)return null;return <>{!open&&<button className="scan-launcher" onClick={()=>void start()}>✳ Scan @{username}</button>}{open&&<Panel scan={scan?.username===username?scan:null} error={error||pollError} onClose={()=>setOpen(false)} onScan={()=>void start()}/>}</>;}
if(!document.getElementById(hostId)){const host=document.createElement('div');host.id=hostId;document.documentElement.append(host);const shadow=host.attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=css;shadow.append(style);const mount=document.createElement('div');shadow.append(mount);createRoot(mount).render(<React.StrictMode><App/></React.StrictMode>);}
