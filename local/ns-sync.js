'use strict';
const {authorize}=require('./mercadolivre'),W=require('./ns-workspace'),M=require('../metricas-core');
const {ChannelCache}=require('./channel-cache');
function createSync(cache=new ChannelCache(),{scan=W.changedOrders,auth=authorize}={}){
 let pending;
 const key='ns-order-index';
 function sync(options,start){
  if(pending)return pending;
  const old=cache.entries.get(key)?.data,full=!old||old.coverageStart>start;
  const since=full?M.range(start,start).start:new Date(new Date(old.syncedAt).getTime()-120000).toISOString();
  const snapshot=new Date().toISOString();
  pending=(async()=>{const rows=await scan(options,since,snapshot),map=new Map((full?[]:old.orders).map(o=>[o.id,o]));for(const o of rows)map.set(o.id,o);const data={coverageStart:full?start:old.coverageStart,syncedAt:snapshot,orders:[...map.values()].sort((a,b)=>new Date(b.created)-new Date(a.created))};await cache.put(key,data);cache.failures.delete(key);return data;})().catch(e=>{cache.failures.set(key,{at:Date.now(),message:e.message});throw e;}).finally(()=>{pending=null;});pending.catch(()=>{});return pending;
 }
 return {async orders(options,start,end,force=false){
  const range=M.range(start,end);if((new Date(end)-new Date(start))/86400000>365||M.day(start+'T12:00:00Z')!==start||M.day(end+'T12:00:00Z')!==end)throw new Error('Selecione até 366 dias válidos.');
  await auth(options);
  let entry=cache.entries.get(key),data=entry?.data;
  if(!data||data.coverageStart>start){if(pending)await pending;data=cache.entries.get(key)?.data;if(!data||data.coverageStart>start)await sync(options,start);entry=cache.entries.get(key);data=entry.data;}
  else if(force||Date.now()-entry.updated>60000){const failed=cache.failures.get(key);if(force||!failed||Date.now()-failed.at>30000)void sync(options,start);}
  const within=v=>v&&new Date(v)>=new Date(range.start)&&new Date(v)<new Date(range.end);
  return {orders:data.orders.filter(o=>within(o.created)||within(o.paidAt)),queriedAt:data.syncedAt,start,end,cache:{updatedAt:new Date(entry.updated).toISOString(),refreshing:Boolean(pending),stale:Date.now()-entry.updated>60000,error:cache.failures.get(key)?.message||null}};
 }};
}
module.exports={createSync};
