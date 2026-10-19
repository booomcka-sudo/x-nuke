import {categories,VERSION,type Profile,type Post,type Label,type Member,type Component,type Analysis} from '../../shared/src/index.js';

export function hasHistory(label:Label) {
 return !!(label.wallet&&label.method&&label.confidence>=0.8&&(label.closedTrades??0)>=10&&label.period&&label.historyQuality==='sufficient'&&(label.realizedPnl??0)>0);
}
export function classify(profile:Profile,labels:Label[]):Member {
 const label=labels.find(item=>item.accountId===profile.id);
 let category:Member['category']='Unknown / Insufficient Data';
 let reason='Insufficient public evidence';
 if(label) {
  category=label.category;reason='Curated public label';
  if(category==='Smart Money'&&!hasHistory(label)){category='Unknown / Insufficient Data';reason='Smart Money evidence does not meet ownership and history requirements';}
 }else if(/\b(crypto|solana|web3|defi)\b/i.test(profile.description)&&(profile.followers??0)>=10000) {
  category='Crypto KOLs';reason='Crypto biography and at least 10,000 followers; heuristic';
 }else if(/\b(ai|engineer|developer|machine learning|tech)\b/i.test(profile.description)) {
  category='AI / Tech';reason='Public biography keyword; heuristic';
 }else if(profile.description&&(profile.posts??0)>=20) {
  category='Regular Users';reason='Public biography and at least 20 posts; limited evidence';
 }
 return {profile,category,reason,tags:label?['curated']:category==='Unknown / Insufficient Data'?[]:['heuristic'],sources:[profile.source,...(label?[label.source]:[])],...(label?.wallet?{wallet:label}:{})};
}
export function weightedScore(components:Component[]) {
 const available=components.filter(component=>component.value!==null);
 const availableWeight=available.reduce((sum,component)=>sum+component.weight,0);
 return {score:availableWeight>=40&&available.length>=2?Math.round(available.reduce((sum,component)=>sum+component.value!*component.weight,0)/availableWeight):null,availableWeight};
}
export function audienceBreakdown(members:Member[]) {
 const counts=categories.map(category=>members.filter(member=>member.category===category).length);
 const exact=counts.map(count=>members.length?count/members.length*1000:0);
 const tenths=exact.map(Math.floor);
 let remaining=members.length?1000-tenths.reduce((sum,value)=>sum+value,0):0;
 for(const item of exact.map((value,index)=>({index,remainder:value-tenths[index]})).sort((left,right)=>right.remainder-left.remainder)) {
  if(remaining--<=0)break;
  tenths[item.index]++;
 }
 return categories.map((category,index)=>({category,count:counts[index],percent:tenths[index]/10}));
}
export function analyze(profile:Profile,members:Member[],posts:Post[],demo:boolean,limitations:string[]=[]):Analysis {
 const count=members.length;
 const known=members.filter(member=>member.category!=='Unknown / Insufficient Data').length;
 const qualified=members.filter(member=>member.wallet&&hasHistory(member.wallet));
 const metricProfiles=members.filter(member=>member.profile.followers!==null&&member.profile.posts!==null);
 const kolProfiles=members.filter(member=>member.category==='Crypto KOLs');
 const complete=metricProfiles.filter(member=>member.profile.description.length>=10&&(member.profile.posts??0)>=20);
 const sources=members.map(member=>member.profile.source);
 const components:Component[]=[
  {name:'Smart Money',weight:30,value:qualified.length?Math.min(100,qualified.length/count*500):null,reason:'Confirmed profitable wallet labels / inspected sample × 500, capped at 100; unavailable without verified history',sources:qualified.flatMap(member=>member.sources)},
  {name:'Crypto KOLs',weight:20,value:count>=20&&metricProfiles.length/count>=0.7?Math.min(100,kolProfiles.length/count*300):null,reason:'Crypto KOL share × 300; requires at least 20 profiles and public metrics for 70% of the sample',sources:kolProfiles.length?kolProfiles.flatMap(member=>member.sources):sources},
  {name:'Engagement',weight:15,value:posts.length&&profile.followers?Math.min(100,Math.round(posts.reduce((sum,post)=>sum+post.likes+post.reposts+post.replies,0)/posts.length/profile.followers*2000)):null,reason:'Mean public interactions per post / followers × 2000; capped at 100; not unique users',sources:posts.map(post=>post.source)},
  {name:'Track Record',weight:15,value:null,reason:'No independently verified project outcome history',sources:[]},
  {name:'Audience Authenticity',weight:10,value:count>=20&&metricProfiles.length/count>=0.7?Math.round(complete.length/metricProfiles.length*100):null,reason:'Public profile completeness proxy: biography at least 10 characters and at least 20 posts. Does not verify identity or detect bots.',sources:metricProfiles.map(member=>member.profile.source)},
  {name:'Network Overlap',weight:10,value:null,reason:'No complete audience intersection graph',sources:[]},
 ];
 const score=weightedScore(components);
 const allMetrics=members.every(member=>member.profile.followers!==null);
 return {
  profile,members,...score,components,
  coverage:profile.followers===null?null:profile.followers?Math.min(100,count/profile.followers*100):0,
  confidence:Math.round(Math.min(1,count/100)*(count?known/count:0)*score.availableWeight*0.65),
  preliminary:true,formulaVersion:VERSION,audience:audienceBreakdown(members),denominator:count,
  reach:{total:count&&allMetrics?members.reduce((sum,member)=>sum+member.profile.followers!,0):null,unique:null,alpha:null,method:'Sum of followers of inspected accounts; duplicates possible',source:sources.join(', '),observedAt:new Date().toISOString(),limitations:['No audience intersections; unique and alpha reach unavailable',...(!allMetrics?['Some follower metrics are unavailable']:[])]},
  limitations:[...new Set([...limitations,'Non-random provider sample; not representative of all followers','Initial weights and confidence are heuristics, not statistical probabilities','Profile completeness is not identity verification; missing components are excluded, not zero'])],
  updatedAt:new Date().toISOString(),demo,
 };
}
