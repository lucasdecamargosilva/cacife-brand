'use strict';
const {authorize}=require('./mercadolivre');
const M=require('../metricas-core');
const STORE='1081093',BASE='https://api.nuvemshop.com.br/2025-03/'+STORE+'/';
const cache=new Map();
const title=v=>typeof v==='string'?v:v?.pt||v?.es||Object.values(v||{})[0]||'Sem nome';
const cents=v=>v==null?null:M.money(v);
function imageURL(value){try{const u=new URL(value);if(u.protocol==='https:'&&['dcdn-us.mitiendanube.com','dcdn.mitiendanube.com','acdn-us.mitiendanube.com','acdn.mitiendanube.com'].includes(u.hostname))return u.href;}catch{}return null;}
function storeURL(value){try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='www.cacifebrand.com.br')return u.href;}catch{}return null;}
function own(d){if(String(d.store_id)!==STORE)throw new Error('Dados fora da loja Cacife.');return d;}
function line(p){return {id:String(p.product_id||p.id),variantId:String(p.variant_id||''),title:p.name||'Produto',sku:p.sku||null,variant:(p.variant_values||[]).map(title).join(' / '),quantity:p.quantity==null?null:Number(p.quantity),price:cents(p.price),image:imageURL(p.image?.src||p.image?.url||p.image)};}
function cleanOrder(raw){const d=own(raw);return {id:String(d.id),number:d.number,created:d.created_at,paidAt:d.paid_at||null,status:d.status,payment:d.payment_status,shipping:d.shipping_status,origin:d.storefront,currency:d.currency,total:cents(d.total),subtotal:cents(d.subtotal),discount:cents(d.discount),paid:cents(d.total_paid_by_customer),gateway:d.gateway_name||d.gateway||null,method:d.payment_details?.method||null,installments:d.payment_details?.installments??null,items:(d.products||[]).map(line)};}
function cleanProduct(p){return {id:String(p.id),title:title(p.name),url:storeURL(p.canonical_url),published:p.published===true,image:imageURL(p.images?.[0]?.src),categories:(p.categories||[]).map(c=>typeof c==='object'?title(c.name):String(c)),variants:(p.variants||[]).map(v=>({id:String(v.id),sku:v.sku||null,title:(v.values||[]).map(title).join(' / ')||'Único',price:cents(v.price),promotional:cents(v.promotional_price),managed:v.stock_management===true,stock:Number.isFinite(v.stock)?v.stock:null}))};}
function cleanCheckout(raw){const d=own(raw);return {id:String(d.id),created:d.created_at,currency:d.currency,total:cents(d.total),completed:d.completed_at||null,url:storeURL(d.abandoned_checkout_url),notified:d.was_notified??null,stock:d.has_stock_available??null,items:(d.products||[]).map(line)};}
async function connect(options){await authorize(options);const {config,fetchImpl=fetch}=options;if(!config?.token||String(config.storeId)!==STORE)throw new Error('A Nuvemshop não está configurada para a Cacife.');
 return async function list(resource,query={}){
  const initial=new URL(resource,BASE);initial.search=new URLSearchParams({per_page:'200',...query});
  function safe(url){if(url.origin!==new URL(BASE).origin||!url.pathname.startsWith('/2025-03/'+STORE+'/'))throw new Error('Paginação fora da loja.');return url;}
  async function page(url){safe(url);let r;for(let attempt=0;attempt<3;attempt++){try{r=await fetchImpl(url.href,{headers:{Authentication:'bearer '+config.token,'User-Agent':'Cacife metrics (cacifebrand@outlook.com)'},signal:AbortSignal.timeout(25000),redirect:'error'});}catch{throw new Error('A Nuvemshop não respondeu. Tente novamente.');}if(r.status!==429&&!(r.status>=500))break;await new Promise(resolve=>setTimeout(resolve,Math.min(10000,Math.max(1000,Number(r.headers.get('retry-after')||1)*1000))));}
   if(!r.ok)throw new Error('Consulta Nuvemshop indisponível (HTTP '+r.status+').');const rows=await r.json();if(!Array.isArray(rows))throw new Error('Resposta inválida da Nuvemshop.');return {rows,link:r.headers.get('link')||'',total:Number(r.headers.get('x-total-count'))};}
  const first=await page(initial);
  if(resource==='orders'&&first.total>9500){
   const from=Date.parse(query.updated_at_min),to=Date.parse(query.updated_at_max);
   if(!Number.isFinite(from)||!Number.isFinite(to)||to-from<=1000)throw new Error('Volume de pedidos acima do limite neste intervalo. Nenhum total parcial foi exibido.');
   const middle=new Date(Math.floor((from+to)/2)).toISOString();
   const left=await list(resource,{...query,updated_at_max:middle});
   const right=await list(resource,{...query,updated_at_min:middle});
   // Inclusive boundary overlap is deduplicated by order ID, never summed twice.
   return [...new Map([...left,...right].map(o=>[String(o.id),o])).values()];
  }
  const pages=[first],next=/<([^>]+)>;\s*rel="next"/.exec(first.link),last=/<([^>]+)>;\s*rel="last"/.exec(first.link);
  if(next){const nextURL=safe(new URL(next[1]));if(last){const lastURL=safe(new URL(last[1])),end=Number(lastURL.searchParams.get('page'));if(!Number.isInteger(end)||end>10000||end<2)throw new Error('Consulta incompleta. Reduza o período.');let index=2;await Promise.all(Array.from({length:2},async()=>{while(index<=end){const number=index++,url=new URL(nextURL);url.searchParams.set('page',String(number));pages[number-1]=await page(url);}}));}else{let cursor=nextURL;const visited=new Set([initial.href]);while(cursor){if(visited.has(cursor.href)||visited.size>=10000)throw new Error('Consulta incompleta. Reduza o período.');visited.add(cursor.href);const current=await page(cursor);pages.push(current);const next=/<([^>]+)>;\s*rel="next"/.exec(current.link);cursor=next?safe(new URL(next[1])):null;}}}
  const rows=pages.flatMap(p=>p.rows);if(first.total>rows.length)throw new Error('A Nuvemshop retornou uma lista incompleta.');if(new Set(rows.map(r=>String(r.id))).size!==rows.length)throw new Error('Os registros mudaram durante a consulta. Atualize novamente.');return rows;
 };
}

async function cached(key,fn,options){if(options.fetchImpl||options.noCache)return fn();const hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.promise;if(cache.size>30)cache.delete(cache.keys().next().value);const promise=fn();cache.set(key,{until:Infinity,promise});try{const result=await promise;cache.set(key,{until:Date.now()+300000,promise});return result;}catch(e){cache.delete(key);throw e;}}
async function orders(options,start,end){const range=M.range(start,end);if(M.day(start+'T12:00:00Z')!==start||M.day(end+'T12:00:00Z')!==end||(new Date(end)-new Date(start))/86400000>365)throw new Error('Selecione um período válido de até 366 dias.');const list=await connect(options);return cached('orders:'+start+':'+end,async()=>{
 // Include orders created before the selected period but paid during it. Payment updates change updated_at.
 const all=(await list('orders',{per_page:'30',updated_at_min:range.start,updated_at_max:new Date().toISOString(),created_at_max:new Date(Math.min(Date.now(),new Date(range.end).getTime()-1)).toISOString(),fields:'id,store_id,number,created_at,paid_at,status,payment_status,shipping_status,storefront,currency,total,subtotal,discount,total_paid_by_customer,gateway_name,gateway,payment_details,products'})).map(cleanOrder);
 const within=v=>v&&new Date(v)>=new Date(range.start)&&new Date(v)<new Date(range.end);
 return {orders:all.filter(o=>within(o.created)||within(o.paidAt)),queriedAt:new Date().toISOString(),start,end};
 },options);}
async function products(options){const list=await connect(options);return cached('products',async()=>({products:(await list('products',{fields:'id,name,published,canonical_url,images,categories,variants'})).map(cleanProduct),queriedAt:new Date().toISOString()}),options);}
async function checkouts(options){const list=await connect(options);return cached('checkouts',async()=>({checkouts:(await list('checkouts',{fields:'id,store_id,created_at,completed_at,currency,total,was_notified,has_stock_available,abandoned_checkout_url,products'})).map(cleanCheckout).filter(c=>!c.completed),queriedAt:new Date().toISOString()}),options);}

async function changedOrders(options,since,snapshot){const list=await connect(options);return (await list('orders',{per_page:'30',updated_at_min:since,updated_at_max:snapshot,created_at_max:snapshot,fields:'id,store_id,number,created_at,paid_at,status,payment_status,shipping_status,storefront,currency,total,subtotal,discount,total_paid_by_customer,gateway_name,gateway,payment_details,products'})).map(cleanOrder);}
module.exports={changedOrders,orders,products,checkouts,cleanOrder,cleanProduct,cleanCheckout};
