import {spawnSync} from 'node:child_process';
const database=process.env.TEST_DATABASE_URL;
if(!database)throw Error('Set TEST_DATABASE_URL to the dedicated local x_nuke_test PostgreSQL database');
const address=new URL(database);
if(!['127.0.0.1','localhost'].includes(address.hostname)||address.pathname!=='/x_nuke_test')throw Error('Database tests require the dedicated local database x_nuke_test');
const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/database.test.ts'],{stdio:'inherit',env:{...process.env,RUN_DATABASE_TESTS:'true',DATABASE_URL:database,REDIS_URL:'redis://127.0.0.1:56379',JWT_SECRET:'local-integration-secret-only-32-characters',DEMO_MODE:'true'}});
process.exitCode=result.status??1;
