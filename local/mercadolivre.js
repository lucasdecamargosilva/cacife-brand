'use strict';
const SUPABASE='https://quantic-supabase.k5jwra.easypanel.host';
const USER='9d41b952-5345-4bb9-bac2-ee64023d88bd';
const SELLER='674281461';
async function authorize({serviceKey,authorization,fetchImpl=fetch}){
 if(!serviceKey||!/^Bearer [A-Za-z0-9._-]+$/.test(authorization||''))throw new Error('Entre na conta da Cacife.');
 let r;try{r=await fetchImpl(SUPABASE+'/auth/v1/user',{headers:{apikey:serviceKey,Authorization:authorization},signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw new Error('Não foi possível validar a sessão.');}
 if(!r.ok||(await r.json()).id!==USER)throw new Error('Esta consulta está restrita à conta da Cacife.');
}
async function summary({serviceKey,authorization,config,fetchImpl=fetch}){
 if(!serviceKey||!/^Bearer [A-Za-z0-9._-]+$/.test(authorization||''))throw new Error('Entre na conta da Cacife para consultar o Mercado Livre.');
 await authorize({serviceKey,authorization,fetchImpl});
 const request=await require('./ml-auth').createReader({serviceKey,config,fetchImpl});
 const tasks=[['reputation','/users/'+SELLER],['listings','/users/'+SELLER+'/items/search?status=active&sort=sold_quantity_desc&limit=12'],['paused','/users/'+SELLER+'/items/search?status=paused&limit=1'],['questions','/my/received_questions/search?seller_id='+SELLER+'&status=UNANSWERED&limit=5'],['visits','/users/'+SELLER+'/items_visits/time_window?last=30&unit=day']];
 const responses=await Promise.allSettled(tasks.map(([,p])=>request(p)));
 const result={source:'Mercado Livre API',queriedAt:new Date().toISOString(),warnings:[]};
 responses.forEach((response,i)=>{const name=tasks[i][0];if(response.status!=='fulfilled'){result.warnings.push(name);return;}const d=response.value;
  if(name==='reputation'){const rep=d.seller_reputation||{};result.reputation={level:rep.level_id||null,power:rep.power_seller_status||null,metrics:{}};for(const key of ['sales','claims','delayed_handling_time','cancellations']){const metric=rep.metrics?.[key];if(metric)result.reputation.metrics[key]={period:metric.period,value:metric.value??metric.completed,rate:metric.rate??null};}}
  if(name==='listings'){result.activeListings=d.paging?.total??null;result.itemIds=(d.results||[]).filter(id=>/^MLB\d+$/.test(id));}
  if(name==='paused')result.pausedListings=d.paging?.total??null;
  if(name==='questions'){result.unansweredQuestions=d.total??d.paging?.total??null;result.questions=(d.questions||[]).slice(0,5).map(q=>({id:q.id,itemId:q.item_id,text:String(q.text||'').slice(0,500),createdAt:q.date_created}));}
  if(name==='visits'&&Number.isFinite(d.total_visits))result.visits={total:d.total_visits,from:d.date_from,to:d.date_to,days:(d.results||[]).map(v=>({date:v.date,total:v.total}))};
 });
 if(result.itemIds?.length){try{const items=await request('/items?ids='+result.itemIds.join(',')+'&attributes=id,seller_id,title,price,currency_id,status,available_quantity,sold_quantity,listing_type_id,shipping');result.items=items.filter(i=>i.code===200&&String(i.body?.seller_id)===SELLER).map(({body:b})=>({id:b.id,title:b.title,price:b.price,currency:b.currency_id,stock:b.available_quantity,sold:b.sold_quantity,type:b.listing_type_id,freeShipping:b.shipping?.free_shipping,logistics:b.shipping?.logistic_type}));}catch{result.warnings.push('items');}}
 delete result.itemIds;
 return result;
}
module.exports={summary,authorize};
