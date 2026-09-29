(function(root){'use strict';
 const dayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'});
 const within=(v,start,end)=>Boolean(v)&&new Date(v)>=new Date(start+'T00:00:00-03:00')&&new Date(v)<new Date(end+'T00:00:00-03:00').getTime()+86400000;
 function summarize(rows,start,end){const result={revenue:0,paid:0,ticket:0,cancelled:0,missingDate:0,pending:0,otherCurrency:0,byDay:{},ranking:[],operations:{unpacked:0,unfulfilled:0,fulfilled:0,delivered:0}},seen=new Set(),ranking=new Map();
  for(const o of rows){if(seen.has(o.id))throw Error('Pedido duplicado na consulta.');seen.add(o.id);const created=within(o.created,start,end),paid=within(o.paidAt,start,end);
   if(created){if(o.status==='cancelled')result.cancelled++;else {if(o.payment==='pending')result.pending++;const shipping=o.shipping==='shipped'?'fulfilled':o.shipping;if(Object.hasOwn(result.operations,shipping))result.operations[shipping]++;if(o.payment==='paid'&&!o.paidAt)result.missingDate++;}}
   if(!paid||o.status==='cancelled'||o.payment!=='paid')continue;
   if(o.currency!=='BRL'){result.otherCurrency++;continue;}if(!Number.isSafeInteger(o.total))throw Error('Pedido pago sem valor válido.');result.revenue+=o.total;result.paid++;
   const day=dayFormatter.format(new Date(o.paidAt));result.byDay[day]=(result.byDay[day]||0)+o.total;
   for(const item of o.items){if(!Number.isFinite(item.quantity)||!Number.isSafeInteger(item.price))continue;const key=item.id+'|'+item.variantId;const r=ranking.get(key)||{...item,units:0,value:0};r.units+=item.quantity;r.value+=item.quantity*item.price;ranking.set(key,r);}
  }result.ticket=result.paid?Math.round(result.revenue/result.paid):0;result.ranking=[...ranking.values()].sort((a,b)=>b.value-a.value);return result;
 }
 // Linhas de itens de pedidos pagos no período (mesmo critério do summarize), para a aba Produtos.
 function itemRows(rows,start,end){const out=[];for(const o of rows||[]){if(!within(o.paidAt,start,end)||o.status==='cancelled'||o.payment!=='paid'||o.currency!=='BRL')continue;for(const item of o.items||[]){if(!Number.isFinite(item.quantity)||!Number.isSafeInteger(item.price))continue;out.push({id:item.id,variantId:item.variantId||'',title:item.title,image:item.image||null,qty:item.quantity,value:Math.round(item.quantity*item.price),date:o.paidAt,variation:item.variant||'',orderId:o.id});}}return out;}
 const api={within,summarize,itemRows};if(typeof module!=='undefined')module.exports=api;else root.NSCore=api;
})(typeof window==='undefined'?globalThis:window);
