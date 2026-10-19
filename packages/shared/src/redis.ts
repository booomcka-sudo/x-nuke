import type {RedisOptions} from 'ioredis';

export function redisOptions(connectionString:string,worker=false):RedisOptions {
 const address=new URL(connectionString);
 if(!['redis:','rediss:'].includes(address.protocol))throw new Error('REDIS_URL must use redis:// or rediss://');
 const database=address.pathname.slice(1);
 if(database&&!/^\d+$/.test(database))throw new Error('Invalid Redis database number');
 return {host:address.hostname,port:Number(address.port||6379),...(address.username?{username:decodeURIComponent(address.username)}:{}),...(address.password?{password:decodeURIComponent(address.password)}:{}),db:database?Number(database):0,...(address.protocol==='rediss:'?{tls:{servername:address.hostname}}:{}),maxRetriesPerRequest:worker?null:1,connectTimeout:5000,...(!worker?{enableOfflineQueue:false,commandTimeout:5000}:{})};
}
