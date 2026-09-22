'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { shopeeSummary, channelSummary, overview } = require('./bot-data');
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

test('channelSummary ML: net = revenue - fees; SQL filtra canal e período', async () => {
  const pgQuery = async (sql) => {
    assert.ok(sql.includes("channel = 'mercadolivre'"));
    assert.ok(sql.includes("payment_status = 'paid'"));
    assert.ok(sql.includes(resolvePeriod('30d', NOW).startISO));
    return [{ orders: 3, revenue: 30000, fees: 3000 }];
  };
  const r = await channelSummary(pgQuery, resolvePeriod('30d', NOW), 'mercadolivre');
  assert.strictEqual(r.revenue, 30000);
  assert.strictEqual(r.net, 27000);
  assert.strictEqual(r.orders, 3);
});

test('channelSummary NS: net = revenue (sem comissão), aceita Confirmado+paid', async () => {
  const pgQuery = async (sql) => {
    assert.ok(sql.includes("payment_status in ('paid','Confirmado')"));
    return [{ orders: 5, revenue: 50000, fees: 0 }];
  };
  const r = await channelSummary(pgQuery, resolvePeriod('30d', NOW), 'nuvemshop');
  assert.strictEqual(r.revenue, 50000);
  assert.strictEqual(r.net, 50000);
  assert.strictEqual(r.orders, 5);
});

test('overview agrega canais e soma total; canal que falha não derruba', async () => {
  const deps = {
    shopeeRest: async () => ([{ total: 100.00, escrow_amount: 80.00 }]),
    pgQuery: async (sql) => {
      if (sql.includes("'mercadolivre'")) throw new Error('ml caiu');
      return [{ orders: 2, revenue: 20000, fees: 0 }]; // nuvemshop
    },
  };
  const r = await overview(deps, resolvePeriod('hoje', NOW));
  assert.strictEqual(r.channels.shopee.revenue, 10000);
  assert.strictEqual(r.channels.mercadolivre.error, true);
  assert.strictEqual(r.channels.nuvemshop.revenue, 20000);
  assert.strictEqual(r.total.revenue, 30000);
  assert.strictEqual(r.total.net, 28000);
});
