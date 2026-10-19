import {z} from 'zod';
import type {Profile,Post,Label} from '../../shared/src/index.js';

export class ProviderError extends Error {
 constructor(public code:string,public retryAfter=0,public transient=false){super(code);}
}
export interface XDataProvider {
 getProfile(username:string):Promise<Profile>;
 getFollowersPage(id:string,cursor?:string):Promise<{accounts:Profile[];cursor?:string}>;
 getRecentPosts(id:string):Promise<Post[]>;
 getCapabilities():{followers:boolean;posts:boolean;limitations:string[]};
}
export interface SolanaDataProvider {
 getWalletSummary(address:string):Promise<{balanceSol:number|null;realizedPnl:null;unrealizedPnl:null;reason:string}>;
 getTransactions(address:string,before?:string):Promise<unknown>;
 getTokenActivity(address:string):Promise<unknown>;
 getCapabilities():{pnl:boolean;limitations:string[]};
}
export interface MarketDataProvider {
 getTokenMarketData(address:string):Promise<unknown>;
 getHistoricalPrices?:(address:string)=>Promise<unknown>;
 getCapabilities():{historicalPrices:boolean};
}
export async function request(url:string,init?:RequestInit):Promise<unknown> {
 let response:Response;
 try{response=await fetch(url,{...init,signal:AbortSignal.timeout(12000)});}catch{throw new ProviderError('provider_unreachable',3000,true);}
 if(!response.ok) {
  const retry=response.headers.get('retry-after');
  const reset=Number(response.headers.get('x-rate-limit-reset')??0)*1000-Date.now();
  const parsed=retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Date.parse(retry)-Date.now()):reset;
  const delay=Number.isFinite(parsed)&&parsed>0?parsed:3000;
  const code=response.status===429?'rate_limited':response.status===404?'profile_not_found':response.status===401||response.status===403?'provider_access_denied':'provider_http_'+response.status;
  throw new ProviderError(code,delay,response.status===429||response.status>=500);
 }
 try {
  const content=await response.text();
  if(content.length>4000000)throw new Error('oversized');
  return JSON.parse(content);
 }catch{throw new ProviderError('invalid_provider_response',3000,true);}
}
const metrics=z.object({followers_count:z.number().int().nonnegative(),following_count:z.number().int().nonnegative(),tweet_count:z.number().int().nonnegative().optional(),post_count:z.number().int().nonnegative().optional()});
const xUser=z.object({id:z.string().regex(/^\d+$/),username:z.string().regex(/^[a-zA-Z0-9_]{1,15}$/),name:z.string(),description:z.string().optional(),protected:z.boolean().optional(),profile_image_url:z.string().url().optional(),created_at:z.string().datetime().optional(),public_metrics:metrics.optional()});
function convert(user:z.infer<typeof xUser>):Profile {
 return {id:user.id,username:user.username.toLowerCase(),name:user.name,description:user.description??'',followers:user.public_metrics?.followers_count??null,following:user.public_metrics?.following_count??null,posts:user.public_metrics?.tweet_count??user.public_metrics?.post_count??null,protected:user.protected??false,avatar:user.profile_image_url,createdAt:user.created_at,source:'https://x.com/'+user.username,observedAt:new Date().toISOString()};
}
function validate<Value>(schema:z.ZodType<Value>,input:unknown):Value {
 const parsed=schema.safeParse(input);
 if(!parsed.success)throw new ProviderError('invalid_provider_response',3000,true);
 return parsed.data;
}
export class OfficialX implements XDataProvider {
 constructor(private token:string){}
 getCapabilities(){return {followers:!!this.token,posts:!!this.token,limitations:['Endpoint entitlement depends on X account access; 401/403/429 are reported explicitly']};}
 private async get(path:string) {
  if(!this.token)throw new ProviderError('missing_x_api_key');
  const data=await request('https://api.x.com/2/'+path,{headers:{Authorization:'Bearer '+this.token}});
  const envelope=validate(z.object({data:z.unknown().optional(),errors:z.array(z.unknown()).optional(),meta:z.unknown().optional()}),data);
  if(envelope.errors?.length)throw new ProviderError('x_partial_or_unavailable_data');
  return data;
 }
 async getProfile(username:string) {
  const result=validate(z.object({data:xUser.optional()}),await this.get('users/by/username/'+encodeURIComponent(username)+'?user.fields=description,public_metrics,protected,profile_image_url,created_at'));
  if(!result.data)throw new ProviderError('profile_not_found');
  return convert(result.data);
 }
 async getFollowersPage(id:string,cursor?:string) {
  const result=validate(z.object({data:z.array(xUser).optional(),meta:z.object({next_token:z.string().optional()}).optional()}),await this.get('users/'+encodeURIComponent(id)+'/followers?max_results=50&user.fields=description,public_metrics,protected,created_at'+(cursor?'&pagination_token='+encodeURIComponent(cursor):'')));
  return {accounts:(result.data??[]).map(convert),cursor:result.meta?.next_token};
 }
 async getRecentPosts(id:string) {
  const post=z.object({id:z.string().regex(/^\d+$/),public_metrics:z.object({like_count:z.number().nonnegative(),retweet_count:z.number().nonnegative(),reply_count:z.number().nonnegative()})});
  const result=validate(z.object({data:z.array(post).optional()}),await this.get('users/'+encodeURIComponent(id)+'/tweets?max_results=10&tweet.fields=public_metrics'));
  return (result.data??[]).map(value=>({id:value.id,likes:value.public_metrics.like_count,reposts:value.public_metrics.retweet_count,replies:value.public_metrics.reply_count,source:'https://x.com/i/status/'+value.id}));
 }
}
export function demoLabels(accounts:Profile[]):Label[] {
 return accounts.filter(account=>/^signal_\d+$/.test(account.username)&&Number(account.username.split('_')[1])%10===0).map(account=>({accountId:account.id,category:'Smart Money',source:'https://example.com/demo-evidence/'+account.username,verifiedAt:'2026-10-19T00:00:00Z',wallet:'Demo'+'1'.repeat(27)+String(Number(account.username.split('_')[1])%9+1)+String(Number(account.username.split('_')[1])%8+1),method:'Synthetic DEMO fixture; not a real ownership claim',confidence:0.95,closedTrades:20,realizedPnl:1200,unrealizedPnl:75,fees:12,period:'Synthetic 90-day history',historyQuality:'sufficient'}));
}
export class DemoX implements XDataProvider {
 getCapabilities(){return {followers:true,posts:true,limitations:['DEMO: deterministic synthetic accounts and wallet labels']};}
 async getProfile(username:string):Promise<Profile> {
  if(username==='notfound')throw new ProviderError('profile_not_found');
  return {id:'demo-'+username,username,name:username==='solbuilder'?'Sol Builder':username,description:'Building on Solana. Open research, better signals.',followers:12480,following:312,posts:823,protected:username==='private',createdAt:'2021-01-01T00:00:00Z',source:'https://x.com/'+username,observedAt:'2026-10-19T00:00:00Z'};
 }
 async getFollowersPage(id:string,cursor?:string) {
  if(id==='demo-ratelimit')throw new ProviderError('rate_limited',15000,true);
  if(id==='demo-noaccess')throw new ProviderError('provider_access_denied');
  if(id==='demo-deepfail'&&cursor)throw new ProviderError('deep_scan_failed');
  if(id==='demo-empty')return {accounts:[]};
  const offset=Number(cursor??0);
  const accounts=await Promise.all(Array.from({length:Math.min(50,Math.max(0,12480-offset))},async(_,index)=>{
   const number=offset+index;
   const profile=await this.getProfile('signal_'+number);
   return {...profile,id:id+'-'+number,followers:100+number*131,description:number%3===0?'Solana crypto researcher':number%3===1?'AI engineer':'Independent creator',posts:number%7===0?0:120};
  }));
  return {accounts,cursor:offset+50<12480?String(offset+50):undefined};
 }
 async getRecentPosts(){return Array.from({length:10},(_,index)=>({id:'demo-'+index,likes:100+index*7,reposts:20,replies:15,source:'https://example.com/demo-post'}));}
}
const addressSchema=z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
export class Helius implements SolanaDataProvider {
 constructor(private key:string){}
 getCapabilities(){return {pnl:false,limitations:['Current balances and bounded signatures are not PnL; no historical cost basis']};}
 private async rpc(method:string,params:unknown[]) {
  if(!this.key)throw new ProviderError('missing_helius_key');
  const data=validate(z.object({result:z.unknown().optional(),error:z.unknown().optional()}),await request('https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(this.key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'nuke',method,params})}));
  if(data.error)throw new ProviderError('solana_rpc_error');
  return data.result;
 }
 async getWalletSummary(address:string) {
  if(!this.key)throw new ProviderError('missing_helius_key');
  const balance=validate(z.object({value:z.number().nonnegative()}),await this.rpc('getBalance',[addressSchema.parse(address)]));
  return {balanceSol:balance.value/1e9,realizedPnl:null,unrealizedPnl:null,reason:'No complete cost basis or historical prices'} as const;
 }
 getTransactions(address:string,before?:string){return this.rpc('getSignaturesForAddress',[addressSchema.parse(address),{limit:50,...(before?{before}:{})}]);}
 getTokenActivity(address:string){return this.rpc('getTokenAccountsByOwner',[addressSchema.parse(address),{programId:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'},{encoding:'jsonParsed'}]);}
}
export class DexScreener implements MarketDataProvider {
 getCapabilities(){return {historicalPrices:false};}
 getTokenMarketData(address:string){return request('https://api.dexscreener.com/token-pairs/v1/solana/'+encodeURIComponent(addressSchema.parse(address)));}
}
