import {createApp} from './server.js';
import {config} from '../../../packages/shared/src/config.js';
import {query,pool} from '../../../packages/database/src/index.js';
import {enqueue,closeQueue} from './queue.js';

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
void reconcile();
