import {Queue} from 'bullmq';
import {createHash} from 'node:crypto';
import {config} from '../../../packages/shared/src/config.js';
import {redisOptions} from '../../../packages/shared/src/redis.js';
export const connection=redisOptions(config.REDIS_URL);
let queue:Queue|undefined;
export function analysisQueue(){if(!queue){queue=new Queue('analysis',{connection});queue.on('error',()=>console.error(JSON.stringify({level:'error',event:'queue_unavailable'})));}return queue;}
export async function closeQueue(){await queue?.close();queue=undefined;}
export const jobHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export interface WorkItem {id:string;generation:number}
export async function enqueue(id:string,generation:number){const target=analysisQueue();const previous=await target.getJob(jobHash(`${id}-${generation}`));if(previous&&await previous.getState()==='failed'){await previous.retry('failed');return;}await target.add('analyze',{id,generation},{jobId:jobHash(`${id}-${generation}`),attempts:5,backoff:{type:'provider'},removeOnComplete:{age:3600},removeOnFail:{age:86400}});}
