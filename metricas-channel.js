(function(root){
 'use strict';
 const M=typeof module!=='undefined'&&module.exports?require('./metricas-core'):root.CacifeMetrics;
 function details(rows,channel){
  const selected=rows.filter(r=>(r.channel||'nuvemshop')===channel);
  const summary=M.summarize(selected,channel);
  const result={...summary,payments:{},shipping:{},states:{},fees:0,feeOrders:0,discounts:0,discountOrders:0,other:0,refunded:0};
  for(const row of selected){
   const payment=String(row.payment_status||'').toLowerCase().trim(),status=String(row.status||'').toLowerCase().trim();
   const excluded=/cancel|estorn|refund|reembols/.test(payment+' '+status),paid=!excluded&&['paid','confirmado','approved'].includes(payment);
   const group=excluded?'Cancelados / reembolsados':paid?'Pagos':['pending','pendente','aguardando pagamento'].includes(payment)?'Pagamento pendente':'Outras situações';
   result.states[group]=(result.states[group]||0)+1;
   if(group==='Outras situações')result.other++;
   if(/refund|reembols|estorn/.test(payment))result.refunded++;
   if(!paid)continue;
   const method=String(row.payment_method||'Não informado'),shipping=String(row.shipping_status||'Não informado');
   result.payments[method]=(result.payments[method]||0)+1;result.shipping[shipping]=(result.shipping[shipping]||0)+1;
   for(const [field,total,count] of [['sale_fee','fees','feeOrders'],['discount','discounts','discountOrders']]){
    if(row[field]!==null&&row[field]!==undefined&&row[field]!==''){
     const value=M.money(row[field]);if(value<0)throw new Error('Valor financeiro negativo na origem. Revise a integração.');
     result[total]+=value;if(value>0)result[count]++;
    }
   }
  }
  return result;
 }
 const api={details};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CacifeChannel=api;
})(typeof window!=='undefined'?window:globalThis);
