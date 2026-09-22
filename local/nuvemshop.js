'use strict';
const {authorize}=require('./mercadolivre');
const {money}=require('../metricas-core');
const BASE='https://api.nuvemshop.com.br/2025-03/1081093/';
const title=value=>typeof value==='string'?value:value?.pt||value?.es||Object.values(value||{})[0]||'Sem nome';
function catalog(products){
 const result={products:products.length,published:0,hidden:0,variants:0,zero:0,low:0,unmanaged:0,unknown:0,stock:0,alerts:[]};
 for(const p of products){if(p.published)result.published++;else result.hidden++;
  if(!p.published)continue;
  for(const v of p.variants||[]){result.variants++;if(v.stock_management!==true){result.unmanaged++;continue;}if(!Number.isFinite(v.stock)){result.unknown++;continue;}result.stock+=v.stock;
   if(v.stock<=0)result.zero++;else if(v.stock<=5)result.low++;
   if(v.stock<=5)result.alerts.push({productId:p.id,variantId:v.id,title:title(p.name),variant:(v.values||[]).map(title).join(' / '),sku:v.sku||'—',stock:v.stock});
  }
 }
 result.alerts.sort((a,b)=>a.stock-b.stock||a.title.localeCompare(b.title));result.alerts=result.alerts.slice(0,15);return result;
}
function checkouts(rows,now=Date.now()){
 const result={count:0,value:0,unknownValue:0,notified:0,noStock:0,age:{'Até 24 horas':0,'De 1 a 3 dias':0,'De 3 a 7 dias':0,'Mais de 7 dias':0},products:[],oldest:null,newest:null};const items=new Map();
 for(const row of rows){if(String(row.store_id)!=='1081093')throw new Error('A API retornou dados de outra loja.');if(row.completed_at)continue;
  result.count++;const date=new Date(row.created_at).getTime();if(!Number.isFinite(date))throw new Error('Carrinho com data inválida.');
  if(!result.oldest||row.created_at<result.oldest)result.oldest=row.created_at;if(!result.newest||row.created_at>result.newest)result.newest=row.created_at;
  const age=(now-date)/86400000;result.age[age<1?'Até 24 horas':age<3?'De 1 a 3 dias':age<7?'De 3 a 7 dias':'Mais de 7 dias']++;
  if(row.currency==='BRL'&&row.total!=null){const cents=money(row.total);if(cents<0)throw new Error('Valor de carrinho inválido.');result.value+=cents;}else result.unknownValue++;
  if(row.was_notified===true)result.notified++;if(row.has_stock_available===false)result.noStock++;
  const seen=new Set();for(const p of row.products||[]){if(!p.product_id)continue;const key=String(p.product_id);if(seen.has(key))continue;seen.add(key);const item=items.get(key)||{id:key,title:p.name||'Produto',carts:0};item.carts++;items.set(key,item);}
 }
 result.products=[...items.values()].sort((a,b)=>b.carts-a.carts).slice(0,8);return result;
}
let cached,pending;
async function summary({serviceKey,authorization,config,fetchImpl=fetch}){
 await authorize({serviceKey,authorization,fetchImpl});
 if(!config?.token||Number(config.storeId)!==1081093)throw new Error('Acesso da Nuvemshop não configurado.');
 if(fetchImpl===fetch&&cached&&Date.now()-cached.time<300000)return cached.data;
 if(fetchImpl===fetch&&pending)return pending;
 const work=(async()=>{
  async function list(resource,fields){let url=new URL(resource,BASE);url.search=new URLSearchParams({per_page:'200',fields});const rows=[],visited=new Set();
   while(url){if(visited.has(url.href)||visited.size>=30)throw new Error('Consulta incompleta: limite de páginas atingido.');if(url.origin!==new URL(BASE).origin||!url.pathname.startsWith('/2025-03/1081093/'))throw new Error('Paginação fora da loja.');visited.add(url.href);
    let r;try{r=await fetchImpl(url,{headers:{Authentication:'bearer '+config.token,'User-Agent':'Cacife metrics (cacifebrand@outlook.com)'},signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw new Error('A Nuvemshop não respondeu.');}
    if(!r.ok)throw new Error('Consulta Nuvemshop indisponível (HTTP '+r.status+').');const page=await r.json();if(!Array.isArray(page))throw new Error('Resposta inválida da Nuvemshop.');rows.push(...page);
    const next=/<([^>]+)>;\s*rel="next"/.exec(r.headers.get('link')||'');url=next?new URL(next[1]):null;
    const total=Number(r.headers.get('x-total-count'));if(!url&&total>rows.length)throw new Error('A API retornou uma lista incompleta.');
   }return rows;
  }
  const results=await Promise.allSettled([list('products','id,name,published,variants'),list('checkouts','id,store_id,total,currency,created_at,completed_at,was_notified,has_stock_available,products')]);
  const data={queriedAt:new Date().toISOString(),catalog:null,checkouts:null,errors:{}};
  for(let i=0;i<results.length;i++){const key=i?'checkouts':'catalog',r=results[i];if(r.status==='fulfilled'){try{data[key]=i?checkouts(r.value):catalog(r.value);}catch(e){data.errors[key]=e.message;}}else data.errors[key]=r.reason.message;}
  if(fetchImpl===fetch&&data.catalog&&data.checkouts)cached={time:Date.now(),data};return data;
 })();
 if(fetchImpl===fetch)pending=work;try{return await work;}finally{if(fetchImpl===fetch)pending=null;}
}
module.exports={summary,catalog,checkouts};
