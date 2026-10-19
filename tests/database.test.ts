import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {FastifyInstance} from 'fastify';
import {hashPassword} from '../apps/api/src/auth.js';
import {DemoX,ProviderError,type XDataProvider} from '../packages/providers/src/index.js';
import type {ScanView} from '../packages/shared/src/index.js';

describe.skipIf(process.env.RUN_DATABASE_TESTS!=='true')('PostgreSQL + API + persistent analysis',()=>{
 let database:typeof import('../packages/database/src/index.js');
 let processor:typeof import('../apps/worker/src/processor.js');
 let app:FastifyInstance;
 const dispatched:{id:string;generation:number}[]=[];
 const users=[randomUUID(),randomUUID()];
 const emails=users.map(id=>id+'@example.test');
 const tokens:string[]=[];
 const password='local-test-password-only';
 async function scan(username:string,mode:'quick'|'deep'='quick',user=0){const response=await app.inject({method:'POST',url:'/v1/scans',headers:{authorization:'Bearer '+tokens[user]},payload:{username,mode}});expect(response.statusCode).toBe(202);return response.json<{id:string}>().id;}
 async function view(id:string,user=0){const response=await app.inject({method:'GET',url:'/v1/scans/'+id,headers:{authorization:'Bearer '+tokens[user]}});expect(response.statusCode).toBe(200);return response.json<ScanView>();}
 async function run(id:string,source?:XDataProvider,attemptsMade=0){const current=await view(id);const row=(await database.query('SELECT generation FROM scan_jobs WHERE id=$1',[current.jobId])).rows[0];await processor.processAnalysis({data:{id:current.jobId,generation:row.generation},attemptsMade},source);}
 beforeAll(async()=>{
  const address=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(address.hostname)||address.pathname!=='/x_nuke_test')throw Error('Dedicated local test database required');
  database=await import('../packages/database/src/index.js');processor=await import('../apps/worker/src/processor.js');
  await database.query('DROP SCHEMA public CASCADE');await database.query('CREATE SCHEMA public');
  await database.query('CREATE TABLE migrations(name text PRIMARY KEY)');
  for(const migration of ['0001','0002','0003']){await database.query(await readFile(new URL('../packages/database/migrations/'+migration+'.sql',import.meta.url),'utf8'));await database.query('INSERT INTO migrations VALUES($1)',[migration]);}
  const {bootstrapAccount}=await import('../apps/api/src/users.js');
  expect(await bootstrapAccount()).toBe('unconfigured');
  const bootstrapped=await Promise.all([bootstrapAccount('first@example.test',password),bootstrapAccount('first@example.test',password)]);expect(bootstrapped.sort()).toEqual(['created','exists']);
  for(let index=0;index<users.length;index++)await database.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',[users[index],emails[index],hashPassword(password)]);
  const {createApp}=await import('../apps/api/src/server.js');
  app=await createApp({logging:false,dispatch:async(id,generation)=>{dispatched.push({id,generation});},queueReady:async()=>true});
  for(const email of emails){const response=await app.inject({method:'POST',url:'/v1/auth/login',payload:{email,password}});expect(response.statusCode).toBe(200);tokens.push(response.json<{accessToken:string}>().accessToken);}
 });
 afterAll(async()=>{await app?.close();await database?.pool.end();});
 it('stops after an in-flight page, keeps the committed checkpoint and rejects foreign cancellation',async()=>{
  const id=await scan('stoptest','deep');const source=new DemoX();let pages=0;let release!:()=>void;let entered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});const waiting=new Promise<void>(resolve=>{entered=resolve;});
  const wrapped:XDataProvider={getProfile:name=>source.getProfile(name),getCapabilities:()=>source.getCapabilities(),getRecentPosts:()=>source.getRecentPosts(),getFollowersPage:async(profileId,cursor,limit)=>{pages++;if(pages===2){entered();await held;}return source.getFollowersPage(profileId,cursor,limit);}};
  const running=run(id,wrapped);await waiting;
  expect((await app.inject({method:'POST',url:'/v1/scans/'+id+'/cancel',headers:{authorization:'Bearer '+tokens[1]}})).statusCode).toBe(404);
  const stopped=await app.inject({method:'POST',url:'/v1/scans/'+id+'/cancel',headers:{authorization:'Bearer '+tokens[0]}});expect(stopped.statusCode).toBe(200);expect(stopped.json().status).toBe('cancelled');
  release();await running;await run(id,wrapped);const saved=await view(id);expect(saved.processed).toBe(50);expect(saved.result?.denominator).toBe(50);expect(saved.status).toBe('cancelled');expect(pages).toBe(2);
  const resumed=await scan('stoptest');expect(resumed).not.toBe(id);await run(resumed,wrapped);expect((await view(resumed)).processed).toBe(50);expect(pages).toBe(2);
 });
 it('cancels only the requesting user when another user still needs the shared analysis',async()=>{
  const first=await scan('sharedstop');const second=await scan('sharedstop','quick',1);
  await app.inject({method:'POST',url:'/v1/scans/'+first+'/cancel',headers:{authorization:'Bearer '+tokens[0]}});
  const shared=await view(second,1);const generation=(await database.query('SELECT generation FROM scan_jobs WHERE id=$1',[shared.jobId])).rows[0].generation;
  await processor.processAnalysis({data:{id:shared.jobId,generation},attemptsMade:0},new DemoX());
  expect((await view(first)).status).toBe('cancelled');expect((await view(second,1)).status).toBe('complete');
 });
 it('limits LIVE reads on the wire, omits posts and requires explicit Deep confirmation',async()=>{
  const {config}=await import('../packages/shared/src/config.js');const original=config.DEMO_MODE;config.DEMO_MODE=false;
  try {
   const source=new DemoX();const sizes:number[]=[];let posts=0;
   const wrapped:XDataProvider={getProfile:name=>source.getProfile(name),getCapabilities:()=>source.getCapabilities(),getRecentPosts:async()=>{posts++;return [];},getFollowersPage:async(profileId,cursor,limit)=>{sizes.push(limit!);return source.getFollowersPage(profileId,cursor,limit);}};
   const id=await scan('livebudget');await run(id,wrapped);expect((await view(id)).processed).toBe(5);expect(sizes).toEqual([5]);expect(posts).toBe(0);
   const denied=await app.inject({method:'POST',url:'/v1/scans',headers:{authorization:'Bearer '+tokens[0]},payload:{username:'livebudget',mode:'deep'}});expect(denied.statusCode).toBe(400);
   const accepted=await app.inject({method:'POST',url:'/v1/scans',headers:{authorization:'Bearer '+tokens[0]},payload:{username:'livebudget',mode:'deep',confirmPaid:true}});expect(accepted.statusCode).toBe(202);
   await run(accepted.json().id,wrapped);expect((await view(accepted.json().id)).processed).toBe(20);expect(sizes).toEqual([5,10,5]);expect(posts).toBe(0);
  }finally{config.DEMO_MODE=original;}
 });
 it('reports service readiness, private account setup and unauthorized access',async()=>{
  expect((await app.inject('/health/ready')).statusCode).toBe(200);
  const status=(await app.inject('/v1/status')).json();expect(status.initialized).toBe(true);expect(status.mode).toBe('DEMO');expect(status.workerOnline).toBe(false);
  expect((await app.inject('/v1/history')).statusCode).toBe(401);
 });
 it('deduplicates repeat requests, keeps ownership, and expands a Quick Scan from its checkpoint',async()=>{
  const first=await scan('solbuilder');const repeated=await scan('@SolBuilder');expect(repeated).toBe(first);
  const shared=await scan('solbuilder','quick',1);expect((await view(shared,1)).jobId).toBe((await view(first)).jobId);
  const forbidden=await app.inject({url:'/v1/scans/'+first+'/report',headers:{authorization:'Bearer '+tokens[1]}});expect(forbidden.statusCode).toBe(404);
  await run(first);let result=await view(first);expect(result.reason).toBe('quick_scan');expect(result.processed).toBe(50);expect(result.result?.wallets?.length).toBe(5);expect(result.result?.score).not.toBeNull();
  const restored=await app.inject({url:'/v1/scans/current?username=solbuilder',headers:{authorization:'Bearer '+tokens[0]}});expect(restored.json<ScanView>().id).toBe(first);
  const deep=await scan('solbuilder','deep');await run(deep);result=await view(deep);expect(result.reason).toBe('sample_limit');expect(result.processed).toBe(300);expect(result.pages).toBe(6);
  await run(deep);const edges=(await database.query('SELECT count(*)::int AS count FROM follower_edges WHERE job_id=$1',[result.jobId])).rows[0].count;expect(edges).toBe(300);expect(result.result?.audience.reduce((sum,item)=>sum+item.percent,0)).toBeCloseTo(100);
 });
 it('preserves a committed page when a worker attempt fails, then resumes without duplicates',async()=>{
  const id=await scan('checkpoint','deep');const source=new DemoX();let calls=0;
  const interrupted:XDataProvider={getProfile:name=>source.getProfile(name),getRecentPosts:()=>source.getRecentPosts(),getCapabilities:()=>source.getCapabilities(),getFollowersPage:async(profileId,cursor)=>{calls++;if(calls===2)throw new ProviderError('provider_unreachable',1000,true);return source.getFollowersPage(profileId,cursor);}};
  await expect(run(id,interrupted)).rejects.toThrow('provider_unreachable');let saved=await view(id);expect(saved.status).toBe('paused');expect(saved.processed).toBe(50);expect(saved.retryAt).toBeTruthy();
  await run(id,new DemoX(),1);saved=await view(id);expect(saved.processed).toBe(300);expect(saved.status).toBe('complete');
 });
 it('retains preliminary data on a permanent Deep Scan error',async()=>{
  const id=await scan('deepfail','deep');await expect(run(id)).rejects.toThrow('deep_scan_failed');const saved=await view(id);expect(saved.status).toBe('failed');expect(saved.result?.denominator).toBe(50);
 });
 it('handles protected, missing, inaccessible and empty profiles honestly',async()=>{
  for(const username of ['private','noaccess','empty']){const id=await scan(username);await run(id);const saved=await view(id);expect(saved.result?.denominator).toBe(0);expect(saved.result?.score).toBeNull();}
  const id=await scan('notfound');await expect(run(id)).rejects.toThrow('profile_not_found');expect((await view(id)).reason).toBe('profile_not_found');
 });
 it('refreshes expired results with a new generation and exposes stale state',async()=>{
  const id=await scan('stalecache');await run(id);const prior=await view(id);await database.query("UPDATE scan_jobs SET updated_at=now()-interval '2 hours',result=jsonb_set(result,'{updatedAt}',to_jsonb((now()-interval '2 hours')::text)) WHERE id=$1",[prior.jobId]);expect((await view(id)).stale).toBe(true);
  const fresh=await scan('stalecache');expect(dispatched.at(-1)?.generation).toBe(2);await run(fresh);expect((await view(fresh)).processed).toBe(50);expect((await view(fresh)).stale).toBe(false);
 });
 it('deduplicates distinct usernames by the stable provider account ID',async()=>{
  const demo=new DemoX();const source:XDataProvider={...demo,getCapabilities:()=>demo.getCapabilities(),getRecentPosts:()=>demo.getRecentPosts(),getFollowersPage:(id,cursor)=>demo.getFollowersPage(id,cursor),getProfile:async username=>({...await demo.getProfile(username),id:'stable-account-123'})};
  const first=await scan('aliasone');await run(first,source);const second=await scan('aliastwo');await run(second,source);expect((await view(first)).jobId).toBe((await view(second)).jobId);expect((await view(second)).username).toBe('aliastwo');
  expect(await scan('aliastwo')).toBe(second);
  const current=await app.inject({url:'/v1/scans/current?username=aliastwo',headers:{authorization:'Bearer '+tokens[0]}});expect(current.json<ScanView>().id).toBe(second);
 });
 it('stops rate-limit retries after the configured attempt budget',async()=>{
  const id=await scan('ratelimit');await expect(run(id,new DemoX(),4)).rejects.toThrow('rate_limited');const saved=await view(id);expect(saved.status).toBe('failed');expect(saved.retryAt).toBeNull();
 });
 it('enforces daily quotas while allowing access to an existing cached result',async()=>{
  const user=randomUUID();const email=user+'@example.test';await database.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',[user,email,hashPassword(password)]);
  const login=await app.inject({method:'POST',url:'/v1/auth/login',payload:{email,password}});const token=login.json<{accessToken:string}>().accessToken;
  const job=(await database.query("SELECT id FROM scan_jobs WHERE username='solbuilder' LIMIT 1")).rows[0].id;
  await database.query("INSERT INTO scan_requests(user_id,job_id,mode,username) SELECT $1,$2,'quick','solbuilder' FROM generate_series(1,30)",[user,job]);
  const blocked=await app.inject({method:'POST',url:'/v1/scans',headers:{authorization:'Bearer '+token},payload:{username:'newbudget',mode:'quick'}});expect(blocked.statusCode).toBe(429);
  const cached=await app.inject({method:'POST',url:'/v1/scans',headers:{authorization:'Bearer '+token},payload:{username:'solbuilder',mode:'quick'}});expect(cached.statusCode).toBe(202);
 });
 it('rotates refresh tokens atomically and revokes access on logout',async()=>{
  const login=await app.inject({method:'POST',url:'/v1/auth/login',payload:{email:emails[0],password}});const session=login.json<{accessToken:string;refreshToken:string}>();
  const responses=await Promise.all([0,1].map(()=>app.inject({method:'POST',url:'/v1/auth/refresh',payload:{refreshToken:session.refreshToken}})));expect(responses.map(response=>response.statusCode).sort()).toEqual([200,401]);
  const rotated=responses.find(response=>response.statusCode===200)!.json<{accessToken:string}>();await app.inject({method:'POST',url:'/v1/auth/logout',headers:{authorization:'Bearer '+rotated.accessToken},payload:{}});expect((await app.inject({url:'/v1/me',headers:{authorization:'Bearer '+rotated.accessToken}})).statusCode).toBe(401);
 });
});
