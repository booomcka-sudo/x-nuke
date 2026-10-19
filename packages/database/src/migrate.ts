import {readFile} from 'node:fs/promises';
import {pool} from './index.js';
const connection=await pool.connect();
try{await connection.query('BEGIN');await connection.query('SELECT pg_advisory_xact_lock(916621)');await connection.query('CREATE TABLE IF NOT EXISTS migrations(name text PRIMARY KEY)');const found=await connection.query('SELECT name FROM migrations WHERE name=$1',['0001']);if(!found.rowCount){await connection.query(await readFile(new URL('../migrations/0001.sql',import.meta.url),'utf8'));await connection.query('INSERT INTO migrations VALUES ($1)',['0001']);}await connection.query('COMMIT');}catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();await pool.end();}
