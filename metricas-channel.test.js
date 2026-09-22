const test=require('node:test'),assert=require('node:assert/strict');
const {details}=require('./metricas-channel');
const row=(id,extra={})=>({id_pedido:id,channel:'mercadolivre',total:100,payment_status:'paid',status:'open',created_at:'2026-09-01T12:00:00Z',payment_method:'pix',shipping_status:'shipped',sale_fee:10,...extra});
test('channel breakdown reconciles orders and excludes refunds from fees and payment groups',()=>{
 const result=details([row(1),row(2,{payment_status:'reembolsado'}),row(3,{payment_status:'recusado'}),row(4,{payment_status:'pending'}),row(5,{channel:'nuvemshop'})],'mercadolivre');
 assert.equal(result.orders,4);assert.equal(result.revenue,10000);assert.equal(result.fees,1000);assert.equal(result.refunded,1);assert.equal(result.other,1);assert.deepEqual(result.payments,{pix:1});assert.equal(Object.values(result.states).reduce((a,b)=>a+b,0),4);
});
test('discounts are reported separately and never subtracted twice from revenue',()=>{
 const result=details([row(1,{channel:'nuvemshop',total:80,discount:20,sale_fee:null})],'nuvemshop');
 assert.equal(result.revenue,8000);assert.equal(result.discounts,2000);assert.equal(result.discountOrders,1);assert.equal(result.fees,0);
});
