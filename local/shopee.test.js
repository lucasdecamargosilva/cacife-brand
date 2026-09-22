'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { sign, normalize, Shopee, DAY } = require('./shopee');
const { simulate } = require('./simulate');
const { createApp } = require('./server');
const memory = () => ({ data: { tokens: {}, orders: {}, sync: {} }, save() {} });
test('signatures include shop scope only for shop APIs', () => {
  assert.equal(sign('key', 123, '/api/v2/order/get_order_list', 1234, 'token', 99), createHmac('sha256', 'key').update('123/api/v2/order/get_order_list1234token99').digest('hex'));
  assert.notEqual(sign('key', 123, '/api/v2/auth/token/get', 1234), sign('key', 123, '/api/v2/auth/token/get', 1234, 'token', 99));
});
test('simulation exercises refresh, pagination, repeat imports and financial exclusions', async () => {
  const result = await simulate();
  assert.deepEqual(result.checks, { tokenRenewed: true, pagination: true, idempotent: true, cancelledExcluded: true });
  assert.equal(result.orders.length, 4); assert.equal(result.paid, 2); assert.equal(result.revenue, 289.4);
});
test('financial normalization rejects missing totals and currencies, drops buyer data', () => {
  const order = { order_sn: '1', create_time: 100, update_time: 200, pay_time: 150, currency: 'BRL', total_amount: 12.35, order_status: 'COMPLETED', buyer_username: 'PRIVATE' };
  assert.equal(normalize(order, 1).total, 12.35);
  assert.equal(normalize(order, 1).buyer_username, undefined);
  assert.throws(() => normalize({ ...order, total_amount: null }, 1));
  assert.throws(() => normalize({ ...order, currency: 'USD' }, 1));
  for (const status of ['TO_RETURN', 'IN_CANCEL', 'CANCELLED']) assert.equal(normalize({ ...order, order_status: status }, 1).total, 0);
});
test('concurrent access renews a single rotating token', async () => {
  const store = memory(); let count = 0;
  store.data.tokens[1] = { expires_at: 0, refresh_expires_at: 10000, refresh_token: 'old' };
  const client = new Shopee({ partnerId: 123, partnerKey: 'test', store, now: () => 100, fetchImpl: async () => { count++; return { ok: true, json: async () => ({ access_token: 'new', refresh_token: 'rotated', expire_in: 14400 }) }; } });
  assert.deepEqual(await Promise.all([client.access(1), client.access(1)]), ['new', 'new']);
  assert.equal(count, 1); assert.equal(store.data.tokens[1].refresh_token, 'rotated');
});
test('incomplete detail response cannot commit partial order data', async () => {
  const store = memory(); store.data.tokens[1] = { access_token: 'a', expires_at: 10000000 };
  const client = new Shopee({ partnerId: 123, partnerKey: 'test', store, now: () => 2 * DAY, fetchImpl: async url => ({ ok: true, json: async () => url.pathname.includes('get_order_list') ? { response: { order_list: [{ order_sn: 'missing' }], more: false } } : { response: { order_list: [] } } }) });
  await assert.rejects(client.sync(1, 1, DAY), /incompletos/); assert.deepEqual(store.data.orders, {}); assert.deepEqual(store.data.sync, {});
});
test('repeated cursors fail closed', async () => {
  const store = memory(); store.data.tokens[1] = { access_token: 'a', expires_at: 10000000 };
  const client = new Shopee({ partnerId: 123, partnerKey: 'test', store, now: () => 2 * DAY, fetchImpl: async () => ({ ok: true, json: async () => ({ response: { order_list: [], more: true, next_cursor: 'same' } }) }) });
  await assert.rejects(client.sync(1, 1, DAY), /paginação/);
});
test('local HTTP server denies private files, foreign origins, hosts and missing CSRF', async t => {
  const port = 18879, app = createApp({ port, store: memory() });
  const server = app.listen(port, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => server.close()); const base = `http://127.0.0.1:${port}`;
  for (const file of ['/local/shopee.js', '/.env', '/server.js', '/package.json']) assert.equal((await fetch(base + file)).status, 404);
  assert.equal((await fetch(base + '/api/shopee/status')).status, 403);
  assert.equal((await fetch(base + '/api/session', { headers: { Origin: 'https://evil.example' } })).status, 403);
  const badHost = await new Promise((resolve, reject) => require('node:http').get(base + '/api/session', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject));
  assert.equal(badHost, 403);
  const session = await fetch(base + '/api/session'); const cookie = session.headers.get('set-cookie').split(';')[0]; const { csrf } = await session.json();
  const sameSession = await fetch(base + '/api/session', {headers:{Cookie:cookie}}).then(r=>r.json());
  assert.equal(sameSession.csrf, csrf);
  const result = await fetch(base + '/api/shopee/simulate', { method: 'POST', headers: { Cookie: cookie, 'X-Cacife-Local': csrf, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(result.status, 200); assert.equal((await result.json()).revenue, 289.4);
  assert.equal((await fetch(base + '/shopee/callback?state=bad&code=bad&shop_id=1')).status, 400);
});
test('authorization callback binds cookie, state and single use', async t => {
  const port = 18880, store = memory(); let exchanges = 0;
  const app = createApp({ port, store, config: { partnerId: 123, redirectReady: true }, client: { exchange: async (code, shop) => { assert.equal(code, 'test-code'); assert.equal(shop, 999); exchanges++; } } });
  const server = app.listen(port, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => server.close());
  const base = `http://127.0.0.1:${port}`, session = await fetch(base + '/api/session');
  const cookie = session.headers.get('set-cookie').split(';')[0], { csrf } = await session.json();
  const auth = await fetch(base + '/api/shopee/authorize', { method: 'POST', headers: { Cookie: cookie, 'X-Cacife-Local': csrf, 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
  const state = new URL(auth.url).searchParams.get('state');
  assert.equal(new URL(auth.url).searchParams.get('redirect_uri'), base + '/shopee/callback');
  const callback = base + `/shopee/callback?state=${state}&code=test-code&shop_id=999`;
  assert.equal((await fetch(callback, { redirect: 'manual' })).status, 400);
  assert.equal((await fetch(callback.replace(state, 'wrong'), { headers: { Cookie: cookie }, redirect: 'manual' })).status, 400);
  assert.equal((await fetch(callback, { headers: { Cookie: cookie }, redirect: 'manual' })).status, 302);
  assert.equal(exchanges, 1);
  assert.equal((await fetch(callback, { headers: { Cookie: cookie }, redirect: 'manual' })).status, 400);
});
