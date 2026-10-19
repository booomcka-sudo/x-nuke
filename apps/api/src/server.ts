import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import {z} from 'zod';
import {config} from '../../../packages/shared/src/config.js';
import {scanSchema,usernameSchema} from '../../../packages/shared/src/index.js';
import {query} from '../../../packages/database/src/index.js';
import {analysisQueue,enqueue} from './queue.js';
import {verifyPassword,tokenHash,newToken,hashPassword} from './auth.js';
import {HttpError,requestScan,readScan,cancelScan} from './scans.js';
import {scanBudget} from '../../../packages/shared/src/budget.js';
import {checkReadiness} from './readiness.js';

interface Dependencies {dispatch?:typeof enqueue;queueReady?:()=>Promise<unknown>;logging?:boolean}
export async function createApp(dependencies:Dependencies={}) {
 const app=Fastify({logger:dependencies.logging===false?false:{level:config.LOG_LEVEL,redact:['req.headers.authorization','password','refreshToken']},bodyLimit:16384});
 const dispatch=dependencies.dispatch??enqueue;
 const queueReady=dependencies.queueReady??(async()=> (await analysisQueue().client).ping());
 await app.register(jwt,{secret:config.JWT_SECRET});
 await app.register(rateLimit,{max:120,timeWindow:'1 minute'});
 app.setErrorHandler((error,_request,reply)=>{
  if(error instanceof z.ZodError)return reply.code(400).send({error:'invalid_input'});
  const failure=error as {statusCode?:number;code?:string};
  const status=failure.statusCode??503;
  if(status>=500)app.log.error({code:failure.code??'unavailable'},'Request failed');
  return reply.code(status).send({error:failure.code==='42P01'||failure.code==='42703'?'database_migrations_required':error instanceof HttpError?error.message:status===401?'unauthorized':status===429?'rate_limited':'service_unavailable'});
 });
 app.get('/health/live',async()=>({ok:true}));
 app.get('/health/ready',async(_request,reply)=>{
  const readiness=await checkReadiness({database:query,queue:queueReady});
  if(!readiness.ok){app.log.warn(readiness,`Readiness failed: ${readiness.stage}; code=${readiness.code}`);return reply.code(503).send(readiness);}
  return {ok:true,mode:config.DEMO_MODE?'DEMO':'LIVE'};
 });
 app.get('/v1/status',async()=>{
  const initialized=(await query('SELECT EXISTS(SELECT 1 FROM users) AS initialized')).rows[0].initialized;
  const worker=(await query("SELECT EXISTS(SELECT 1 FROM worker_heartbeats WHERE demo=$1 AND updated_at>now()-interval '40 seconds') AS online",[config.DEMO_MODE])).rows[0].online;
  return {mode:config.DEMO_MODE?'DEMO':'LIVE',initialized,workerOnline:worker,providers:{x:config.DEMO_MODE||!!config.X_API_BEARER_TOKEN,solana:!!config.HELIUS_API_KEY},limits:{followers:scanBudget().deepFollowers,quickFollowers:scanBudget().quickFollowers,pages:config.SCAN_MAX_PAGES,daily:config.SCAN_DAILY_LIMIT},limitations:config.DEMO_MODE?['Synthetic DEMO data']:['X endpoint access depends on your provider account','Unique reach and PnL require additional verified data']};
 });
 const dummyHash=hashPassword('unused-constant-time-check');
 app.post('/v1/auth/login',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(request,reply)=>{
  const body=z.object({email:z.string().trim().email(),password:z.string().min(1).max(256)}).strict().parse(request.body);
  const user=(await query('SELECT * FROM users WHERE email=$1',[body.email.toLowerCase()])).rows[0];
  const valid=verifyPassword(body.password,user?.password_hash??dummyHash);
  if(!user||!valid)return reply.code(401).send({error:'invalid_credentials'});
  const refreshToken=newToken();
  const session=(await query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 days') RETURNING id",[user.id,tokenHash(refreshToken)])).rows[0];
  return {accessToken:app.jwt.sign({sub:user.id,sid:session.id},{expiresIn:'15m'}),refreshToken};
 });
 app.post('/v1/auth/refresh',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async(request,reply)=>{
  const body=z.object({refreshToken:z.string().min(32).max(128)}).strict().parse(request.body);
  const refreshToken=newToken();
  const updated=(await query('UPDATE sessions SET token_hash=$2 WHERE token_hash=$1 AND NOT revoked AND expires_at>now() RETURNING id,user_id',[tokenHash(body.refreshToken),tokenHash(refreshToken)])).rows[0];
  if(!updated)return reply.code(401).send({error:'invalid_session'});
  return {accessToken:app.jwt.sign({sub:updated.user_id,sid:updated.id},{expiresIn:'15m'}),refreshToken};
 });
 app.register(async secured=>{
  secured.addHook('preHandler',async request=>{
   const payload=await request.jwtVerify<{sub:string;sid:string}>();
   const found=await query('SELECT id FROM sessions WHERE id=$1 AND user_id=$2 AND NOT revoked AND expires_at>now()',[payload.sid,payload.sub]);
   if(!found.rowCount)throw new HttpError(401,'unauthorized');
  });
  const identity=(request:{user:unknown})=>request.user as {sub:string;sid:string};
  secured.post('/v1/auth/logout',async request=>{await query('UPDATE sessions SET revoked=true WHERE id=$1',[identity(request).sid]);return {ok:true};});
  secured.get('/v1/me',async request=>{
   const usage=(await query("SELECT count(*)::int AS used FROM scan_requests WHERE user_id=$1 AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",[identity(request).sub])).rows[0].used;
   return {id:identity(request).sub,mode:config.DEMO_MODE?'DEMO':'LIVE',dailyLimit:config.SCAN_DAILY_LIMIT,used:usage,budget:scanBudget()};
  });
  secured.post('/v1/scans',async(request,reply)=>{
   const body=scanSchema.parse(request.body);
   if(body.mode==='deep'&&!config.DEMO_MODE&&!body.confirmPaid)throw new HttpError(400,'paid_scan_confirmation_required');
   const created=await requestScan(identity(request).sub,body.username,body.mode);
   if(created.dispatch)try{await dispatch(created.jobId,created.generation);}catch{app.log.warn({jobId:created.jobId},'Saved scan will be dispatched after queue recovery');}
   return reply.code(202).send({id:created.id});
  });
  secured.get('/v1/scans/current',async request=>{
   const {username}=z.object({username:usernameSchema}).parse(request.query);
   const latest=(await query('SELECT r.id FROM scan_requests r JOIN scan_jobs j ON j.id=r.job_id WHERE r.user_id=$1 AND lower(coalesce(r.username,j.username))=$2 AND j.demo=$3 ORDER BY r.created_at DESC LIMIT 1',[identity(request).sub,username,config.DEMO_MODE])).rows[0];
   return latest?readScan(latest.id,identity(request).sub):null;
  });
  secured.post<{Params:{id:string}}>('/v1/scans/:id/cancel',async request=>cancelScan(z.string().uuid().parse(request.params.id),identity(request).sub));
  secured.get('/v1/history',async request=>(await query('SELECT r.id,coalesce(r.username,j.username) AS username,CASE WHEN r.cancelled_at IS NOT NULL THEN \'cancelled\' ELSE j.status END AS status,j.result->\'score\' AS score,r.created_at FROM scan_requests r JOIN scan_jobs j ON j.id=r.job_id WHERE r.user_id=$1 AND j.demo=$2 ORDER BY r.created_at DESC LIMIT 30',[identity(request).sub,config.DEMO_MODE])).rows);
  for(const suffix of ['','/audience','/report'])secured.get<{Params:{id:string}}>(`/v1/scans/:id${suffix}`,async(request,reply)=>{
   const scan=await readScan(z.string().uuid().parse(request.params.id),identity(request).sub);
   if(!scan)return reply.code(404).send({error:'scan_not_found'});
   if(suffix==='/audience')return scan.result?.members??[];
   return scan;
  });
 });
 await app.ready();
 return app;
}
