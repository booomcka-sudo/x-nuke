import {useEffect,useState,type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {Panel,useScan,format} from './Panel.js';
import {send} from './bridge.js';
import {explainError} from './errors.js';
import {Icon} from './Icon.js';
import {profileRoute} from '../../../packages/shared/src/index.js';
import './style.css';
import './extra.css';

interface ServiceStatus {mode:'DEMO'|'LIVE';initialized:boolean;workerOnline:boolean;providers:{x:boolean;solana:boolean};limits:{followers:number;pages:number;daily:number};limitations:string[]}
interface Me {mode:string;dailyLimit:number;used:number;budget?:{quickFollowers:number;deepFollowers:number;fetchPosts:boolean}}
interface History {id:string;username:string;status:string;score:number|null}
function App() {
 const options=location.pathname.includes('options');const report=location.pathname.includes('report');
 const id=new URLSearchParams(location.search).get('id');
 const {scan,error:scanError,reload}=useScan(report?id:null);
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [pendingDeep,setPendingDeep]=useState(false);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [service,setService]=useState<ServiceStatus|null>(null);const [me,setMe]=useState<Me|null>(null);
 const [username,setUsername]=useState<string|null>(null);const [history,setHistory]=useState<History[]>([]);
 async function connect() {
  setError('');
  try{setService(await send<ServiceStatus>({type:'STATUS'}));}catch(cause){setError(explainError(cause));}
  try{setMe(await send<Me>({type:'ME'}));}catch{setMe(null);}
 }
 useEffect(()=>{
  void connect();
  if(!options&&!report) {
   void chrome.tabs.query({active:true,currentWindow:true}).then(tabs=>{
    const url=tabs[0]?.url?new URL(tabs[0].url):null;
    if(url&&['x.com','twitter.com'].includes(url.hostname))setUsername(profileRoute(url.pathname));
   }).catch(()=>{});
   void send<History[]>({type:'HISTORY'}).then(setHistory).catch(()=>{});
  }
 },[options,report]);
 async function login(event:FormEvent) {
  event.preventDefault();setBusy(true);setError('');
  try{await send({type:'LOGIN',email,password});setPassword('');await connect();}
  catch(cause){setError(explainError(cause));}finally{setBusy(false);}
 }
 async function scanProfile(mode:'quick'|'deep',confirmed=false) {
  if(mode==='deep'&&!confirmed){setPendingDeep(true);return;}
  setPendingDeep(false);
  if(!username)return;setBusy(true);setError('');
  try{const created=await send<{id:string}>({type:'SCAN',username,mode,confirmPaid:confirmed});await send({type:'REPORT',id:created.id});}
  catch(cause){setError(explainError(cause));}finally{setBusy(false);}
 }
 function exportReport() {
  if(!scan)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(scan,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='x-nuke-'+scan.username+'-report.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 if(report)return <main className="pages report"><header className="report-header"><div><h1>Public profile report</h1><p className="bio">Evidence, methodology and data limitations</p></div><div className="tools"><button onClick={exportReport} disabled={!scan?.result}>Export JSON</button><button onClick={()=>window.print()} disabled={!scan?.result}>Print</button></div></header>
  {service&&!service.workerOnline&&<p className="error">Worker is offline. Existing results remain available; new scans will wait for it to reconnect.</p>}
  <div className="report-grid"><Panel scan={scan} error={scanError} report onStop={()=>{if(id)void send({type:'CANCEL_SCAN',id}).then(reload).catch(cause=>setError(explainError(cause)));}} onScan={scan?()=>{void send({type:'SCAN',username:scan.username,mode:'quick'}).then(reload).catch(cause=>setError(explainError(cause)));}:undefined} onDeep={scan?()=>{void send({type:'SCAN',username:scan.username,mode:'deep',confirmPaid:true}).then(reload).catch(cause=>setError(explainError(cause)));}:undefined}/>
   <div>{error&&<p role="alert" className="error">{error}</p>}{scan?.result?.components.map(component=><article key={component.name}><div className="row"><h2>{component.name}</h2><strong>{component.value===null?'Not available':component.value.toFixed(1)+' / 100'}</strong></div><p>{component.reason}</p><small>Heuristic weight {component.weight}%</small><details><summary>Evidence sources ({component.sources.length})</summary>{[...new Set(component.sources)].map(source=><p key={source}><a href={source} target="_blank" rel="noreferrer">{source}</a></p>)}</details></article>)}
    <article><h2>Data limitations</h2>{scan?.result?.limitations.map(item=><p key={item}>{item}</p>)}<p>Formula {scan?.result?.formulaVersion} · Available weights {scan?.result?.availableWeight}%</p><p className="bio">Coverage measures inspected followers / total followers. Confidence is a separate heuristic for evidence quality. This report supports further research and does not establish financial performance without the cited history.</p></article>
    <article><h2>Reach methodology</h2><p>{scan?.result?.reach.method}</p><p>Total Follower Reach: {format(scan?.result?.reach.total)}</p>{scan?.result?.reach.limitations.map(item=><p key={item}>{item}</p>)}<small>Snapshot {scan?.result?.updatedAt}</small></article>
   </div>
  </div></main>;
 return <main className={'pages '+(options?'settings':'popup')}><header className="row"><h1 className="brand"><Icon name="nuke"/>Nuke <small>Alpha Scanner</small></h1><span className="badge">{service?.mode??'OFFLINE'}</span></header>
  <div className="connection" role="status"><span className={'dot '+(service?'online':'offline')}/>{service?'API connected':'Connecting to API…'}{service&&<small> · Worker {service.workerOnline?'online':'offline'}</small>}</div>
  {error&&<div role="alert" className="error">{error}</div>}
  {options?<>
   <section className="settings-section"><h2>{me?'Signed in':'Sign in to X Nuke'}</h2>{me?<><p className="bio">Connected · {me.mode} · {me.used} / {me.dailyLimit} daily requests used</p><button className="wide" onClick={()=>{void send({type:'LOGOUT'}).catch(()=>{}).finally(()=>{setMe(null);setHistory([]);});}}>Sign out</button></>:<form onSubmit={event=>void login(event)}><label>Email<input type="email" autoComplete="username" required value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)}/></label><button className="primary wide" type="submit" disabled={busy||service?.initialized===false}>{busy?'Signing in…':'Sign in'}</button></form>}</section>
   {service?.initialized===false&&<section className="settings-section"><h2>First account setup required</h2><p className="bio">In the Railway API service, configure ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters), then redeploy. The API pre-deploy command creates the first account once. You can also use the protected server CLI: pnpm user:create.</p><button className="wide" onClick={()=>void connect()}>Check setup again</button></section>}
   <section className="settings-section"><h2>Server connection</h2><p className="bio">{import.meta.env.VITE_API_ORIGIN??'API origin embedded in background worker'}</p><button className="wide" onClick={()=>void connect()}>Check connection</button>{service&&<><div className="reach"><div className="row"><span>Mode</span><strong>{service.mode}</strong></div><div className="row"><span>X provider configured</span><strong>{service.providers.x?'Yes':'No'}</strong></div><div className="row"><span>Helius configured</span><strong>{service.providers.solana?'Yes':'No'}</strong></div><div className="row"><span>Scan sample budget</span><strong>{me?.budget?me.budget.quickFollowers+' Quick / '+me.budget.deepFollowers+' Deep total':'Sign in to view budget'}</strong></div></div>{service.limitations.map(item=><p className="bio" key={item}>{item}</p>)}</>}</section>
   <p className="bio">Provider credentials stay on the server. The extension never reads your X cookies or private messages.</p>
  </>:<>
   {!me&&<p className="bio">Sign in through Settings before scanning.</p>}
   <p className="bio">Current profile: {username?'@'+username:'Open a profile on x.com'}</p>
   {username&&<div className="stats"><button className="primary" disabled={busy||!me} onClick={()=>void scanProfile('quick')}>Quick Scan</button><button className="purple" disabled={busy||!me?.budget} onClick={()=>void scanProfile('deep')}>Deep Scan</button></div>}
   {pendingDeep&&<div className="cost-confirm"><p>Deep Scan inspects up to {me?.budget?.deepFollowers??20} followers total. X API charges apply in LIVE mode.</p><button className="wide" onClick={()=>void scanProfile('deep',true)}>Confirm Deep Scan</button><button className="wide" onClick={()=>setPendingDeep(false)}>Cancel</button></div>}<h2 className="mt-6">Recent scans</h2>{!history.length&&<p className="bio">Your scans will appear here.</p>}{history.map(row=><button className="history row" key={row.id} onClick={()=>void send({type:'REPORT',id:row.id}).catch(cause=>setError(explainError(cause)))}><span>@{row.username}<small className="block">{row.status}</small></span><strong>{row.score??'—'}</strong></button>)}
   <button className="wide" onClick={()=>void send({type:'OPTIONS'}).catch(cause=>setError(explainError(cause)))}>Settings & sign in</button>
  </>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
