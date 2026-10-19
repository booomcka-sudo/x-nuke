import {test,expect} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../apps/api/src/auth.js';
const enabled=process.env.RUN_INTEGRATION==='true';
test.skipIf(!enabled)('real API + worker: session rotation, ownership, shared job, checkpoint and history',async()=>{
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});const origin=process.env.TEST_API_ORIGIN??'http://localhost:3000';const ids=[randomUUID(),randomUUID()];const emails=ids.map(id=>`${id}@example.test`);const password='integration-test-password';const ownedJobs=new Set<string>();
 const call=async(path:string,token?:string,body?:unknown)=>{const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
 try{for(let index=0;index<ids.length;index++)await pool.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',[ids[index],emails[index],hashPassword(password)]);
 expect((await call('/v1/history')).status).toBe(401);const first=(await call('/v1/auth/login',undefined,{email:emails[0],password})).data;const second=(await call('/v1/auth/login',undefined,{email:emails[1],password})).data;
 const scan1=await call('/v1/scans',first.accessToken,{username:'integration',mode:'deep'});expect(scan1.status).toBe(202);const scan2=await call('/v1/scans',second.accessToken,{username:'integration',mode:'quick'});expect(scan2.status).toBe(202);
 let view=(await call(`/v1/scans/${scan1.data.id}`,first.accessToken)).data;ownedJobs.add(view.jobId);const other=(await call(`/v1/scans/${scan2.data.id}`,second.accessToken)).data;expect(other.jobId).toBe(view.jobId);expect((await call(`/v1/scans/${scan1.data.id}/report`,second.accessToken)).status).toBe(404);
 const deadline=Date.now()+25000;while(!['complete','failed'].includes(view.status)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,250));view=(await call(`/v1/scans/${scan1.data.id}`,first.accessToken)).data;}
 expect(view.status).toBe('complete');expect(view.processed).toBeGreaterThan(0);const edges=(await pool.query('SELECT count(*)::int AS count FROM follower_edges WHERE job_id=$1',[view.jobId])).rows[0].count;expect(edges).toBe(view.processed);expect(view.result.denominator).toBe(edges);expect(view.result.demo).toBe(true);
 const rotated=await call('/v1/auth/refresh',undefined,{refreshToken:first.refreshToken});expect(rotated.status).toBe(200);expect((await call('/v1/auth/refresh',undefined,{refreshToken:first.refreshToken})).status).toBe(401);await call('/v1/auth/logout',rotated.data.accessToken,{});expect((await call('/v1/me',rotated.data.accessToken)).status).toBe(401);
 const state=(await pool.query('SELECT checkpoint,pages FROM scan_jobs WHERE id=$1',[view.jobId])).rows[0];expect(state.pages).toBeGreaterThan(0);expect(state.checkpoint.profile.id).toBeTruthy();
 }finally{await pool.query('DELETE FROM scan_requests WHERE user_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM sessions WHERE user_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);await pool.end();}
},40000);
