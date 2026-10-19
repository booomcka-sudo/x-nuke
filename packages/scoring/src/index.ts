import {categories,VERSION,type Profile,type Post,type Label,type Member,type Component,type Analysis} from '../../shared/src/index.js';
export function classify(profile:Profile,labels:Label[]):Member{
 const label=labels.find(item=>item.accountId===profile.id);let category:Member['category']='Unknown / Insufficient Data';let reason='Insufficient public evidence';
 if(label){category=label.category;reason='Curated public label';if(category==='Smart Money'&&!(label.wallet&&label.confidence>=0.8&&(label.closedTrades??0)>=10&&label.period&&label.historyQuality==='sufficient'&&(label.realizedPnl??0)>0)){category='Unknown / Insufficient Data';reason='Smart Money evidence does not meet history requirements';}}
 else if(/\b(ai|engineer|developer|machine learning|research)\b/i.test(profile.description)){category='AI / Tech';reason='Public biography keyword; heuristic';}
 else if(/\b(crypto|solana|web3|defi)\b/i.test(profile.description)&&profile.followers>=10000){category='Crypto KOLs';reason='Crypto biography and ≥10,000 followers; heuristic';}
 else if(profile.description&&profile.posts>=20){category='Regular Users';reason='Public biography and ≥20 posts; limited evidence';}
 return {profile,category,reason,tags:[],sources:[profile.source,...(label?[label.source]:[])],...(label?.wallet?{wallet:label}:{})};
}
export function weightedScore(components:Component[]){const available=components.filter(c=>c.value!==null);const weight=available.reduce((sum,c)=>sum+c.weight,0);return {score:weight>=40&&available.length>=2?Math.round(available.reduce((sum,c)=>sum+c.value!*c.weight,0)/weight):null,availableWeight:weight};}
export function analyze(profile:Profile,members:Member[],posts:Post[],demo:boolean,limitations:string[]=[]):Analysis{
 const count=members.length;const known=members.filter(m=>m.category!=='Unknown / Insufficient Data').length;
 const sources=[profile.source];const proportion=(category:string)=>count?members.filter(m=>m.category===category).length/count:null;
 const components:Component[]=[
 {name:'Smart Money',weight:30,value:members.some(member=>member.wallet)?Math.min(100,proportion('Smart Money')!*500):null,reason:'Confirmed profitable labels / inspected sample × 500, capped at 100; unavailable without wallet evidence',sources:members.flatMap(m=>m.wallet?[m.wallet.source]:[])},
 {name:'Crypto KOLs',weight:20,value:count?Math.min(100,proportion('Crypto KOLs')!*300):null,reason:'Crypto KOL share × 300, capped at 100',sources:members.filter(m=>m.category==='Crypto KOLs').flatMap(m=>m.sources)},
 {name:'Engagement',weight:15,value:posts.length&&profile.followers?Math.min(100,Math.round(posts.reduce((sum,p)=>sum+p.likes+p.reposts+p.replies,0)/posts.length/profile.followers*2000)):null,reason:'Mean public interactions per post / followers × 2000; not unique users',sources:posts.map(p=>p.source)},
 {name:'Track Record',weight:15,value:null,reason:'No independently verified project outcome history',sources:[]},
 {name:'Audience Authenticity',weight:10,value:null,reason:'Public profiles alone cannot establish authenticity',sources:[]},
 {name:'Network Overlap',weight:10,value:null,reason:'No complete audience intersection graph',sources:[]}];
 const score=weightedScore(components);return {profile,members,...score,components,coverage:profile.followers?Math.min(100,count/profile.followers*100):0,confidence:Math.round(Math.min(1,count/100)* (count?known/count:0)*score.availableWeight),preliminary:true,formulaVersion:VERSION,audience:categories.map(category=>{const amount=members.filter(m=>m.category===category).length;return {category,count:amount,percent:count?amount/count*100:0};}),denominator:count,reach:{total:members.reduce((sum,m)=>sum+m.profile.followers,0),unique:null,alpha:null,method:'Sum of followers of inspected accounts; duplicates possible',source:sources.join(', '),observedAt:new Date().toISOString(),limitations:['No audience intersections; unique and alpha reach unavailable']},limitations:[...limitations,'Non-random provider sample; not representative of all followers','Initial weights are heuristics; missing components are excluded, not zero'],updatedAt:new Date().toISOString(),demo};
}
