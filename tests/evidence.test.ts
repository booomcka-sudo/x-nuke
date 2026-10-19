import {it,expect,vi,afterEach} from 'vitest';
import {audienceBreakdown,analyze,classify} from '../packages/scoring/src/index.js';
import {DemoX,OfficialX} from '../packages/providers/src/index.js';
import {retryDelay} from '../packages/shared/src/retry.js';
import {labelSchema} from '../packages/shared/src/labels.js';
afterEach(()=>vi.unstubAllGlobals());
it('rounds displayed audience percentages to exactly 100.0 including Unknown',async()=>{
 const provider=new DemoX();const members=await Promise.all(['a','b','c'].map(async name=>classify({...await provider.getProfile(name),description:'',posts:null},[])));
 members[0].category='AI / Tech';members[1].category='Regular Users';const percentages=audienceBreakdown(members);
 expect(percentages.reduce((sum,item)=>sum+Math.round(item.percent*10),0)).toBe(1000);expect(percentages.find(item=>item.category==='Unknown / Insufficient Data')?.count).toBe(1);
});
it('keeps absent follower metrics and reach unavailable rather than zero',async()=>{
 const profile={...await new DemoX().getProfile('unknown'),followers:null,following:null,posts:null};
 const result=analyze(profile,[classify(profile,[])],[],false);expect(result.coverage).toBeNull();expect(result.reach.total).toBeNull();expect(result.score).toBeNull();
});
it('keeps missing X public metrics null and rejects malformed provider payloads',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{id:'123',username:'example',name:'Example'}}))));
 expect((await new OfficialX('token').getProfile('example')).followers).toBeNull();
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{id:'123',username:'example',name:'Example',public_metrics:{followers_count:-1}}}))));
 await expect(new OfficialX('token').getProfile('example')).rejects.toMatchObject({code:'invalid_provider_response'});
});
it('honors the provider retry time even when it exceeds exponential backoff',()=>{
 expect(retryDelay(1,120000,0.5)).toBe(120500);expect(retryDelay(3,0,0)).toBe(8000);
});
it('rejects imported financial labels without explicit units and ownership methods',()=>{
 const label={accountId:'123',category:'Smart Money',source:'https://example.com/evidence',verifiedAt:'2026-10-19T00:00:00Z',confidence:0.9,realizedPnl:100};
 expect(labelSchema.safeParse(label).success).toBe(false);
 expect(labelSchema.safeParse({...label,pnlCurrency:'USD'}).success).toBe(true);
 expect(labelSchema.safeParse({...label,pnlCurrency:'USD',wallet:'1'.repeat(32)}).success).toBe(false);
});
