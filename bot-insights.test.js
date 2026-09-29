'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { crossChannel, modeloCandidato, periodoAnterior } = require('./bot-insights');

test('modeloCandidato pula descrição e pega o nome do modelo', () => {
  assert.strictEqual(modeloCandidato('Óculos de Sol Madrid Preto Fosco'), 'madrid');
  assert.strictEqual(modeloCandidato('Óculos Esportivo Race Branco e Rose Espelhado'), 'race');
  assert.strictEqual(modeloCandidato('Oculos De Sol Old Money Miami Azul Claro'), 'miami');
  assert.strictEqual(modeloCandidato('Óculos De Sol Quadrado Preto Fosco Unissex Proteção Uv400'), null);
});

test('periodoAnterior tem o mesmo tamanho e termina onde o atual começa', () => {
  const p = periodoAnterior({ startISO: '2026-09-01T03:00:00.000Z', endExclusiveISO: '2026-09-11T03:00:00.000Z' });
  assert.strictEqual(p.startISO, '2026-08-22T03:00:00.000Z');
  assert.strictEqual(p.endExclusiveISO, '2026-09-01T03:00:00.000Z');
});

function fakeDeps() {
  const prod = (produto, pedidos, valor) => ({ produto, pedidos, unidades: pedidos, valor });
  return {
    tiktokShop: '7496183196441545497',
    shopeeRest: async () => [{ total: 100, escrow_amount: 80 }],
    pgQuery: async (sql) => {
      if (sql.includes('shopee_returns')) return [{ canal: 'shopee', n: 1, valor: 10 }, { canal: 'tiktokshop', n: 2, valor: 20 }];
      if (sql.includes('shopee_order_items')) return [prod('Óculos de Sol Madrid Quadrado Premium', 40, 4000)];
      if (sql.includes('tiktok_order_items')) return [prod('Óculos De Sol Soldador Quadrado Premium', 60, 3000), prod('Óculos de Sol Madrid Preto', 1, 50)];
      if (sql.includes('from tiktok_orders')) return [{ orders: 2, revenue: 20000, net: 10000 }];
      if (sql.includes('with linhas') && sql.includes("'nuvemshop'")) return [prod('Óculos de Sol Madrid Preto Fosco', 50, 5000)];
      if (sql.includes('with linhas')) return [prod('Óculos De Sol Steampunk Alok Premium', 10, 800), prod('Óculos Madrid Premium', 5, 300)];
      if (sql.includes('from cacife_orders')) return [{ orders: 1, revenue: 5000, fees: 500 }];
      throw new Error('sql inesperado');
    },
  };
}

test('crossChannel cruza modelos entre canais e aponta oportunidades', async () => {
  const per = { start: '2026-09-01', end: '2026-09-10', label: 'teste', startISO: '2026-09-01T03:00:00.000Z', endExclusiveISO: '2026-09-11T03:00:00.000Z' };
  const r = await crossChannel(fakeDeps(), per);
  assert.strictEqual(r.canais.length, 4);
  const shopee = r.canais.find((c) => c.canal === 'Shopee');
  assert.strictEqual(shopee.taxa_devolucao, '100,0%');
  assert.strictEqual(shopee.sobra_do_faturamento, '80,0%');
  const madrid = r.modelos_mais_vendidos.find((m) => m.modelo === 'Madrid');
  assert.strictEqual(madrid.pedidos_total, 96);
  assert.strictEqual(madrid.por_canal.Nuvemshop.pedidos, 50);
  // "Alok" no Mercado Livre é o mesmo modelo "Soldador" do TikTok
  const sold = r.modelos_mais_vendidos.find((m) => m.modelo === 'Soldador');
  assert.strictEqual(sold.por_canal['Mercado Livre'].pedidos, 10);
  assert.ok(r.oportunidades_entre_canais.some((o) => o.startsWith('Soldador: 60 pedidos na TikTok Shop') && o.includes('0 na Nuvemshop')));
  assert.ok(r.oportunidades_entre_canais.some((o) => o.startsWith('Madrid: 50 pedidos na Nuvemshop') && o.includes('1 na TikTok Shop')));
});
