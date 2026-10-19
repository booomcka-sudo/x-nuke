import {pool} from '../../../packages/database/src/index.js';
import {config} from '../../../packages/shared/src/config.js';
import {bootstrapAccount} from './users.js';

try{console.log(JSON.stringify({event:'first_account_bootstrap',status:await bootstrapAccount(config.ADMIN_EMAIL,config.ADMIN_PASSWORD)}));}finally{await pool.end();}
