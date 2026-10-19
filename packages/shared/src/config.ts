import 'dotenv/config';
import {z} from 'zod';
export const environmentSchema=z.object({
 DATABASE_URL:z.string().url(),REDIS_URL:z.string().url(),JWT_SECRET:z.string().min(32),
 DEMO_MODE:z.enum(['true','false']).default('true').transform(value=>value==='true'),
 X_PROVIDER:z.literal('official').default('official'),X_API_BEARER_TOKEN:z.string().default(''),HELIUS_API_KEY:z.string().default(''),
 SCAN_MAX_FOLLOWERS:z.coerce.number().int().min(1).max(10000).default(300),
 SCAN_MAX_PAGES:z.coerce.number().int().min(1).max(100).default(6),
 SCAN_MAX_SECONDS:z.coerce.number().int().min(10).max(3600).default(120),
 SCAN_MAX_WALLETS:z.coerce.number().int().min(0).max(50).default(10),
 SCAN_CONCURRENCY:z.coerce.number().int().min(1).max(10).default(2),
 SCAN_DAILY_LIMIT:z.coerce.number().int().min(1).default(30),
 CACHE_TTL_SECONDS:z.coerce.number().int().min(1).default(900),
 LOG_LEVEL:z.enum(['fatal','error','warn','info','debug','trace','silent']).default('info'),
 PORT:z.coerce.number().int().min(1).max(65535).default(3000),
 ADMIN_EMAIL:z.string().email().optional(),ADMIN_PASSWORD:z.string().min(12).max(256).optional(),
});
const parsed=environmentSchema.safeParse(process.env);
if(!parsed.success)throw new Error(`Invalid server configuration: ${parsed.error.issues.map(issue=>issue.path.join('.')+': '+issue.message).join('; ')}`);
export const config=parsed.data;
