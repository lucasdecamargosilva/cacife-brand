'use strict';
const { Shopee, DAY } = require('./shopee');
async function simulate() {
  const now = Math.floor(Date.now() / 1000), calls = [];
  const store = { data: { tokens: { 999: { access_token: 'SIMULATED', refresh_token: 'SIMULATED_REFRESH', expires_at: now - 1, refresh_expires_at: now + DAY } }, orders: {}, sync: {} }, save() {} };
  const fixture = [
    { order_sn: 'SIMULADO-001', order_status: 'COMPLETED', total_amount: 199.9, pay_time: now - 1000 },
    { order_sn: 'SIMULADO-002', order_status: 'READY_TO_SHIP', total_amount: 89.5, pay_time: now - 1000 },
    { order_sn: 'SIMULADO-003', order_status: 'CANCELLED', total_amount: 120, pay_time: now - 1000 },
    { order_sn: 'SIMULADO-004', order_status: 'UNPAID', pay_time: null }
  ].map(o => ({ ...o, currency: 'BRL', create_time: now - 2000, update_time: now - 500 }));
  const client = new Shopee({ partnerId: 123, partnerKey: 'SIMULATION_ONLY', store, now: () => now, fetchImpl: async url => {
    calls.push(url.pathname);
    let data;
    if (url.pathname === '/api/v2/auth/access_token/get') data = { access_token: 'SIMULATED_NEW', refresh_token: 'SIMULATED_ROTATED', expire_in: 14400, shop_id: 999 };
    else if (url.pathname === '/api/v2/order/get_order_list') data = { response: { order_list: fixture.slice(url.searchParams.get('cursor') ? 2 : 0, url.searchParams.get('cursor') ? 4 : 2).map(o => ({ order_sn: o.order_sn })), more: !url.searchParams.get('cursor'), next_cursor: 'page-2' } };
    else if (url.pathname === '/api/v2/order/get_order_detail') data = { response: { order_list: fixture.filter(o => url.searchParams.get('order_sn_list').split(',').includes(o.order_sn)) } };
    else throw new Error('Unexpected simulation API');
    return { ok: true, json: async () => data };
  } });
  await client.sync(999, now - DAY, now);
  await client.sync(999, now - DAY, now);
  const orders = Object.values(store.data.orders), paid = orders.filter(o => o.payment_status === 'paid');
  return { simulated: true, environment: 'simulation', orders, paid: paid.length, revenue: paid.reduce((sum, o) => sum + Math.round(o.total * 100), 0) / 100,
    checks: { tokenRenewed: calls.filter(p => p.includes('access_token')).length === 1, pagination: calls.filter(p => p.includes('get_order_list')).length === 4, idempotent: orders.length === 4, cancelledExcluded: paid.every(o => o.status !== 'CANCELLED') } };
}
module.exports = { simulate };
