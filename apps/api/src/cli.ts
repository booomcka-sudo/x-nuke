import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {query,pool} from '../../../packages/database/src/index.js';
import {labelSchema} from '../../../packages/shared/src/labels.js';
import {hashPassword} from './auth.js';

try {
 if(process.argv[2]==='user') {
  const email=z.string().trim().email().parse(process.env.ADMIN_EMAIL);
  const password=z.string().min(12).max(256).parse(process.env.ADMIN_PASSWORD);
  await query('INSERT INTO users(email,password_hash) VALUES($1,$2)',[email.toLowerCase(),hashPassword(password)]);
  console.log('User created');
 }else if(process.argv[2]==='labels') {
  const filename=z.string().min(1).parse(process.argv[3]);
  const labels=z.array(labelSchema).max(10000).parse(JSON.parse(await readFile(filename,'utf8')));
  const client=await pool.connect();
  try {
   await client.query('BEGIN');
   for(const label of labels) {
    await client.query('INSERT INTO account_labels VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET data=$2',[label.accountId,label]);
    if(label.wallet) {
     await client.query('INSERT INTO wallets(address) VALUES($1) ON CONFLICT DO NOTHING',[label.wallet]);
     await client.query('INSERT INTO account_wallet_links VALUES($1,$2,$3) ON CONFLICT(account_id,address) DO UPDATE SET data=$3',[label.accountId,label.wallet,label]);
    }
   }
   await client.query('COMMIT');
   console.log('Imported '+labels.length+' labels');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }else throw Error('Use user or labels <file>');
}finally{await pool.end();}
