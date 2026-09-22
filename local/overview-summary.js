'use strict';
const ML=require('../ml-core'),NS=require('../ns-core'),M=require('../metricas-core');
function summarize(ml,ns,start,end){
 const byChannel={mercadolivre:{...ML.summarize(ml.orders),orders:ml.orders.length},nuvemshop:{...NS.summarize(ns.orders,start,end),orders:ns.orders.filter(o=>NS.within(o.created,start,end)).length}};
 // Nuvemshop é loja própria (sem comissão de marketplace): líquido = bruto.
 byChannel.nuvemshop.fees=0;byChannel.nuvemshop.net=byChannel.nuvemshop.revenue;
 byChannel.mercadolivre.fees=byChannel.mercadolivre.fees||0;byChannel.mercadolivre.net=byChannel.mercadolivre.net??(byChannel.mercadolivre.revenue-byChannel.mercadolivre.fees);
 const result={orders:0,revenue:0,paid:0,cancelled:0,pending:0,net:0,fees:0,byDay:{},byChannel,refreshing:!!(ml.cache?.refreshing||ns.cache?.refreshing),queriedAt:[ml.queriedAt,ns.queriedAt].filter(Boolean).sort()[0],warnings:[ml.cache?.error,ns.cache?.error].filter(Boolean)};
 for(const bucket of Object.values(byChannel)){for(const key of ['orders','revenue','paid','cancelled','pending','net','fees'])result[key]+=bucket[key]||0;for(const [day,value]of Object.entries(bucket.byDay))result.byDay[day]=(result.byDay[day]||0)+value;}
 result.topProducts=M.topProducts(byChannel);for(const bucket of Object.values(byChannel))delete bucket.ranking;
 result.ticket=result.paid?result.revenue/result.paid:0;return result;
}
module.exports={summarize};
