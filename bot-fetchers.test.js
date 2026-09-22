'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMlFetch, makeNsFetch } = require('./bot-fetchers');

test('makeMlFetch monta a URL de orders/search com seller e datas e devolve results', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, json: async () => ({ results: [{ id: 1 }], paging: { total: 1 } }) };
  };
  const ml = makeMlFetch({ getMlToken: async () => 'AT', mlUserId: '123', fetchImpl });
  const orders = await ml('2026-09-01', '2026-09-21');
  assert.ok(seen[0].url.includes('/orders/search'));
  assert.ok(seen[0].url.includes('seller=123'));
  assert.ok(seen[0].url.includes('order.date_created.from='));
  assert.strictEqual(seen[0].init.headers.Authorization, 'Bearer AT');
  assert.strictEqual(orders.length, 1);
});

test('makeNsFetch usa a loja e o header de auth da Nuvemshop', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, status: 200, headers: new Headers(), json: async () => [{ id: 1 }] };
  };
  const ns = makeNsFetch({ token: 'NT', storeId: '1081093', fetchImpl });
  const orders = await ns('2026-09-01', '2026-09-21');
  assert.ok(seen[0].url.includes('/1081093/orders'));
  assert.strictEqual(seen[0].init.headers.Authentication, 'bearer NT');
  assert.strictEqual(orders.length, 1);
});
