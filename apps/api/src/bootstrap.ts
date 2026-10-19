import {pool} from '../../../packages/database/src/index.js';
import {config} from '../../../packages/shared/src/config.js';
import {bootstrapAccount} from './users.js';

try{const status=await bootstrapAccount(config.ADMIN_EMAIL,config.ADMIN_PASSWORD);console.log(JSON.stringify({event:'first_account_bootstrap',status,msg:`First account bootstrap: ${status}`}));}finally{await pool.end();}
