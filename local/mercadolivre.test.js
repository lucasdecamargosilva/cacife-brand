const test=require('node:test'),assert=require('node:assert/strict');
const {summary}=require('./mercadolivre');
test('ML denies a different authenticated user before reading credentials',async()=>{
 let calls=0;await assert.rejects(summary({serviceKey:'private',authorization:'Bearer user',fetchImpl:async()=>{calls++;return{ok:true,json:async()=>({id:'another-user'})};}}),/restrita/);assert.equal(calls,1);
});
test('ML returns only metrics, omits account PII and tolerates partial resource failure',async()=>{
 const fetchImpl=async url=>({ok:!url.includes('received_questions'),json:async()=>{
  if(url.includes('/auth/v1/user'))return{id:'9d41b952-5345-4bb9-bac2-ee64023d88bd',email:'private'};
  if(url.includes('ml_tokens'))return[{access_token:'SECRET'}];
  if(url.includes('items/search'))return{paging:{total:20},results:['private-item']};
  return{email:'private',seller_reputation:{level_id:'5_green',metrics:{claims:{period:'60 days',rate:.01,value:2}},transactions:{private:'excluded'}}};
 }});
 const result=await summary({serviceKey:'private',authorization:'Bearer user',fetchImpl});
 assert.equal(result.activeListings,20);assert.equal(result.reputation.metrics.claims.value,2);assert.deepEqual(result.warnings,['questions']);assert(!JSON.stringify(result).includes('SECRET'));assert(!JSON.stringify(result).includes('private'));
});
