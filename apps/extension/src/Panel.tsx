import {useCallback,useEffect,useState} from 'react';
import type {ScanView,WalletEvidence} from '../../../packages/shared/src/index.js';
import {send} from './bridge.js';
import {explainError} from './errors.js';
import {Icon} from './Icon.js';

export const format=(number:number|null|undefined)=>number===null||number===undefined?'Not available':Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(number);
const colors=['#b2f583','#dab26b','#80b2ff','#acacba','#e18b87','#737681'];
export function useScan(id:string|null) {
 const [scan,setScan]=useState<ScanView|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 const reload=useCallback(()=>setRevision(value=>value+1),[]);
 useEffect(()=>{
  setScan(null);setError('');if(!id)return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>;let delay=1000;
  const poll=async()=>{
   if(document.hidden){timer=setTimeout(()=>void poll(),5000);return;}
   try{
    const next=await send<ScanView>({type:'GET_SCAN',id});
    if(cancelled)return;
    setScan(next);setError('');
    if(!['complete','failed'].includes(next.status)){timer=setTimeout(()=>void poll(),delay);delay=Math.min(delay*1.3,10000);}
   }catch(cause){
    if(cancelled)return;setError(explainError(cause));
    if(!/unauthorized|invalid_session|scan_not_found/.test(String(cause)))timer=setTimeout(()=>void poll(),Math.min(delay*=2,30000));
   }
  };
  void poll();return()=>{cancelled=true;clearTimeout(timer);};
 },[id,revision]);
 return {scan,error,reload};
}
export function WalletDetails({wallet}:{wallet:WalletEvidence}) {
 const metrics=wallet.metrics;
 return <details className="wallet"><summary>{wallet.address.slice(0,7)}…{wallet.address.slice(-5)} <small>Solana · {Math.round(wallet.confidence*100)}% confidence</small></summary>
  <p className="bio">{wallet.address}</p><p>{wallet.method}</p>
  <p><a href={wallet.source} target="_blank" rel="noreferrer">Ownership evidence ↗</a> · <small>Verified {new Date(wallet.verifiedAt).toLocaleDateString()}</small></p>
  <div className="reach"><div className="row"><span>SOL balance</span><strong>{metrics.balanceSol??'Not available'}</strong></div>
  <div className="row"><span>Realized PnL</span><strong>{metrics.realizedPnl===null?'Not available':'$'+metrics.realizedPnl.toLocaleString()}</strong></div>
  <div className="row"><span>Unrealized PnL</span><strong>{metrics.unrealizedPnl===null?'Not available':'$'+metrics.unrealizedPnl.toLocaleString()}</strong></div>
  <div className="row"><span>Closed trades / fees</span><small>{metrics.closedTrades??'Unknown'} / {metrics.fees===null?'Unknown':'$'+metrics.fees}</small></div></div>
  <p className="bio">Period: {metrics.period??'Not available'} · History: {metrics.historyQuality}</p>
  {metrics.limitations.map(item=><p className="bio" key={item}>{item}</p>)}
 </details>;
}
interface Props {scan:ScanView|null;error:string;username?:string;busy?:boolean;onClose?:()=>void;onScan?:()=>void;onDeep?:()=>void;report?:boolean}
export function Panel({scan,error,username,busy,onClose,onScan,onDeep,report=false}:Props) {
 const result=scan?.result;
 const active=!!scan&&!['complete','failed'].includes(scan.status);
 const title=result?.profile.name??username??scan?.username??'Alpha Scanner';
 const openSettings=()=>void send({type:'OPTIONS'}).catch(()=>{});
 return <aside className="panel" aria-label="X Nuke analysis">
  <header className="bar"><span className="brand"><span className="logo"><Icon name="nuke"/></span>Nuke <span className="badge">{result?.demo?'DEMO':result?'LIVE':'ALPHA'}</span></span><div className="tools"><button aria-label="Settings" onClick={openSettings}><Icon name="settings"/></button>{onClose&&<button aria-label="Close panel" onClick={onClose}><Icon name="close"/></button>}</div></header>
  {result?.demo&&<div className="notice">Demo · synthetic data for product evaluation</div>}
  <section className="section">
   <div className="profile">{result?.profile.avatar?<img className="avatar" alt="" src={result.profile.avatar} referrerPolicy="no-referrer"/>:<span className="avatar">{title[0].toUpperCase()}</span>}<div><h2>{title}</h2><small>@{result?.profile.username??username??scan?.username??'profile'}</small></div></div>
   <p className="bio">{result?.profile.description??'Public signals. Explainable audience research.'}</p>
   {error&&<div role="alert" className="error">{error}<button className="wide" onClick={openSettings}>Open sign-in settings</button></div>}
   {!scan&&!error&&<p role="status" className="bio">{busy?'Quick Scan queued. Results appear when data is available.':'Ready to inspect this public profile.'}</p>}
   {!result&&onScan&&<button className="wide primary" disabled={busy||active} onClick={onScan}>{busy||active?'Scanning…':'Start Quick Scan'}</button>}
  </section>
  {result&&<>
   <section className="section"><div className="row"><h2>Alpha Score</h2><small>{result.preliminary?'Preliminary':'Complete'}</small></div>
    <div className="score">{result.score??'—'}<small>{result.score===null?'Insufficient data':'/ 100'}</small></div>
    <div className="track" role="meter" aria-label="Alpha Score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={result.score??undefined}><div className="fill" style={{width:(result.score??0)+'%'}}/></div>
    <div className="row muted"><span>Confidence {result.confidence}%</span><span>Coverage {result.coverage===null?'Unknown':result.coverage.toFixed(2)+'%'}</span></div>
    <p className="bio">Available formula weights: {result.availableWeight}% · Heuristic estimate</p>
   </section>
   <section className="section"><h2>Followers</h2><div className="stats"><div className="stat"><strong>{format(result.profile.followers)}</strong><small>Total followers</small></div><div className="stat"><strong>{result.denominator.toLocaleString()}</strong><small>Actually inspected</small></div></div><p className="bio">Updated {new Date(result.updatedAt).toLocaleTimeString()} · {scan?.stale?'Stale cache — refresh recommended':'Current snapshot'}</p></section>
   <section className="section"><div className="row"><h2>Audience</h2><small>n = {result.denominator}</small></div><p className="bio">Share of inspected sample, including Unknown.</p>
    {result.audience.map((item,index)=><details className="category" key={item.category}><summary><span><i className="dot" style={{background:colors[index]}}/>{item.category}</span><span>{item.count} · {item.percent.toFixed(1)}%</span></summary>
     {!item.count&&<p className="bio">No matching accounts in this inspected sample.</p>}
     {result.members.filter(member=>member.category===item.category).map(member=><div className="member" key={member.profile.id}><a href={member.profile.source} target="_blank" rel="noreferrer">@{member.profile.username}</a><p>{member.reason}</p><small>{member.tags.join(' · ')}</small><div>{[...new Set(member.sources)].map(source=><a key={source} href={source} target="_blank" rel="noreferrer">Source ↗ </a>)}</div></div>)}
    </details>)}
   </section>
   <section className="section reach"><h2>Reach</h2><div className="row"><span>Total Follower Reach</span><strong>{format(result.reach.total)}</strong></div><div className="row"><span>Estimated Unique Reach</span><small>Not available</small></div><div className="row"><span>Alpha Reach</span><small>Not available</small></div><p className="bio">{result.reach.method}. No intersection data.</p></section>
   <section className="section"><div className="row"><h2>Public wallet links</h2><small>{result.wallets?.length??0} verified links</small></div>{result.wallets?.length?result.wallets.map(wallet=><WalletDetails key={wallet.accountId+wallet.address} wallet={wallet}/>):<p className="bio">No sufficiently verified public wallet links in the inspected data. Username and avatar matches do not establish ownership.</p>}</section>
  </>}
  <section className="section"><div className="row"><h2 className="purple">Deep Scan</h2><small>{scan?.status??'Ready'}</small></div><div className="deep" role="status"><p>{scan?.stage??'Available after Quick Scan'}</p><small>{scan?.processed??0} inspected · {scan?.pages??0} pages</small>{scan?.reason&&<p className={scan.status==='failed'?'error':'bio'}>{explainError(scan.reason)}</p>}{scan?.retryAt&&<p className="bio">Retry after {new Date(scan.retryAt).toLocaleTimeString()}</p>}</div>
   {result&&onDeep&&scan?.reason==='quick_scan'&&<button className="wide purple" disabled={busy||active} onClick={onDeep}>Start Deep Scan</button>}
   {result&&onScan&&<button className="wide" disabled={busy||active} onClick={onScan}>{active?'Analysis in progress…':scan?.status==='failed'?'Retry scan':'Refresh Quick Scan'}</button>}
   {scan&&!report&&<button className="wide primary" onClick={()=>void send({type:'REPORT',id:scan.id}).catch(()=>{})}>View Full Report <Icon name="arrow"/></button>}
  </section>
 </aside>;
}
