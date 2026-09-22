(function(root){
 'use strict';
 const M=typeof module!=='undefined'&&module.exports?require('./metricas-core'):root.CacifeMetrics;
 function summarize(orders){const result={revenue:0,paid:0,units:0,cancelled:0,ticket:0,fees:0,net:0,byDay:{},ranking:[],otherCurrency:0};const products=new Map(),seen=new Set();
  for(const o of orders){if(seen.has(o.id))throw new Error('Pedido duplicado na consulta.');seen.add(o.id);if(o.status==='cancelled'){result.cancelled++;continue;}if(o.currency!=='BRL'){result.otherCurrency++;continue;}if(!['paid','partially_refunded'].includes(o.status)||o.payments.some(p=>['refunded','charged_back'].includes(p.status))&&!o.payments.some(p=>p.status==='approved'))continue;
   if(!Number.isSafeInteger(o.total)||o.total<0)throw new Error('Pedido com valor inválido.');result.revenue+=o.total;result.paid++;const day=M.day(o.created);result.byDay[day]=(result.byDay[day]||0)+o.total;
   for(const item of o.items){if(!Number.isSafeInteger(item.quantity)||item.quantity<0||!Number.isSafeInteger(item.price))throw new Error('Item com quantidade ou preço inválido.');result.units+=item.quantity;const key=item.id+':'+(item.variation||'');const row=products.get(key)||{...item,quantity:0,value:0};row.quantity+=item.quantity;row.value+=item.quantity*item.price;products.set(key,row);result.fees+=(Number.isSafeInteger(item.fee)?item.fee:0)*item.quantity;}
  }result.ticket=result.paid?Math.round(result.revenue/result.paid):0;result.net=result.revenue-result.fees;result.ranking=[...products.values()].sort((a,b)=>b.quantity-a.quantity||b.value-a.value);return result;
 }
 function paymentRows(orders){return orders.flatMap(order=>order.payments.length?order.payments.map(payment=>({order,payment})):[{order,payment:{}}]);}
 const api={summarize,paymentRows};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MLCore=api;
})(typeof window==='undefined'?globalThis:window);
