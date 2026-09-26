const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('./metricas-core');
const row = (id, overrides = {}) => ({ id_pedido: id, channel: 'nuvemshop', total: '125.50', payment_status: 'paid', status: 'open', created_at: '2026-09-15T12:00:00Z', ...overrides });
test('paid revenue excludes refunded and cancelled orders and keeps pending separate', () => {
    const s = M.summarize([row(1), row(2, { status: 'cancelled' }), row(3, { payment_status: 'reembolsado' }), row(4, { payment_status: 'pending' })]);
    assert.equal(s.revenue, 12550); assert.equal(s.orders, 4); assert.equal(s.paid, 1); assert.equal(s.cancelled, 2); assert.equal(s.pending, 1);
});
test('order identities include channel, and legacy null channel is Nuvemshop', () => {
    const rows = [row(1, { channel: null }), row(1, { channel: 'mercadolivre', total: 200 })];
    assert.equal(M.summarize(rows).revenue, 32550);
    assert.equal(M.summarize(rows, 'mercadolivre').orders, 1);
    assert.equal(M.summarize(rows, 'nuvemshop').revenue, 12550);
});
test('unknown and unconfigured channels are excluded from the consolidated view', () => {
    // nuvemshop, shopee e tiktokshop são configurados; canais desconhecidos ficam de fora
    assert.equal(M.summarize([row(1), row(2, { channel: 'shopee' }), row(3, { channel: 'tiktokshop' }), row(4, { channel: 'other' })]).orders, 3);
});
test('ambiguous duplicate orders and missing IDs stop aggregation', () => {
    assert.throws(() => M.summarize([row(1), row(1)]), /mais de uma linha/);
    assert.throws(() => M.summarize([row(null)]), /sem identificador/);
});
test('money parses BRL and decimals, rejects missing values', () => {
    assert.equal(M.money('R$ 1.234,56'), 123456);
    assert.equal(M.money('1234.56'), 123456);
    assert.equal(M.money(0), 0);
    assert.throws(() => M.money(null), /inválido/);
});
test('half-open date range includes complete local days and an equal preceding period', () => {
    assert.deepEqual(M.range('2026-09-01', '2026-09-15'), { start: '2026-09-01T00:00:00-03:00', end: '2026-09-16T00:00:00-03:00', previous: '2026-08-17T00:00:00-03:00' });
    assert.equal(M.day('2026-09-15T02:59:59Z'), '2026-09-14');
    assert.throws(() => M.range('2026-09-15', '2026-09-01'));
});
