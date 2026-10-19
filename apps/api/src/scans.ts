import {pool,query} from '../../../packages/database/src/index.js';
import {config} from '../../../packages/shared/src/config.js';
import {VERSION,type ScanView} from '../../../packages/shared/src/index.js';
import {jobHash} from './queue.js';
import {scanBudget} from '../../../packages/shared/src/budget.js';

export class HttpError extends Error {constructor(public statusCode:number,message:string){super(message);}}
export async function requestScan(userId:string,username:string,mode:'quick'|'deep') {
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
  const profile=(await client.query('SELECT profile_id AS id FROM x_profile_aliases WHERE username=$1 UNION ALL SELECT id FROM x_profiles WHERE lower(username)=$1 LIMIT 1',[username])).rows[0];
  const key=jobHash(`${config.DEMO_MODE?'demo':'live'}:${profile?.id??username}:${VERSION}`);
  await client.query('INSERT INTO scan_jobs(key,username,demo,checkpoint) VALUES($1,$2,$3,$4) ON CONFLICT(key) DO NOTHING',[key,username,config.DEMO_MODE,{deep:mode==='deep'}]);
  const job=(await client.query('SELECT * FROM scan_jobs WHERE key=$1 FOR UPDATE',[key])).rows[0];
  const stale=Date.now()-new Date(job.updated_at).getTime()>config.CACHE_TTL_SECONDS*1000;
  const terminal=['complete','failed','cancelled'].includes(job.status);
  const resume=job.status==='cancelled';
  const expand=mode==='deep'&&job.reason==='quick_scan'&&!stale;
  const refresh=terminal&&(stale||job.status==='failed');
  const existing=(await client.query('SELECT id FROM scan_requests WHERE user_id=$1 AND job_id=$2 AND cancelled_at IS NULL ORDER BY created_at DESC LIMIT 1',[userId,job.id])).rows[0];
  const needsRequest=!existing||refresh||expand;
  if(needsRequest){
   const usage=await client.query('SELECT count(*)::int AS count FROM scan_requests WHERE user_id=$1 AND created_at>=date_trunc(\'day\',now() AT TIME ZONE \'UTC\') AT TIME ZONE \'UTC\'',[userId]);
   if(usage.rows[0].count>=config.SCAN_DAILY_LIMIT)throw new HttpError(429,'daily_quota_exceeded');
  }
  if(refresh){
   job.generation++;
   await client.query("UPDATE scan_jobs SET generation=$2,status='queued',stage='Refreshing profile',checkpoint=$3,pages=0,processed=0,reason=null,retry_at=null,updated_at=now() WHERE id=$1",[job.id,job.generation,{deep:mode==='deep'}]);
   await client.query('DELETE FROM follower_edges WHERE job_id=$1',[job.id]);
  } else if(expand||resume){
   job.generation++;
   await client.query("UPDATE scan_jobs SET generation=$2,status='queued',stage='Scan queued',reason=null,retry_at=null,checkpoint=jsonb_set(checkpoint,'{deep}',$3::jsonb),updated_at=now() WHERE id=$1",[job.id,job.generation,JSON.stringify(mode==='deep')]);
  } else if(mode==='deep'&&!terminal){
   await client.query("UPDATE scan_jobs SET checkpoint=jsonb_set(checkpoint,'{deep}','true') WHERE id=$1",[job.id]);
  }
  const request=needsRequest?(await client.query('INSERT INTO scan_requests(user_id,job_id,mode,username) VALUES($1,$2,$3,$4) RETURNING id',[userId,job.id,mode,username])).rows[0]:existing;
  await client.query('COMMIT');
  return {id:request.id as string,jobId:job.id as string,generation:job.generation as number,dispatch:!terminal||refresh||expand||resume};
 } catch(error){await client.query('ROLLBACK');throw error;} finally {client.release();}
}

export async function readScan(id:string,userId:string):Promise<ScanView|null> {
 const row=(await query('SELECT r.id,r.created_at,r.cancelled_at,j.id AS job_id,coalesce(r.username,j.username) AS username,j.status,j.stage,j.processed,j.pages,j.reason,j.retry_at,j.result FROM scan_requests r JOIN scan_jobs j ON j.id=r.job_id WHERE r.id=$1 AND r.user_id=$2',[id,userId])).rows[0];
 if(!row)return null;
 return {id:row.id,jobId:row.job_id,username:row.username,status:row.cancelled_at?'cancelled':row.status,stage:row.cancelled_at?'Stopped by you':row.stage,processed:row.processed,pages:row.pages,reason:row.cancelled_at?'user_cancelled':row.reason,retryAt:row.cancelled_at?null:row.retry_at?.toISOString()??null,result:row.result,stale:!!row.result&&Date.now()-Date.parse(row.result.updatedAt)>config.CACHE_TTL_SECONDS*1000,createdAt:row.created_at.toISOString(),budget:scanBudget()};
}

export async function cancelScan(id:string,userId:string) {
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const request=(await client.query('SELECT job_id FROM scan_requests WHERE id=$1 AND user_id=$2',[id,userId])).rows[0];
  if(!request)throw new HttpError(404,'scan_not_found');
  const job=(await client.query('SELECT status FROM scan_jobs WHERE id=$1 FOR UPDATE',[request.job_id])).rows[0];
  if(!['complete','failed','cancelled'].includes(job.status)) {
   await client.query('UPDATE scan_requests SET cancelled_at=now() WHERE job_id=$1 AND user_id=$2 AND cancelled_at IS NULL',[request.job_id,userId]);
   const others=(await client.query('SELECT EXISTS(SELECT 1 FROM scan_requests WHERE job_id=$1 AND user_id<>$2 AND cancelled_at IS NULL) AS active',[request.job_id,userId])).rows[0].active;
   if(!others)await client.query("UPDATE scan_jobs SET status='cancelled',stage='Stopped by user',reason='user_cancelled',generation=generation+1,retry_at=null,updated_at=now() WHERE id=$1",[request.job_id]);
  }
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 return readScan(id,userId);
}
