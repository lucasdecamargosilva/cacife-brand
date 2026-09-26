'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createHmac } = require('node:crypto');
const { TikTokProd, normalizeOrder, itemsOf, normalizeReturn, webhookSignature } = require('./tiktok-prod');

const ORDER = {
  id: '5771', status: 'COMPLETED', create_time: 1790000000, update_time: 1790003600, paid_time: 1790000100,
  payment: { currency: 'BRL', total_amount: '129.90' }, payment_method_name: 'Pix', delivery_option_name: 'Padrão',
  recipient_address: { region_code: 'BR' },
  line_items: [
    { id: 'li1', product_id: 'p1', product_name: 'Óculos Madrid', sku_id: 's1', sku_name: 'Preto', sale_price: '64.95', sku_image: 'http://img/1.jpg' },
    { id: 'li2', product_id: 'p1', product_name: 'Óculos Madrid', sku_id: 's1', sku_name: 'Preto', sale_price: '64.95', sku_image: 'http://img/1.jpg' },
  ],
};

test('normalizeOrder: pago, total em reais, datas ISO, sem dados do comprador', () => {
  const r = normalizeOrder(ORDER, '999');
  assert.strictEqual(r.id_pedido, '5771');
  assert.strictEqual(r.payment_status, 'paid');
  assert.strictEqual(r.total, 129.9);
  assert.strictEqual(r.created_at, '2026-09-21T14:13:20.000Z');
  assert.strictEqual(r.items_count, 2);
  assert.ok(!('recipient_address' in r));
});

test('normalizeOrder: cancelado zera total; UNPAID fica pendente', () => {
  assert.strictEqual(normalizeOrder({ ...ORDER, status: 'CANCELLED' }, '9').total, 0);
  assert.strictEqual(normalizeOrder({ ...ORDER, status: 'CANCELLED' }, '9').payment_status, 'cancelled');
  assert.strictEqual(normalizeOrder({ ...ORDER, status: 'UNPAID' }, '9').payment_status, 'pending');
});

test('itemsOf: uma linha por line_item (qty 1), preço numérico', () => {
  const items = itemsOf(ORDER, '999');
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].line_item_id, 'li1');
  assert.strictEqual(items[0].price, 64.95);
  assert.strictEqual(items[0].qty, 1);
});

test('normalizeReturn: id, status, valor e data', () => {
  const r = normalizeReturn({ return_id: 'r1', order_id: '5771', return_status: 'RETURN_OR_REFUND_REQUEST_COMPLETE', return_reason_text: 'defeito', refund_amount: { refund_total: '129.90', currency: 'BRL' }, create_time: 1790000000 }, '999');
  assert.strictEqual(r.return_id, 'r1');
  assert.strictEqual(r.refund_amount, 129.9);
  assert.strictEqual(r.created_at, '2026-09-21T14:13:20.000Z');
});

test('webhook: assinatura = HMAC-SHA256(app_secret, app_key + corpo cru)', () => {
  const body = '{"type":1,"shop_id":"999"}';
  const exp = createHmac('sha256', 'SEC').update('KEY' + body).digest('hex');
  assert.strictEqual(webhookSignature('KEY', 'SEC', body), exp);
  const t = new TikTokProd({ appKey: 'KEY', appSecret: 'SEC', serviceId: '1', db: {} });
  assert.strictEqual(t.verifyWebhook(body, exp), true);
  assert.strictEqual(t.verifyWebhook(body, exp.replace(/.$/, exp.endsWith('0') ? '1' : '0')), false);
  assert.strictEqual(t.verifyWebhook(body, ''), false);
});

test('handleWebhook: ORDER_STATUS_CHANGE rebusca o pedido e grava; duplicado é ignorado', async () => {
  const saved = { orders: [], items: [], logs: [] }; const seen = new Set();
  const db = {
    async seenWebhook(id) { return seen.has(id); },
    async logWebhook(row) { seen.add(row.notification_id); saved.logs.push(row); },
    async upsertOrders(rows) { saved.orders.push(...rows); }, async upsertItems(rows) { saved.items.push(...rows); },
    async getToken() { return { cipher: 'C', access_token: 'AT', expires_at: new Date(Date.now() + 3600000).toISOString() }; },
  };
  const fetchImpl = async () => ({ json: async () => ({ code: 0, data: { orders: [ORDER] } }) });
  const t = new TikTokProd({ appKey: 'KEY', appSecret: 'SEC', serviceId: '1', db, fetchImpl });
  const payload = { type: 1, tts_notification_id: 'n1', shop_id: '999', timestamp: 1790000000, data: { order_id: '5771', order_status: 'COMPLETED', update_time: 1790003600 } };
  const r1 = await t.handleWebhook(payload);
  assert.strictEqual(r1.updated, '5771');
  assert.strictEqual(saved.orders[0].status, 'COMPLETED');
  assert.strictEqual(saved.items.length, 2);
  const r2 = await t.handleWebhook(payload);
  assert.strictEqual(r2.duplicate, true);
});

test('sync: pagina pedidos por update_time, grava pedidos+itens, devoluções e repasse', async () => {
  const calls = []; const saved = { orders: [], items: [], returns: [] };
  const db = {
    async getToken() { return { cipher: 'C', access_token: 'AT', expires_at: new Date(Date.now() + 3600000).toISOString() }; },
    async upsertOrders(rows) { saved.orders.push(...rows); }, async upsertItems(rows) { saved.items.push(...rows); }, async upsertReturns(rows) { saved.returns.push(...rows); },
    async pendingSettlement() { return [{ id_pedido: '5771' }]; },
  };
  const fetchImpl = async (url) => {
    const u = new URL(url); calls.push(u.pathname);
    if (u.pathname.endsWith('/orders/search')) return { json: async () => ({ code: 0, data: { orders: [ORDER], next_page_token: '' } }) };
    if (u.pathname.includes('/statement_transactions')) return { json: async () => ({ code: 0, data: { statement_transactions: [{ settlement_amount: '110.50', fee_amount: '19.40' }] } }) };
    if (u.pathname.endsWith('/returns/search')) return { json: async () => ({ code: 0, data: { return_orders: [{ return_id: 'r1', order_id: '5771', return_status: 'X', refund_amount: { refund_total: '10.00' }, create_time: 1790000000 }] } }) };
    return { json: async () => ({ code: 0, data: {} }) };
  };
  const t = new TikTokProd({ appKey: 'KEY', appSecret: 'SEC', serviceId: '1', db, fetchImpl, now: () => 1790010000 });
  const r = await t.sync('999', 1790000000 - 86400, 1790010000, 'update_time');
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.withSettlement, 1);
  assert.strictEqual(r.returns, 1);
  assert.ok(saved.orders.some((o) => o.settlement_amount === 110.5 && o.fee_amount === 19.4));
  assert.ok(calls.some((p) => p.endsWith('/orders/search')));
});
