'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { shopeeSummary, channelSummary, overview, topProducts, productSales, productSql } = require('./bot-data');

test('topProducts devolve valor formatado, nome curto e completo', async () => {
  const pgQuery = async () => ([{ produto: 'Óculos de Sol Madrid Quadrado Premium Clássico Vintage Retrô', unidades: 640, pedidos: 636, valor: '40410.31' }]);
  const r = await topProducts({ pgQuery }, resolvePeriod('6m', NOW), 'shopee', 1);
  assert.strictEqual(r[0].valor, 'R$ 40.410,31');
  assert.strictEqual(r[0].valor_tipo, 'exato');
  assert.ok(r[0].produto.endsWith('…'));
  assert.ok(r[0].produto_completo.startsWith('Óculos de Sol Madrid Quadrado Premium Clássico'));
});

test('ML/NS marcam valor aproximado quando há pedido com vários itens', async () => {
  const pgQuery = async () => ([{ produto: 'A', unidades: 3, pedidos: 3, valor: '100.00', aproximado: true }]);
  const r = await topProducts({ pgQuery }, resolvePeriod('30d', NOW), 'nuvemshop', 1);
  assert.ok(r[0].valor_tipo.startsWith('aproximado'));
});

test('productSales filtra por trecho do nome (ILIKE) e escapa aspas', async () => {
  let seen = '';
  const pgQuery = async (sql) => { seen = sql; return []; };
  await productSales({ pgQuery }, resolvePeriod('30d', NOW), 'shopee', "Óculos madrid' or 1=1 --");
  // sem acento, por palavra, e aspas escapadas
  assert.ok(seen.includes("like '%oculos%'"), 'sem acento: ' + seen);
  assert.ok(seen.includes("like '%madrid''%'"), 'aspa escapada: ' + seen);
  assert.ok(seen.includes('translate(lower(item_name)'), 'normaliza a coluna: ' + seen);
  await assert.rejects(() => productSales({ pgQuery }, resolvePeriod('30d', NOW), 'shopee', 'a'), /nome do produto/);
});

test('productSql Shopee rateia pelo total pago e cai em divisão igual sem preço', () => {
  const sql = productSql(resolvePeriod('30d', NOW), 'shopee', { limit: 3 });
  assert.ok(sql.includes('total * bruto_item / bruto_pedido'));
  assert.ok(sql.includes('total / greatest(n_itens, 1)'));
  assert.ok(sql.includes("payment_status = 'paid'"));
});
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

test('channelSummary rejeita datas fora do formato ISO (anti-injeção)', async () => {
  const pgQuery = async () => { throw new Error('não deveria consultar'); };
  const periodMalicioso = { start: "x", end: "y", startISO: "2026-01-01' OR '1'='1", endExclusiveISO: '2026-02-01T03:00:00.000Z', label: 'x' };
  await assert.rejects(() => channelSummary(pgQuery, periodMalicioso, 'mercadolivre'), /período inválido/);
});

test('resolvePeriod ignora datas customizadas malformadas (cai em 30d)', () => {
  const p = resolvePeriod({ from: "2026-01-01' OR 1=1--", to: '2026-02-01' }, NOW);
  assert.strictEqual(p.start, '2026-08-23'); // default 30d
  assert.strictEqual(p.end, '2026-09-21');
});

test('topProducts shopee: junta itens com pedidos pagos', async () => {
  const pgQuery = async (sql) => {
    assert.ok(sql.includes('shopee_order_items'));
    assert.ok(sql.includes("payment_status = 'paid'"));
    assert.ok(sql.includes('limit 3'));
    return [{ produto: 'Óculos X', unidades: 12, pedidos: 10 }];
  };
  const r = await topProducts({ pgQuery }, resolvePeriod('30d', NOW), 'shopee', 3);
  assert.strictEqual(r[0].produto, 'Óculos X');
  assert.strictEqual(r[0].unidades, 12);
});

test('topProducts ML/NS: agrupa product_name de cacife_orders', async () => {
  const pgQuery = async (sql) => {
    assert.ok(sql.includes('cacife_orders'));
    assert.ok(sql.includes("channel = 'nuvemshop'"));
    return [{ produto: 'Camisa Y', unidades: 5, pedidos: 5 }];
  };
  const r = await topProducts({ pgQuery }, resolvePeriod('30d', NOW), 'nuvemshop', 3);
  assert.strictEqual(r[0].produto, 'Camisa Y');
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
