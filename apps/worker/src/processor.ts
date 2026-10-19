import type {Job} from 'bullmq';
import {UnrecoverableError} from 'bullmq';
import {createHash} from 'node:crypto';
import {pool,query,db} from '../../../packages/database/src/index.js';
import {accountLabels} from '../../../packages/database/src/schema.js';
import {config} from '../../../packages/shared/src/config.js';
import {VERSION,type Profile,type Post,type Label,type Member,type WalletEvidence} from '../../../packages/shared/src/index.js';
import {retryDelay} from '../../../packages/shared/src/retry.js';
import {DemoX,OfficialX,Helius,ProviderError,demoLabels,type XDataProvider} from '../../../packages/providers/src/index.js';
import {classify,analyze} from '../../../packages/scoring/src/index.js';
import type {WorkItem} from '../../api/src/queue.js';

export interface Checkpoint {profile?:Profile;posts?:Post[];cursor?:string;done?:boolean;deep?:boolean;elapsed?:number;limitations?:string[];wallets?:WalletEvidence[]}
const provider=config.DEMO_MODE?new DemoX():new OfficialX(config.X_API_BEARER_TOKEN);

export async function processAnalysis(job:Pick<Job<WorkItem>,'data'|'attemptsMade'>,source:XDataProvider=provider) {
 const lease=await pool.connect();
 let checkpoint:Checkpoint={};
 let locked=false;
 let operationStarted=Date.now();
 try {
  locked=(await lease.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[job.data.id])).rows[0].locked;
  if(!locked)return;
  const row=(await query('SELECT * FROM scan_jobs WHERE id=$1',[job.data.id])).rows[0];
  if(!row||row.generation!==job.data.generation||['complete','failed'].includes(row.status))return;
  checkpoint=row.checkpoint;
  if(row.demo!==config.DEMO_MODE)throw new ProviderError('worker_mode_mismatch');
  await query("UPDATE scan_jobs SET status='running',stage='Quick Scan · resolving profile',retry_at=null WHERE id=$1",[row.id]);
  if(!checkpoint.profile) {
   const profile=await source.getProfile(row.username);
   const canonicalKey=createHash('sha256').update(`${row.demo?'demo':'live'}:${profile.id}:${VERSION}`).digest('hex');
   await lease.query('BEGIN');
   try {
    await lease.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[canonicalKey]);
    const canonical=(await lease.query('SELECT * FROM scan_jobs WHERE key=$1 AND id<>$2 FOR UPDATE',[canonicalKey,row.id])).rows[0];
    await lease.query('INSERT INTO x_profiles(id,username,data,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(id) DO UPDATE SET username=$2,data=$3,updated_at=now()',[profile.id,profile.username,profile]);
    await lease.query('INSERT INTO x_profile_aliases(username,profile_id) VALUES($1,$2) ON CONFLICT(username) DO UPDATE SET profile_id=$2,updated_at=now()',[row.username,profile.id]);
    if(canonical) {
     await lease.query('UPDATE scan_requests SET job_id=$2 WHERE job_id=$1',[row.id,canonical.id]);
     const expired=Date.now()-new Date(canonical.updated_at).getTime()>config.CACHE_TTL_SECONDS*1000;
     if(canonical.status==='failed'||(expired&&canonical.status==='complete')) {
      await lease.query("UPDATE scan_jobs SET generation=generation+1,status='queued',stage='Refreshing profile',checkpoint=$2,pages=0,processed=0,reason=null,retry_at=null,updated_at=now() WHERE id=$1",[canonical.id,{deep:checkpoint.deep??false}]);
      await lease.query('DELETE FROM follower_edges WHERE job_id=$1',[canonical.id]);
     }else if(checkpoint.deep) {
      await lease.query("UPDATE scan_jobs SET checkpoint=jsonb_set(checkpoint,'{deep}','true'),status=CASE WHEN reason='quick_scan' THEN 'queued' ELSE status END,generation=generation+CASE WHEN reason='quick_scan' THEN 1 ELSE 0 END,reason=CASE WHEN reason='quick_scan' THEN null ELSE reason END WHERE id=$1",[canonical.id]);
     }
     await lease.query("UPDATE scan_jobs SET status='complete',reason='shared_analysis',stage='Using shared public analysis' WHERE id=$1",[row.id]);
     await lease.query('COMMIT');return;
    }
    await lease.query('UPDATE scan_jobs SET key=$2,profile_id=$3 WHERE id=$1',[row.id,canonicalKey,profile.id]);
    await lease.query('COMMIT');
   }catch(error){await lease.query('ROLLBACK');throw error;}
   const limitations=[...source.getCapabilities().limitations];
   let posts:Post[]=[];
   try{posts=await source.getRecentPosts(profile.id);}catch(error){if(error instanceof ProviderError)limitations.push(`Posts unavailable: ${error.code}`);else throw error;}
   checkpoint={...checkpoint,profile,posts,limitations,done:profile.protected};
   if(profile.protected)limitations.push('Protected profile: audience unavailable');
   await query("UPDATE scan_jobs SET checkpoint=$2 || jsonb_build_object('deep',coalesce((checkpoint->>'deep')::boolean,false) OR $3) WHERE id=$1",[row.id,checkpoint,checkpoint.deep??false]);
  }
  const profile=checkpoint.profile!;
  const labels=(await db.select().from(accountLabels)).map(row=>row.data as Label);
  let pages:number=row.pages;
  while(true) {
   const state=(await query('SELECT checkpoint,generation FROM scan_jobs WHERE id=$1',[row.id])).rows[0];
   if(state.generation!==job.data.generation)return;
   checkpoint.deep=state.checkpoint.deep;
   let members=(await query('SELECT data FROM follower_edges WHERE job_id=$1 ORDER BY account_id',[row.id])).rows.map(row=>row.data as Member);
   let reason=members.length>=config.SCAN_MAX_FOLLOWERS||pages>=config.SCAN_MAX_PAGES?'sample_limit':checkpoint.done?'audience_exhausted':(checkpoint.elapsed??0)>=config.SCAN_MAX_SECONDS*1000?'duration_limit':null;
   let additions:Member[]=[];
   if(!reason) {
    try {
     const page=await source.getFollowersPage(profile.id,checkpoint.cursor);
     const accepted=page.accounts.slice(0,config.SCAN_MAX_FOLLOWERS-members.length);
     const currentLabels=row.demo?[...demoLabels(accepted),...labels]:labels;
     const known=new Set(members.map(member=>member.profile.id));
     additions=accepted.filter(account=>!known.has(account.id)).map(account=>classify(account,currentLabels));
     members=[...members,...additions];
     const repeatedCursor=!!page.cursor&&page.cursor===checkpoint.cursor;
     checkpoint={...checkpoint,cursor:page.cursor,done:!page.cursor||repeatedCursor};
     if(repeatedCursor){reason='provider_pagination_stalled';checkpoint.limitations=[...(checkpoint.limitations??[]),'Provider returned the same cursor; pagination stopped'];}
     pages++;
    }catch(error) {
     if(error instanceof ProviderError&&!error.transient&&error.code!=='deep_scan_failed') {
      checkpoint.done=true;reason='data_unavailable';checkpoint.limitations=[...(checkpoint.limitations??[]),`Followers unavailable: ${error.code}`];
     }else throw error;
    }
   }
   const walletLabels=row.demo?[...demoLabels(members.map(member=>member.profile)),...labels]:labels;
   const links=walletLabels.filter(label=>label.wallet&&label.method&&label.confidence>=0.8&&(label.accountId===profile.id||members.some(member=>member.profile.id===label.accountId)));
   const wallets=checkpoint.wallets??[];
   for(const label of links) {
    if(wallets.length>=config.SCAN_MAX_WALLETS||(checkpoint.elapsed??0)+Date.now()-operationStarted>=config.SCAN_MAX_SECONDS*1000)break;
    if(wallets.some(wallet=>wallet.accountId===label.accountId&&wallet.address===label.wallet))continue;
    let balanceSol:number|null=null;const limitations=['PnL requires complete cost basis, historical prices and fees'];
    if(!row.demo&&config.HELIUS_API_KEY){try{const summary=await new Helius(config.HELIUS_API_KEY).getWalletSummary(label.wallet!);balanceSol=summary.balanceSol;}catch(error){limitations.push(error instanceof ProviderError?error.code:'wallet_provider_unavailable');}}
    else limitations.push(row.demo?'Synthetic DEMO evidence; not real ownership':'Helius API key is not configured');
    const evidence:WalletEvidence={address:label.wallet!,network:'solana',source:label.source,verifiedAt:label.verifiedAt,confidence:label.confidence,method:label.method!,accountId:label.accountId,metrics:{balanceSol,realizedPnl:label.historyQuality==='sufficient'&&label.pnlCurrency==='USD'?label.realizedPnl??null:null,unrealizedPnl:label.historyQuality==='sufficient'&&label.pnlCurrency==='USD'?label.unrealizedPnl??null:null,fees:label.pnlCurrency==='USD'?label.fees??null:null,closedTrades:label.closedTrades??null,period:label.period??null,historyQuality:label.historyQuality??'insufficient',source:label.source,observedAt:new Date().toISOString(),limitations}};
    wallets.push(evidence);
   }
   checkpoint.wallets=wallets;
   checkpoint.elapsed=(checkpoint.elapsed??0)+Date.now()-operationStarted;
   reason=reason??(members.length>=config.SCAN_MAX_FOLLOWERS||pages>=config.SCAN_MAX_PAGES?'sample_limit':checkpoint.done?'audience_exhausted':checkpoint.elapsed>=config.SCAN_MAX_SECONDS*1000?'duration_limit':!checkpoint.deep?'quick_scan':null);
   const result=analyze(profile,members,checkpoint.posts??[],row.demo,checkpoint.limitations);
   result.wallets=wallets;
   await lease.query('BEGIN');
   try {
    const live=(await lease.query('SELECT checkpoint FROM scan_jobs WHERE id=$1 FOR UPDATE',[row.id])).rows[0];
    if(live.checkpoint.deep){checkpoint.deep=true;if(reason==='quick_scan')reason=null;}
    for(const member of additions)await lease.query('INSERT INTO follower_edges VALUES($1,$2,$3) ON CONFLICT(job_id,account_id) DO NOTHING',[row.id,member.profile.id,member]);
    await lease.query('UPDATE scan_jobs SET result=$2,processed=$3,pages=$4,status=$5,stage=$6,reason=$7,checkpoint=$8,updated_at=now() WHERE id=$1 AND generation=$9',[row.id,result,members.length,pages,reason?'complete':'running',reason?'Analysis finished':'Deep Scan · expanding audience',reason,checkpoint,job.data.generation]);
    await lease.query('INSERT INTO scan_results VALUES($1,$2,$3,now()) ON CONFLICT(job_id) DO UPDATE SET formula_version=$2,data=$3,updated_at=now()',[row.id,VERSION,result]);
    await lease.query('INSERT INTO audience_snapshots(job_id,data) VALUES($1,$2)',[row.id,{count:members.length,audience:result.audience,version:VERSION}]);
    await lease.query('INSERT INTO scan_events(job_id,data) VALUES($1,$2)',[row.id,{generation:job.data.generation,pages,processed:members.length,reason}]);
    await lease.query('COMMIT');
   }catch(error){await lease.query('ROLLBACK');throw error;}
   if(reason)return;
   operationStarted=Date.now();
  }
 }catch(error) {
  const retry=!(error instanceof ProviderError)||error.transient;
  const exhausted=job.attemptsMade>=4;
  const reason=error instanceof ProviderError?error.code:'processing_error';
  const delay=retryDelay(job.attemptsMade+1,error instanceof ProviderError?error.retryAfter:0);
  checkpoint.elapsed=(checkpoint.elapsed??0)+Date.now()-operationStarted;
  try{await query('UPDATE scan_jobs SET status=$2,stage=$3,reason=$4,retry_at=$5,checkpoint=$6,updated_at=now() WHERE id=$1 AND generation=$7',[job.data.id,retry&&!exhausted?'paused':'failed',retry&&!exhausted?'Waiting for provider retry':'Scan failed',reason,retry&&!exhausted?new Date(Date.now()+delay):null,checkpoint,job.data.generation]);await query('INSERT INTO scan_events(job_id,data) VALUES($1,$2)',[job.data.id,{error:reason,attempt:job.attemptsMade+1,retry:retry&&!exhausted}]);}catch{console.error(JSON.stringify({event:'checkpoint_unavailable',jobId:job.data.id}));}
  if(!retry)throw new UnrecoverableError(reason);
  throw error;
 }finally {
  if(locked)await lease.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[job.data.id]).catch(()=>{});
  lease.release();
 }
}
