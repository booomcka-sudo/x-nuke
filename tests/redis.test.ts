import {it,expect} from 'vitest';
import {Redis} from 'ioredis';
import {redisOptions} from '../packages/shared/src/redis.js';

it('connects ioredis to the Railway host, port and credentials instead of localhost',()=>{
 const client=new Redis({...redisOptions('redis://default:p%40ss@redis.railway.internal:6380/2'),lazyConnect:true});
 expect(client.options.host).toBe('redis.railway.internal');
 expect(client.options.port).toBe(6380);
 expect(client.options.username).toBe('default');
 expect(client.options.password).toBe('p@ss');
 expect(client.options.db).toBe(2);
 client.disconnect();
});
it('keeps worker reconnects and TLS certificate validation enabled',()=>{
 const options=redisOptions('rediss://default:secret@redis.example.com:6379',true);
 expect(options.maxRetriesPerRequest).toBeNull();
 expect(options.tls).toEqual({servername:'redis.example.com'});
 expect(()=>redisOptions('https://example.com')).toThrow();
});
