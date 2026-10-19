import {Queue} from 'bullmq';
import {createHash} from 'node:crypto';
import {config} from '../../../packages/shared/src/config.js';
import {redisOptions} from '../../../packages/shared/src/redis.js';
export const connection=redisOptions(config.REDIS_URL);
export const queue=new Queue('analysis',{connection});
export const jobHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function enqueue(id:string){const previous=await queue.getJob(jobHash(id));if(previous&&['completed','failed'].includes(await previous.getState()))await previous.remove();await queue.add('analyze',{id},{jobId:jobHash(id),attempts:5,backoff:{type:'provider'},removeOnComplete:{age:3600},removeOnFail:{age:86400}});}
