'use strict';
const {authorize}=require('./mercadolivre');
const M=require('../metricas-core');
const SELLER='674281461', ROOT='https://api.mercadolibre.com';
const cache=new Map();
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const cents=v=>v==null?null:M.money(v);
const text=v=>v==null?null:String(v);
function own(d){if(String(d.seller?.id??d.seller_id)!==SELLER)throw new Error('Registro fora da conta Cacife.');return d;}
function cleanOrder(raw){const d=own(raw);return {id:String(d.id),created:d.date_created,status:d.status,currency:d.currency_id,total:cents(d.total_amount),paid:cents(d.paid_amount),shipmentId:text(d.shipping?.id),items:(d.order_items||[]).map(i=>({id:i.item?.id,title:i.item?.title||'Produto',sku:i.item?.seller_sku||i.item?.seller_custom_field||null,variation:text(i.item?.variation_id),quantity:number(i.quantity),price:cents(i.unit_price),fee:cents(i.sale_fee)})),payments:(d.payments||[]).map(p=>({id:text(p.id),status:p.status,method:p.payment_method_id,type:p.payment_type,installments:number(p.installments),approved:p.date_approved,refunded:cents(p.transaction_amount_refunded)}))};}
function cleanShipment(d){return {status:d.status,substatus:d.substatus,logistics:d.logistic_type,tracking:d.tracking_number||null,estimate:d.shipping_option?.estimated_delivery_time?.date||d.shipping_option?.estimated_delivery_limit?.date||null,history:Object.fromEntries(['date_handling','date_ready_to_ship','date_shipped','date_delivered','date_cancelled','date_returned','date_not_delivered'].map(k=>[k,d.status_history?.[k]||null]))};}
function safeURL(value,image=false){try{const u=new URL(value);if(image&&u.hostname.endsWith('.mlstatic.com')){u.protocol='https:';return u.href;}if(!image&&u.protocol==='https:'&&(u.hostname==='mercadolivre.com.br'||u.hostname.endsWith('.mercadolivre.com.br')))return u.href;}catch{}return null;}
function cleanItem(raw){const d=own(raw);return {id:d.id,title:d.title,status:d.status,stock:number(d.available_quantity),sold:number(d.sold_quantity),type:d.listing_type_id,logistics:d.shipping?.logistic_type,freeShipping:d.shipping?.free_shipping===true,image:safeURL(d.thumbnail,true),url:safeURL(d.permalink)};}
async function pool(items,fn,size=4){const out=new Array(items.length);let index=0;await Promise.all(Array.from({length:Math.min(size,items.length)},async()=>{while(index<items.length){const i=index++;out[i]=await fn(items[i],i);}}));return out;}
async function cached(key,fn,enabled){if(!enabled)return fn();const hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.value;if(cache.size>100)cache.delete(cache.keys().next().value);const value=Promise.resolve().then(fn);cache.set(key,{until:Date.now()+120000,value});try{return await value;}catch(e){cache.delete(key);throw e;}}
async function connect(options){await authorize(options);return require('./ml-auth').createReader(options);}
function validRange(start,end){M.range(start,end);if(M.day(start+'T12:00:00Z')!==start||M.day(end+'T12:00:00Z')!==end)throw new Error('Datas inválidas.');if((new Date(end)-new Date(start))/86400000>365)throw new Error('Selecione até 366 dias.');return {from:start+'T00:00:00.000-03:00',to:end+'T23:59:59.999-03:00'};}
async function orders(options,start,end){const dates=validRange(start,end),get=await connect(options);return cached('orders:'+start+':'+end,async()=>{
 async function block(from,to){
  const bounds=validRange(from,to);
  const base='/orders/search?'+new URLSearchParams({seller:SELLER,'order.date_created.from':bounds.from,'order.date_created.to':bounds.to,sort:'date_desc',limit:'50'});
  const first=await get(base+'&offset=0'),total=first.paging?.total;
  if(!Number.isInteger(total)||total<0)throw new Error('Total de pedidos inválido.');
  if(total>9500){
   if(from===to)throw new Error('Volume diário acima do limite de consulta. Nenhum total parcial foi exibido.');
   const middle=M.shift(from,Math.floor((new Date(to)-new Date(from))/86400000/2));
   return [...await block(from,middle),...await block(M.shift(middle,1),to)];
  }
  const pages=await pool(Array.from({length:Math.max(0,Math.ceil(total/50)-1)},(_,i)=>(i+1)*50),offset=>get(base+'&offset='+offset));
  const map=new Map();for(const raw of [first,...pages].flatMap(p=>p.results||[])){const o=cleanOrder(raw);map.set(o.id,o);}
  if(map.size<total){
   if(from!==to){const middle=M.shift(from,Math.floor((new Date(to)-new Date(from))/86400000/2));return [...await block(from,middle),...await block(M.shift(middle,1),to)];}
   throw new Error('O Mercado Livre retornou pedidos incompletos em '+from+'. Tente novamente. Nenhum total parcial foi exibido.');
  }
  return [...map.values()].filter(o=>new Date(o.created)>=new Date(bounds.from)&&new Date(o.created)<=new Date(bounds.to));
 }
 const map=new Map();
 // Sequential blocks keep API concurrency bounded; the route persists the complete snapshot.
 for(let from=start;from<=end;){
  const to=M.shift(from,29)<end?M.shift(from,29):end,key='ml-block:'+from+':'+to,hit=options.blockCache?.entries.get(key);
  const rows=hit&&Date.now()-hit.updated<120000?hit.data.orders:await block(from,to);
  if(options.blockCache&&rows!==hit?.data.orders)await options.blockCache.put(key,{orders:rows});
  for(const order of rows)map.set(order.id,order);from=M.shift(to,1);
 }
 const scoped=[...map.values()].sort((a,b)=>new Date(b.created)-new Date(a.created)||b.id.localeCompare(a.id));
 const frequency=new Map();for(const order of scoped)for(const item of order.items)frequency.set(item.id,(frequency.get(item.id)||0)+(item.quantity||0));let products=[];try{products=await itemsByIds(get,[...frequency].sort((a,b)=>b[1]-a[1]).slice(0,10).map(x=>x[0]));}catch{}
 return {orders:scoped,products,total:scoped.length,queriedAt:new Date().toISOString()};
 },!options.fetchImpl&&!options.noCache);}
async function itemsByIds(get,ids){const clean=[...new Set(ids)].filter(id=>/^MLB\d+$/.test(id)).slice(0,50);if(!clean.length)return [];const d=await get('/items?ids='+clean.join(',')+'&attributes=id,seller_id,title,status,available_quantity,sold_quantity,listing_type_id,shipping,thumbnail,permalink');return d.filter(x=>x.code===200).map(x=>cleanItem(x.body));}
async function listings(options,{status='active',offset=0,q=''}={}){if(!['active','paused','closed'].includes(status)||!Number.isInteger(offset)||offset<0||offset>950||q.length>120)throw new Error('Filtro inválido.');const get=await connect(options);return cached('items:'+status+':'+offset+':'+q,async()=>{const d=await get('/users/'+SELLER+'/items/search?'+new URLSearchParams({status,offset:String(offset),limit:'20',...(q?{q}:{})}));const items=await itemsByIds(get,d.results||[]);await pool(items,async item=>{try{const p=await get('/items/'+item.id+'/sale_price?context=channel_marketplace');item.price=p.currency_id==='BRL'?cents(p.amount):null;item.regular=p.currency_id==='BRL'?cents(p.regular_amount):null;}catch{item.price=null;item.priceUnavailable=true;}});return {items,total:d.paging?.total??null,offset,queriedAt:new Date().toISOString()};},!options.fetchImpl&&!options.noCache);}
async function questions(options,{status='UNANSWERED',offset=0}={}){if(!['UNANSWERED','ANSWERED'].includes(status)||!Number.isInteger(offset)||offset<0||offset>950)throw new Error('Filtro inválido.');const get=await connect(options);return cached('questions:'+status+':'+offset,async()=>{const d=await get('/my/received_questions/search?'+new URLSearchParams({seller_id:SELLER,status,limit:'20',offset:String(offset),sort_fields:'date_created',sort_types:'DESC'}));const questions=(d.questions||[]).map(raw=>{const q=own(raw);return {id:String(q.id),itemId:q.item_id,text:q.text||'',status:q.status,created:q.date_created,answer:q.answer?{text:q.answer.text||'',status:q.answer.status,created:q.answer.date_created}:null};});let products=[];try{products=await itemsByIds(get,questions.map(q=>q.itemId));}catch{}return {questions,products,total:d.total??null,offset,queriedAt:new Date().toISOString()};},!options.fetchImpl&&!options.noCache);}
async function shipment(options,id){if(!/^\d{1,20}$/.test(id))throw new Error('Pedido inválido.');const get=await connect(options);return cached('shipment:'+id,async()=>{const o=own(await get('/orders/'+id));if(!o.shipping?.id)return {shipment:null};const raw=await get('/shipments/'+o.shipping.id);if(String(raw.sender_id)!==SELLER)throw new Error('Envio fora da conta Cacife.');return {shipment:cleanShipment(raw)};},!options.fetchImpl&&!options.noCache);}
module.exports={orders,listings,questions,shipment,cleanOrder,cleanShipment,cleanItem,validRange};
