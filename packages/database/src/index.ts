import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {config} from '../../shared/src/config.js';
export const pool=new pg.Pool({connectionString:config.DATABASE_URL,max:10,connectionTimeoutMillis:5000});
export const db=drizzle(pool);
export async function query<Row extends pg.QueryResultRow=pg.QueryResultRow>(text:string,values:unknown[]=[]){return pool.query<Row>(text,values);}
