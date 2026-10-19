import {createApp} from './server.js';
import {config} from '../../../packages/shared/src/config.js';
import {query,pool} from '../../../packages/database/src/index.js';
import {enqueue,closeQueue} from './queue.js';

console.log(JSON.stringify({level:'info',event:'api_starting',msg:`API process starting on 0.0.0.0:${config.PORT}`}));
const app=await createApp();
let reconciling=false;
const reconcile=async()=>{
 if(reconciling)return;
 reconciling=true;
 try {
  const pending=await query("SELECT id,generation FROM scan_jobs WHERE status IN ('queued','running','paused') AND (retry_at IS NULL OR retry_at<=now()) ORDER BY created_at LIMIT 100");
  for(const row of pending.rows)await enqueue(row.id,row.generation);
 }catch{app.log.warn('Queue reconciliation deferred');}finally{reconciling=false;}
};
const timer=setInterval(()=>void reconcile(),15000);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
 clearInterval(timer);
 void app.close().then(()=>closeQueue()).then(()=>pool.end());
});
await app.listen({host:'0.0.0.0',port:config.PORT});
void fetch(`http://127.0.0.1:${config.PORT}/health/ready`,{headers:{host:'healthcheck.railway.app'},signal:AbortSignal.timeout(10000)}).then(response=>{
 if(response.ok)app.log.info('API startup check passed: local HTTP, database migrations, schema and Redis are ready');
 else app.log.warn({status:response.status},'API startup check failed: see Readiness failed message for the dependency');
}).catch(()=>app.log.error('API startup check failed: local HTTP request did not complete within 10 seconds'));
void reconcile();
