import {useCallback,useEffect,useState} from 'react';
import type {ScanView,WalletEvidence} from '../../../packages/shared/src/index.js';
import {send} from './bridge.js';
import {explainError} from './errors.js';
import {Icon} from './Icon.js';

export const format=(number:number|null|undefined)=>number===null||number===undefined?'Not available':Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(number);
const colors=['#26c685','#9d7af4','#4099ed','#6c7788','#f59656','#a4a8b4'];
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
 const handle=result?.profile.username??username??scan?.username??'profile';
 const openSettings=()=>void send({type:'OPTIONS'}).catch(()=>{});
 const status=active?'Scanning':scan?.status==='failed'?'Scan failed':result?'Quick Scan':'Ready';
 return <aside className="panel" aria-label="X Nuke analysis">
  <header className="bar"><span className="brand"><span className="logo"><Icon name="nuke"/></span>Nuke</span><span className="scan-status"><i className={'dot '+(scan?.status==='failed'?'status-error':'online')}/>{status}</span><div className="tools"><button aria-label="Settings" onClick={openSettings}><Icon name="settings"/></button>{onClose&&<button aria-label="Close panel" onClick={onClose}><Icon name="close"/></button>}</div></header>
  {result?.demo&&<div className="notice">Demo · synthetic data for product evaluation</div>}
  <section className="section profile-section">
   <div className="profile">{result?.profile.avatar?<img className="avatar" alt="" src={result.profile.avatar} referrerPolicy="no-referrer"/>:<span className="avatar"><Icon name="nuke"/></span>}<div className="profile-copy"><h2>@{handle}</h2><p className="bio">{result?.profile.description??'Public profile · audience research'}</p></div></div>
   {error&&<div role="alert" className="error">{error}<button className="wide" onClick={openSettings}>Open sign-in settings</button></div>}
   {!scan&&!error&&<p role="status" className="bio">{busy?'Quick Scan queued. Waiting for provider data.':'Ready to inspect this public profile.'}</p>}
   {!result&&onScan&&<button className="wide scan-action" disabled={busy||active} onClick={onScan}>{busy||active?'Scanning…':'Start Quick Scan'}<Icon name="arrow"/></button>}
  </section>
  {!result&&<>
   <section className="section score-section"><div className="row"><h2>Alpha Score</h2><small>Awaiting data</small></div><div className="score">—<small>Insufficient data</small></div><div className="track"/><p className="bio">A score appears when enough verified data is available.</p></section>
   <section className="section followers-section"><div className="follower-grid"><div><h2>Followers (total)</h2><strong>—</strong></div><div><h2>Checked</h2><strong>{scan?.processed??0}</strong><div className="track coverage-track"/></div></div></section>
   <section className="section audience-section"><h2>Audience</h2><p className="bio">{active?'Waiting for the first audience page.':'No audience data available for this scan.'}</p></section>
  </>}
  {result&&<>
   <section className="section score-section"><div className="row"><h2>Alpha Score</h2><small>{result.preliminary?'Preliminary':'Complete'}</small></div>
    <div className="score">{result.score??'—'}<small>{result.score===null?'Insufficient data':'/100'}</small></div>
    <div className="track" role="meter" aria-label="Alpha Score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={result.score??undefined}><div className="fill" style={{width:(result.score??0)+'%'}}/></div>
    <div className="row muted score-meta"><span>Confidence {result.confidence}%</span><span title="Available heuristic formula weights">{result.availableWeight}% available weights</span></div>
   </section>
   <section className="section followers-section"><div className="follower-grid"><div><h2>Followers (total)</h2><strong>{format(result.profile.followers)}</strong></div><div><div className="row"><h2>Checked</h2><small>{result.coverage===null?'Unknown':result.coverage.toFixed(1)+'%'}</small></div><div className="checked-number"><strong>{format(result.denominator)}</strong><small> / {format(result.profile.followers)}</small></div><div className="track coverage-track"><div className="fill" style={{width:Math.min(100,result.coverage??0)+'%'}}/></div></div></div><p className="snapshot">Updated {new Date(result.updatedAt).toLocaleTimeString()} · {scan?.stale?'Stale cache — refresh recommended':'Current snapshot'}</p></section>
   <section className="section audience-section"><div className="row"><h2>Audience</h2><small>n = {result.denominator}</small></div>
    <div className="audience-list">{result.audience.map((item,index)=><details className="category" key={item.category}><summary><span className="category-label"><i className="dot" style={{background:colors[index]}}/>{item.category}</span><strong>{format(item.count)}</strong><small>{item.percent.toFixed(1)}%</small><span className="chevron" aria-hidden="true">›</span></summary>
     {!item.count&&<p className="bio">No matching accounts in this inspected sample.</p>}
     {result.members.filter(member=>member.category===item.category).map(member=><div className="member" key={member.profile.id}><a href={member.profile.source} target="_blank" rel="noreferrer">@{member.profile.username}</a><p>{member.reason}</p><small>{member.tags.join(' · ')}</small><div>{[...new Set(member.sources)].map(source=><a key={source} href={source} target="_blank" rel="noreferrer">Source ↗ </a>)}</div></div>)}
    </details>)}</div><p className="sample-note">Share of inspected sample, including Unknown.</p>
   </section>
   <section className="section reach-section"><h2>Reach</h2><div className="reach-grid"><div><small>Total followers</small><strong>{format(result.reach.total)}</strong></div><div><small>Unique (est.)</small><strong className="unavailable">Not available</strong></div><div><small>Alpha</small><strong className="unavailable">Not available</strong></div></div><details className="method"><summary>How reach is measured</summary><p className="bio">{result.reach.method}. No intersection data.</p></details></section>
  </>}
  <section className="section deep-section"><div className="row"><h2><Icon name="bolt"/><span>Deep Scan</span></h2><small>{scan?.status??'Ready'}</small></div><div className="deep" role="status"><p>{scan?.stage??'Available after Quick Scan'}</p><div className="row"><small>{scan?.processed??0} inspected · {scan?.pages??0} pages</small>{result?.coverage!==null&&result?.coverage!==undefined&&<small>{result.coverage.toFixed(1)}% coverage</small>}</div>{result&&<div className="track deep-track"><div className="fill" style={{width:Math.min(100,result.coverage??0)+'%'}}/></div>}{scan?.reason&&<p className={scan.status==='failed'?'error':'bio'}>{explainError(scan.reason)}</p>}{scan?.retryAt&&<p className="bio">Retry after {new Date(scan.retryAt).toLocaleTimeString()}</p>}</div>
   {result&&onDeep&&scan?.reason==='quick_scan'&&<button className="wide deep-action" disabled={busy||active} onClick={onDeep}>Start Deep Scan<Icon name="arrow"/></button>}
   {result&&onScan&&<button className="wide refresh-action" disabled={busy||active} onClick={onScan}><Icon name="refresh"/>{active?'Analysis in progress…':scan?.status==='failed'?'Retry scan':'Refresh Quick Scan'}</button>}
  </section>
  {result&&<details className="section wallet-section"><summary>Public wallet links <small>{result.wallets?.length??0} verified</small><span className="chevron">›</span></summary>{result.wallets?.length?result.wallets.map(wallet=><WalletDetails key={wallet.accountId+wallet.address} wallet={wallet}/>):<p className="bio">No sufficiently verified public wallet links in the inspected data. Username and avatar matches do not establish ownership.</p>}</details>}
  {scan&&!report&&<footer className="panel-footer"><button className="wide report-action" onClick={()=>void send({type:'REPORT',id:scan.id}).catch(()=>{})}>View Full Report <Icon name="arrow"/></button></footer>}
 </aside>;
}
