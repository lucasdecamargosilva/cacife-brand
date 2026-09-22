const test=require('node:test'),assert=require('node:assert/strict');
const {catalog,checkouts,summary}=require('./nuvemshop');
test('catalog separates unpublished, unmanaged and unknown stock from real stock alerts',()=>{
 const result=catalog([{id:1,name:{pt:'Produto'},published:true,variants:[{id:1,stock_management:true,stock:0},{id:2,stock_management:true,stock:3},{id:3,stock_management:false,stock:null},{id:4,stock_management:true,stock:null}]},{id:2,published:false,variants:[{stock_management:true,stock:0}]}]);
 assert.equal(result.products,2);assert.equal(result.published,1);assert.equal(result.zero,1);assert.equal(result.low,1);assert.equal(result.unknown,1);assert.equal(result.unmanaged,1);assert.equal(result.alerts.length,2);
});
test('checkout analysis deduplicates product per cart, excludes completed, and enforces tenant',()=>{
 const row={id:1,store_id:1081093,total:'99.90',currency:'BRL',created_at:'2026-09-16T12:00:00Z',products:[{product_id:1,name:'A'},{product_id:1,name:'A'}],contact_email:'PRIVATE'};
 const result=checkouts([row,{...row,id:2,completed_at:'2026-09-16T13:00:00Z'}],Date.parse('2026-09-16T14:00:00Z'));
 assert.equal(result.count,1);assert.equal(result.value,9990);assert.equal(result.products[0].carts,1);assert(!JSON.stringify(result).includes('PRIVATE'));
 assert.throws(()=>checkouts([{...row,store_id:123}]),/outra loja/);
});
test('external pagination cannot forward credentials to another host and each resource fails independently',async()=>{
 const calls=[];const fetchImpl=async url=>{calls.push(String(url));if(String(url).includes('/auth/v1/user'))return{ok:true,json:async()=>({id:'9d41b952-5345-4bb9-bac2-ee64023d88bd'})};return{ok:true,headers:new Headers({link:'<https://attacker.example/page>; rel="next"'}),json:async()=>[]};};
 const result=await summary({serviceKey:'test',authorization:'Bearer test',config:{storeId:1081093,token:'secret'},fetchImpl});
 assert.equal(result.catalog,null);assert.equal(result.checkouts,null);assert(!calls.some(u=>u.includes('attacker')));
});
