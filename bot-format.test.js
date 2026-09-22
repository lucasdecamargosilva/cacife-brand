'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { brl, fmtChannel, fmtOverview, toWhatsApp } = require('./bot-format');

test('toWhatsApp converte markdown para formato do WhatsApp', () => {
  assert.strictEqual(toWhatsApp('**Total:** R$ 10,00'), '*Total:* R$ 10,00');
  assert.strictEqual(toWhatsApp('# Título\n- item'), '*Título*\n• item');
  assert.strictEqual(toWhatsApp('a\n\n\n\nb'), 'a\n\nb');
});

test('brl formata centavos no padrão BR', () => {
  assert.strictEqual(brl(82358401), 'R$ 823.584,01');
  assert.strictEqual(brl(114754818), 'R$ 1.147.548,18');
  assert.strictEqual(brl(0), 'R$ 0,00');
  assert.strictEqual(brl(1500), 'R$ 15,00');
});

test('fmtChannel devolve strings prontas ou aviso de erro', () => {
  assert.deepStrictEqual(fmtChannel({ revenue: 20000, net: 18000, orders: 3 }), { faturamento: 'R$ 200,00', liquido: 'R$ 180,00', pedidos: 3 });
  assert.strictEqual(fmtChannel({ error: true }).erro, true);
});

test('fmtOverview monta canais + total formatados', () => {
  const ov = { period: { label: 'hoje' }, channels: { shopee: { revenue: 10000, net: 8000, orders: 1 }, mercadolivre: { error: true }, nuvemshop: { revenue: 5000, net: 5000, orders: 1 } }, total: { revenue: 15000, net: 13000, orders: 2 } };
  const f = fmtOverview(ov);
  assert.strictEqual(f.periodo, 'hoje');
  assert.strictEqual(f.canais.shopee.faturamento, 'R$ 100,00');
  assert.strictEqual(f.canais.mercadolivre.erro, true);
  assert.strictEqual(f.total.faturamento, 'R$ 150,00');
});
