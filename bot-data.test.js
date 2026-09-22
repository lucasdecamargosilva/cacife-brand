'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { shopeeSummary, mlSummary, nsSummary, overview } = require('./bot-data');
const { resolvePeriod } = require('./bot-period');
const NOW = new Date('2026-09-21T18:00:00.000Z');

test('shopeeSummary: bruto (total) e líquido (escrow) em centavos, conta pedidos pagos', async () => {
  const rest = async (q) => {
    assert.ok(q.startsWith('shopee_orders'));
    assert.ok(q.includes('payment_status=eq.paid'));
    assert.ok(q.includes('created_at=gte.'));
    return [
      { total: 150.00, escrow_amount: 130.00 },
      { total: 50.00, escrow_amount: 42.00 },
    ];
  };
  const r = await shopeeSummary(rest, resolvePeriod('hoje', NOW));
  assert.strictEqual(r.revenue, 20000);
  assert.strictEqual(r.net, 17200);
  assert.strictEqual(r.orders, 2);
});

test('mlSummary: revenue em centavos, net = revenue - taxas (sale_fee)', async () => {
  const fetchOrders = async () => ([
    { id: 1, status: 'paid', currency_id: 'BRL', total_amount: 100, date_created: '2026-09-21T12:00:00Z', order_items: [{ quantity: 1, unit_price: 100, sale_fee: 10 }] },
    { id: 2, status: 'cancelled', currency_id: 'BRL', total_amount: 999, order_items: [] },
  ]);
  const r = await mlSummary(fetchOrders, resolvePeriod('hoje', NOW));
  assert.strictEqual(r.revenue, 10000);
  assert.strictEqual(r.net, 9000);
  assert.strictEqual(r.orders, 1);
});

test('nsSummary: net = revenue (sem comissão de marketplace)', async () => {
  const fetchOrders = async () => ([
    { id: 1, total: '100.00', paid_at: '2026-09-21T12:00:00Z', status: 'paid' },
    { id: 2, total: '50.00', paid_at: null, status: 'pending' },
  ]);
  const r = await nsSummary(fetchOrders, resolvePeriod('hoje', NOW));
  assert.strictEqual(r.revenue, 10000);
  assert.strictEqual(r.net, 10000);
  assert.strictEqual(r.orders, 1);
});

test('overview agrega canais e soma total; canal que falha não derruba', async () => {
  const deps = {
    shopeeRest: async () => ([{ total: 100.00, escrow_amount: 80.00 }]),
    mlFetch: async () => { throw new Error('ml caiu'); },
    nsFetch: async () => ([]),
  };
  const r = await overview(deps, resolvePeriod('hoje', NOW));
  assert.strictEqual(r.channels.shopee.revenue, 10000);
  assert.strictEqual(r.channels.mercadolivre.error, true);
  assert.strictEqual(r.channels.nuvemshop.revenue, 0);
  assert.strictEqual(r.total.revenue, 10000);
  assert.strictEqual(r.total.net, 8000);
});
