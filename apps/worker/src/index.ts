import {Worker} from 'bullmq';
import {randomUUID} from 'node:crypto';
import {config} from '../../../packages/shared/src/config.js';
import {redisOptions} from '../../../packages/shared/src/redis.js';
import {retryDelay} from '../../../packages/shared/src/retry.js';
import {query,pool} from '../../../packages/database/src/index.js';
import {ProviderError} from '../../../packages/providers/src/index.js';
import {processAnalysis} from './processor.js';

const instanceId=randomUUID();
const heartbeat=()=>query('INSERT INTO worker_heartbeats(instance_id,demo,updated_at) VALUES($1,$2,now()) ON CONFLICT(instance_id) DO UPDATE SET updated_at=now(),demo=$2',[instanceId,config.DEMO_MODE]).catch(()=>console.error(JSON.stringify({event:'heartbeat_unavailable'})));
const worker=new Worker('analysis',job=>processAnalysis(job),{
 connection:redisOptions(config.REDIS_URL,true),
 concurrency:config.SCAN_CONCURRENCY,
 settings:{backoffStrategy:(attempts,_type,error)=>retryDelay(attempts,error instanceof ProviderError?error.retryAfter:0)}
});
let checking=false;
const timer=setInterval(()=>{if(checking||!worker.isRunning())return;checking=true;void worker.client.then(client=>{if(client.status==='ready')return heartbeat();}).finally(()=>{checking=false;});},10000);
worker.on('ready',()=>void heartbeat());
worker.on('error',()=>console.error(JSON.stringify({level:'error',event:'worker_connection_error'})));
worker.on('completed',job=>console.log(JSON.stringify({level:'info',event:'completed',id:job.id})));
worker.on('failed',job=>console.error(JSON.stringify({level:'error',event:'analysis_attempt_failed',id:job?.id,attempts:job?.attemptsMade})));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
 clearInterval(timer);
 void worker.close().then(()=>query('DELETE FROM worker_heartbeats WHERE instance_id=$1',[instanceId])).finally(()=>pool.end());
});
