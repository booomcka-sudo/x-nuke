import {pool} from '../../../packages/database/src/index.js';
import {config} from '../../../packages/shared/src/config.js';
import {hashPassword} from './auth.js';

const client=await pool.connect();
try {
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(916622)');
 const exists=(await client.query('SELECT EXISTS(SELECT 1 FROM users) AS initialized')).rows[0].initialized;
 if(!exists&&config.ADMIN_EMAIL&&config.ADMIN_PASSWORD){
  await client.query('INSERT INTO users(email,password_hash) VALUES($1,$2)',[config.ADMIN_EMAIL.toLowerCase(),hashPassword(config.ADMIN_PASSWORD)]);
  console.log(JSON.stringify({event:'first_user_created'}));
 }else console.log(JSON.stringify({event:exists?'first_user_already_exists':'first_user_requires_admin_variables'}));
 await client.query('COMMIT');
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
