const test=require('node:test'),assert=require('node:assert/strict');
const {cleanOrder,cleanShipment,cleanItem,validRange,orders,shipment}=require('./ml-workspace');
const C=require('../ml-core');
const raw=(id,status='paid')=>({id,seller:{id:674281461},buyer:{email:'private'},status,currency_id:'BRL',date_created:'2026-09-15T10:00:00-03:00',total_amount:100,paid_amount:100,shipping:{id:123},order_items:[{item:{id:'MLB123',title:'Óculos',seller_sku:'SKU'},quantity:2,unit_price:50,sale_fee:7}],payments:[{id:1,status:'approved',payer_id:'private',transaction_amount_refunded:0}]});
test('sanitizes orders and protects seller isolation',()=>{const o=cleanOrder(raw(1));assert.equal(o.total,10000);assert.equal(o.items[0].fee,700);assert(!JSON.stringify(o).includes('private'));assert.throws(()=>cleanOrder({...raw(2),seller:{id:22}}),/fora/);});
test('sales and rankings exclude cancelled and fully refunded orders, preserve quantities, reject duplicates',()=>{const paid=cleanOrder(raw(1)),cancelled=cleanOrder(raw(2,'cancelled')),refund=cleanOrder({...raw(3),payments:[{status:'refunded'}]});const s=C.summarize([paid,cancelled,refund]);assert.equal(s.revenue,10000);assert.equal(s.units,2);assert.equal(s.ticket,10000);assert.equal(s.ranking[0].value,10000);assert.equal(s.cancelled,1);assert.throws(()=>C.summarize([paid,paid]),/duplicado/);assert.equal(C.paymentRows([paid]).length,1);});
test('shipment omits addresses and safe URLs reject arbitrary external hosts',()=>{const d=cleanShipment({receiver_address:{street:'private'},status:'shipped',shipping_option:{estimated_delivery_time:{date:'2026-09-16'}},status_history:{date_shipped:'2026-09-15'}});assert(!JSON.stringify(d).includes('private'));assert.equal(d.estimate,'2026-09-16');const item=cleanItem({seller_id:674281461,id:'MLB1',thumbnail:'https://evil.test/image',permalink:'javascript:alert(1)'});assert.equal(item.image,null);assert.equal(item.url,null);});
test('invalid date and excessive ranges are rejected',()=>{assert.throws(()=>validRange('2026-02-31','2026-03-10'));assert.throws(()=>validRange('2025-01-01','2026-09-01'),/366 dias/);});
test('order pagination must be complete and authorization precedes seller token',async()=>{let calls=0;const options={serviceKey:'private',authorization:'Bearer user',fetchImpl:async url=>{calls++;return {ok:true,json:async()=>url.includes('/auth/v1/user')?{id:'9d41b952-5345-4bb9-bac2-ee64023d88bd'}:url.includes('ml_tokens')?[{access_token:'secret'}]:{paging:{total:2},results:[raw(1)]}};}};await assert.rejects(orders(options,'2026-09-15','2026-09-15'),/incompletos/);assert.equal(calls,3);});
test('shipment refuses another seller before loading shipment',async()=>{let calls=0;const options={serviceKey:'private',authorization:'Bearer user',fetchImpl:async url=>{calls++;return {ok:true,json:async()=>url.includes('/auth/v1/user')?{id:'9d41b952-5345-4bb9-bac2-ee64023d88bd'}:url.includes('ml_tokens')?[{access_token:'secret'}]:{...raw(1),seller:{id:99}}};}};await assert.rejects(shipment(options,'123'),/fora/);assert.equal(calls,3);});
test('complete API results are filtered to exact local boundaries without reporting false incompleteness',async()=>{const options={serviceKey:'private',authorization:'Bearer user',fetchImpl:async url=>({ok:true,json:async()=>url.includes('/auth/v1/user')?{id:'9d41b952-5345-4bb9-bac2-ee64023d88bd'}:url.includes('ml_tokens')?[{access_token:'secret'}]:url.includes('/items?')?[]:{paging:{total:2},results:[raw(1),{...raw(2),date_created:'2026-09-14T23:59:59-03:00'}]}})};const d=await orders(options,'2026-09-15','2026-09-15');assert.equal(d.total,1);assert.equal(d.orders[0].id,'1');});
test('partially refunded orders retain gross sales, refunds are not silently subtracted',()=>{const o=cleanOrder({...raw(1,'partially_refunded'),payments:[{status:'approved',transaction_amount_refunded:10}]});assert.equal(C.summarize([o]).revenue,10000);assert.equal(o.payments[0].refunded,1000);});

test('annual orders load bounded non-overlapping blocks and preserve every boundary day',async()=>{
 const seen=[];const M=require('../metricas-core');
 const options={serviceKey:'private',authorization:'Bearer user',fetchImpl:async url=>({ok:true,json:async()=>{
  if(url.includes('/auth/v1/user'))return {id:'9d41b952-5345-4bb9-bac2-ee64023d88bd'};
  if(url.includes('ml_tokens'))return [{access_token:'secret'}];
  if(url.includes('/items?'))return [];
  const q=new URL(url).searchParams,from=q.get('order.date_created.from').slice(0,10),to=q.get('order.date_created.to').slice(0,10);seen.push([from,to]);
  assert((new Date(to)-new Date(from))/86400000<=29);
  return {paging:{total:1},results:[{...raw(seen.length),date_created:from+'T00:00:00-03:00'}]};
 }})};
 const result=await orders(options,'2025-09-16','2026-09-16');
 assert.equal(seen[0][0],'2025-09-16');assert.equal(seen.at(-1)[1],'2026-09-16');
 for(let i=1;i<seen.length;i++)assert.equal(seen[i][0],M.shift(seen[i-1][1],1));
 assert.equal(result.total,seen.length);assert.equal(C.summarize(result.orders).revenue,seen.length*10000);
});

test('incomplete large pages are retried as smaller date ranges without losing orders',async()=>{
 const calls=[];const options={serviceKey:'private',authorization:'Bearer user',fetchImpl:async url=>({ok:true,json:async()=>{
 if(url.includes('/auth/v1/user'))return {id:'9d41b952-5345-4bb9-bac2-ee64023d88bd'};
 if(url.includes('ml_tokens'))return [{access_token:'secret'}];if(url.includes('/items?'))return [];
 const q=new URL(url).searchParams,from=q.get('order.date_created.from').slice(0,10),to=q.get('order.date_created.to').slice(0,10);calls.push([from,to]);
 if(from!==to)return {paging:{total:2},results:[raw(1)]};
 return {paging:{total:1},results:[{...raw(from),date_created:from+'T12:00:00-03:00'}]};
 }})};const result=await orders(options,'2026-09-15','2026-09-16');assert.equal(result.total,2);assert.equal(calls.length,3);assert.equal(C.summarize(result.orders).revenue,20000);
});

test('completed ML blocks survive a later failure and are reused on retry',async()=>{const blockCache={entries:new Map(),async put(key,data){this.entries.set(key,{data,updated:Date.now()});}};let firstCalls=0,fail=true;const options={serviceKey:'private',authorization:'Bearer user',blockCache,fetchImpl:async url=>({ok:true,json:async()=>{if(url.includes('/auth/v1/user'))return {id:'9d41b952-5345-4bb9-bac2-ee64023d88bd'};if(url.includes('ml_tokens'))return [{access_token:'secret'}];if(url.includes('/items?'))return [];const from=new URL(url).searchParams.get('order.date_created.from').slice(0,10);if(from==='2026-01-01')firstCalls++;else if(fail)throw Error('Temporary failure');return {paging:{total:1},results:[{...raw(from),date_created:from+'T12:00:00-03:00'}]};}})};await assert.rejects(orders(options,'2026-01-01','2026-01-31'),/Temporary/);fail=false;assert.equal((await orders(options,'2026-01-01','2026-01-31')).total,2);assert.equal(firstCalls,1);});
