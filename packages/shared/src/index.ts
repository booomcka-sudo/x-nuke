import { z } from 'zod';
export const VERSION='heuristic-2';
export const categories=['Smart Money','Crypto KOLs','AI / Tech','Regular Users','Suspicious / Low Quality','Unknown / Insufficient Data'] as const;
export type Category=typeof categories[number];
export const usernameSchema=z.string().trim().transform(value=>value.replace(/^@/,'').toLowerCase()).pipe(z.string().regex(/^[a-z0-9_]{1,15}$/));
const reserved=new Set(['home','explore','messages','settings','notifications','search','i','intent','compose','login','logout','signup','tos','privacy','help','about','jobs','download','hashtag','share','account','communities','premium']);
export function profileRoute(path:string){const parts=path.split('/').filter(Boolean);const result=usernameSchema.safeParse(parts[0]);return result.success&&!reserved.has(result.data)&&(!parts[1]||['with_replies','media','highlights','articles','followers','following'].includes(parts[1]))?result.data:null;}
export const scanSchema=z.object({username:usernameSchema,mode:z.enum(['quick','deep']).default('quick')}).strict();
export interface Profile {id:string;username:string;name:string;description:string;followers:number|null;following:number|null;posts:number|null;protected:boolean;avatar?:string;source:string;observedAt:string;createdAt?:string}
export interface Post {id:string;likes:number;reposts:number;replies:number;source:string}
export interface Label {accountId:string;category:Category;source:string;verifiedAt:string;wallet?:string;method?:string;confidence:number;closedTrades?:number;realizedPnl?:number;unrealizedPnl?:number;fees?:number;period?:string;historyQuality?:string}
export interface WalletEvidence {address:string;network:'solana';source:string;verifiedAt:string;confidence:number;method:string;accountId:string;metrics:{balanceSol:number|null;realizedPnl:number|null;unrealizedPnl:number|null;fees:number|null;closedTrades:number|null;period:string|null;historyQuality:string;source:string;observedAt:string;limitations:string[]}}
export interface Member {profile:Profile;category:Category;reason:string;tags:string[];sources:string[];wallet?:Label}
export interface Component {name:string;weight:number;value:number|null;reason:string;sources:string[]}
export interface Analysis {profile:Profile;members:Member[];score:number|null;components:Component[];availableWeight:number;coverage:number|null;confidence:number;preliminary:boolean;formulaVersion:string;audience:{category:Category;count:number;percent:number}[];denominator:number;reach:{total:number|null;unique:null;alpha:null;method:string;source:string;observedAt:string;limitations:string[]};limitations:string[];updatedAt:string;demo:boolean;wallets?:WalletEvidence[]}
export interface ScanView {id:string;jobId:string;username:string;status:string;stage:string;processed:number;pages:number;reason:string|null;retryAt:string|null;result:Analysis|null;stale:boolean;createdAt:string}
export const messageSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('STATUS')}).strict(),
 z.object({type:z.literal('CURRENT'),username:usernameSchema}).strict(),
 z.object({type:z.literal('SCAN'),username:usernameSchema,mode:z.enum(['quick','deep'])}).strict(),
 z.object({type:z.literal('GET_SCAN'),id:z.string().uuid()}).strict(),
 z.object({type:z.literal('HISTORY')}).strict(),z.object({type:z.literal('ME')}).strict(),
 z.object({type:z.literal('LOGIN'),email:z.string().email(),password:z.string().min(1).max(256)}).strict(),
 z.object({type:z.literal('LOGOUT')}).strict(),z.object({type:z.literal('OPTIONS')}).strict(),
 z.object({type:z.literal('REPORT'),id:z.string().uuid()}).strict()
]);
