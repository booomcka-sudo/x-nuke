import {z} from 'zod';
import {pool} from '../../../packages/database/src/index.js';
import {hashPassword} from './auth.js';

export async function bootstrapAccount(email?:string,password?:string):Promise<'created'|'exists'|'unconfigured'> {
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(916622)');
  const exists=(await client.query('SELECT EXISTS(SELECT 1 FROM users) AS initialized')).rows[0].initialized;
  if(exists){await client.query('COMMIT');return 'exists';}
  if(!email||!password){await client.query('COMMIT');return 'unconfigured';}
  const credentials=z.object({email:z.string().trim().email(),password:z.string().min(12).max(256)}).parse({email,password});
  await client.query('INSERT INTO users(email,password_hash) VALUES($1,$2)',[credentials.email.toLowerCase(),hashPassword(credentials.password)]);
  await client.query('COMMIT');return 'created';
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
