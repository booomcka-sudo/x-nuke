import {describe,it,expect,vi} from 'vitest';
import {checkReadiness} from '../apps/api/src/readiness.js';

describe('deployment readiness diagnostics',()=>{
 it('requires migrated schema and a responsive queue',async()=>{
  const database=vi.fn().mockResolvedValue({rowCount:1});const queue=vi.fn().mockResolvedValue('PONG');
  expect(await checkReadiness({database,queue})).toEqual({ok:true});expect(database).toHaveBeenCalledTimes(2);expect(queue).toHaveBeenCalledOnce();
 });
 it('rejects missing migrations before testing the queue',async()=>{
  const queue=vi.fn();expect(await checkReadiness({database:async()=>({rowCount:0}),queue})).toMatchObject({ok:false,stage:'database_migrations',code:'missing_migration'});expect(queue).not.toHaveBeenCalled();
 });
 it('identifies a missing table without exposing the database error text',async()=>{
  const database=vi.fn().mockResolvedValueOnce({rowCount:1}).mockRejectedValueOnce(Object.assign(new Error('private connection details'),{code:'42P01'}));
  const result=await checkReadiness({database,queue:async()=>true});expect(result).toMatchObject({ok:false,stage:'database_schema',code:'42P01'});expect(JSON.stringify(result)).not.toContain('private');
 });
 it('distinguishes Redis connection failures from database readiness',async()=>{
  const result=await checkReadiness({database:async()=>({rowCount:1}),queue:async()=>{throw Object.assign(new Error('redis://secret@private'),{code:'ECONNREFUSED'});}});
  expect(result).toMatchObject({ok:false,stage:'redis',code:'ECONNREFUSED'});expect(JSON.stringify(result)).not.toContain('secret');
 });
 it('does not echo arbitrary error codes into public responses',async()=>{
  expect(await checkReadiness({database:async()=>{throw {code:'password=private'};},queue:async()=>true})).toMatchObject({ok:false,stage:'database_migrations',code:'unavailable'});
 });
});
