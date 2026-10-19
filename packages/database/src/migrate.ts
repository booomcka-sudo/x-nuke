import {readFile} from 'node:fs/promises';
import {pool} from './index.js';
const connection=await pool.connect();
try {
 await connection.query('BEGIN');
 await connection.query('SELECT pg_advisory_xact_lock(916621)');
 await connection.query('CREATE TABLE IF NOT EXISTS migrations(name text PRIMARY KEY)');
 for(const name of ['0001','0002']) {
  const found=await connection.query('SELECT name FROM migrations WHERE name=$1',[name]);
  if(found.rowCount)continue;
  await connection.query(await readFile(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
  await connection.query('INSERT INTO migrations VALUES ($1)',[name]);
 }
 await connection.query('COMMIT');
 console.log(JSON.stringify({event:'migrations_complete',msg:'Database migrations complete'}));
} catch(error) {
 await connection.query('ROLLBACK');throw error;
} finally {
 connection.release();await pool.end();
}
