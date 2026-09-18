'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { ShopeeProd, HOSTS, normalize, itemsOf, incomeOf } = require('./shopee-prod');

function memoryDb() {
  const tokens = {}, orders = {};
  return {
    _tokens: tokens, _orders: orders,
    async getToken(shopId) { return tokens[shopId] || null; },
    async listTokens() { return Object.values(tokens); },
    async saveToken(row) { tokens[row.shop_id] = row; },
    async upsertOrders(rows) { for (const r of rows) orders[`${r.shop_id}:${r.id_pedido}`] = r; },
    async listOrders() { return Object.values(orders); },
  };
}

test('normalize captura forma de pagamento, frete, regiao e status', () => {
  const o = { order_sn: 'A1', create_time: 100, update_time: 200, pay_time: 150, currency: 'BRL', total_amount: 78.99,
    order_status: 'COMPLETED', payment_method: 'Credit Card', shipping_carrier: 'Full', actual_shipping_fee: 12.04, region: 'BR', buyer_username: 'PRIVADO' };
  const r = normalize(o, 9);
  assert.equal(r.payment_status, 'paid');
  assert.equal(r.payment_method, 'Credit Card');
  assert.equal(r.shipping_carrier, 'Full');
  assert.equal(r.shipping_fee, 12.04);
  assert.equal(r.region, 'BR');
  assert.equal(r.buyer_username, undefined); // não guarda dado do comprador
  const cancel = normalize({ ...o, order_status: 'CANCELLED', cancel_reason: 'out_of_stock' }, 9);
  assert.equal(cancel.payment_status, 'cancelled');
  assert.equal(cancel.total, 0);
  assert.equal(cancel.cancel_reason, 'out_of_stock');
});

test('itemsOf extrai itens do pedido (ranking de produtos)', () => {
  const o = { order_sn: 'A1', item_list: [
    { order_item_id: 11, item_id: 500, item_name: 'Óculos X', model_sku: 'SKU1', model_quantity_purchased: 2, model_discounted_price: 75.19 },
    { line_item_id: 12, item_name: 'Sem sku', model_quantity_purchased: 1, model_discounted_price: 10 },
  ] };
  const items = itemsOf(o, 9);
  assert.equal(items.length, 2);
  assert.deepEqual({ ...items[0] }, { shop_id: 9, id_pedido: 'A1', order_item_id: 11, item_id: 500, item_name: 'Óculos X', model_sku: 'SKU1', qty: 2, price: 75.19 });
  assert.equal(items[1].order_item_id, 12); // usa line_item_id como fallback
});

test('incomeOf mapeia repasse e taxas', () => {
  const inc = incomeOf('A1', 9, { buyer_total_amount: 67.67, escrow_amount: 55.75, commission_fee: 12.86, service_fee: 1.43, seller_transaction_fee: 0, voucher_from_seller: 7.52, voucher_from_shopee: 0 });
  assert.equal(inc.escrow_amount, 55.75);
  assert.equal(inc.commission_fee, 12.86);
  assert.equal(inc.seller_voucher, 7.52);
  assert.equal(inc.income_synced, true);
});

test('authUrl aponta pro host BR e assina partner_id+path+timestamp', () => {
  const c = new ShopeeProd({ partnerId: 2045365, partnerKey: 'secret', db: memoryDb(), now: () => 1700 });
  const u = new URL(c.authUrl('https://cacife.quanticsolutions.com.br/shopee/callback'));
  assert.equal(u.origin, HOSTS.br);
  assert.equal(u.pathname, '/api/v2/shop/auth_partner');
  assert.equal(u.searchParams.get('partner_id'), '2045365');
  assert.equal(u.searchParams.get('redirect'), 'https://cacife.quanticsolutions.com.br/shopee/callback');
  assert.equal(u.searchParams.get('sign'), createHmac('sha256', 'secret').update('2045365/api/v2/shop/auth_partner1700').digest('hex'));
});

test('exchange grava token no Supabase com validade', async () => {
  const db = memoryDb();
  const c = new ShopeeProd({ partnerId: 123, partnerKey: 'k', db, now: () => 1000, fetchImpl: async () => ({ ok: true, json: async () => ({ access_token: 'acc', refresh_token: 'ref', expire_in: 14400 }) }) });
  await c.exchange('code-abc', 999);
  assert.equal(db._tokens[999].access_token, 'acc');
  assert.equal(db._tokens[999].refresh_token, 'ref');
  assert.equal(db._tokens[999].expires_at, new Date((1000 + 14400) * 1000).toISOString());
});

test('access renova quando o token está por expirar', async () => {
  const db = memoryDb();
  db._tokens[1] = { shop_id: 1, access_token: 'old', refresh_token: 'r', expires_at: new Date(0).toISOString(), refresh_expires_at: new Date(9e12).toISOString() };
  let calls = 0;
  const c = new ShopeeProd({ partnerId: 123, partnerKey: 'k', db, now: () => 1000, fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ access_token: 'new', refresh_token: 'rot', expire_in: 14400 }) }; } });
  assert.deepEqual(await Promise.all([c.access(1), c.access(1)]), ['new', 'new']);
  assert.equal(calls, 1); // refresh serializado: uma chamada só
  assert.equal(db._tokens[1].refresh_token, 'rot');
});
