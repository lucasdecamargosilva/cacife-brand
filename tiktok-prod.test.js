'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createHmac } = require('node:crypto');
const { TikTokProd, sign, AUTHORIZE } = require('./tiktok-prod');

// db falso em memória, só o suficiente pro conector funcionar nos testes.
function fakeDb() {
  const store = new Map();
  return {
    saved: store,
    async saveToken(row) { store.set(String(row.shop_id), { ...(store.get(String(row.shop_id)) || {}), ...row }); },
    async listTokens() { return [...store.values()]; },
    async getToken(id) { return store.get(String(id)) || null; },
    async firstToken() { return [...store.values()][0] || null; },
    async upsertOrders() {},
    async query() { return []; },
  };
}

test('sign segue o padrão TikTok: app_secret + path + params ordenados + app_secret', () => {
  const secret = 'segredo';
  const path = '/authorization/202309/shops';
  const queries = { app_key: 'kkk', timestamp: 100, sign: 'ignora', access_token: 'ignora' };
  // esperado: monta a string manualmente (b vem antes de t na ordem alfabética das chaves).
  let s = path + 'app_key' + 'kkk' + 'timestamp' + 100;
  s = secret + s + secret;
  const esperado = createHmac('sha256', secret).update(s).digest('hex');
  assert.strictEqual(sign(secret, path, queries, ''), esperado);
});

test('sign ignora sign e access_token e inclui o body quando existe', () => {
  const secret = 'x';
  const path = '/order/202309/list';
  const body = '{"page_size":10}';
  let s = path + 'app_key' + 'k' + 'timestamp' + 1;
  s = secret + s + body + secret;
  const esperado = createHmac('sha256', secret).update(s).digest('hex');
  assert.strictEqual(sign(secret, path, { app_key: 'k', timestamp: 1, sign: 'z', access_token: 'a' }, body), esperado);
});

test('authUrl aponta pro authorize da TikTok com service_id e state', () => {
  const tk = new TikTokProd({ appKey: 'k', appSecret: 's', serviceId: '777', db: fakeDb() });
  const url = tk.authUrl('estado123');
  assert.ok(url.startsWith(AUTHORIZE));
  const u = new URL(url);
  assert.strictEqual(u.searchParams.get('service_id'), '777');
  assert.strictEqual(u.searchParams.get('state'), 'estado123');
});

test('exchange troca auth_code por token e grava a loja no banco', async () => {
  const db = fakeDb();
  const calls = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    calls.push(u.pathname);
    if (u.pathname.endsWith('/token/get')) {
      return { json: async () => ({ code: 0, data: { access_token: 'AT', refresh_token: 'RT', access_token_expire_in: 3600, refresh_token_expire_in: 7200 } }) };
    }
    // getShops
    return { json: async () => ({ code: 0, data: { shops: [{ id: '999', cipher: 'CIPHER', name: 'Cacife', region: 'BR' }] } }) };
  };
  const tk = new TikTokProd({ appKey: 'k', appSecret: 's', serviceId: '777', db, fetchImpl, now: () => 1000 });
  const r = await tk.exchange('AUTHCODE');
  assert.strictEqual(r.shops.length, 1);
  assert.strictEqual(r.shops[0].id, '999');
  const saved = await db.getToken('999');
  assert.strictEqual(saved.access_token, 'AT');
  assert.strictEqual(saved.cipher, 'CIPHER');
  assert.ok(calls.some((p) => p.endsWith('/token/get')));
});

test('access renova quando o token está por expirar', async () => {
  const db = fakeDb();
  await db.saveToken({ shop_id: '999', cipher: 'C', access_token: 'VELHO', refresh_token: 'RT', expires_at: new Date(1000 * 1000).toISOString() });
  const fetchImpl = async (url) => {
    if (new URL(url).pathname.endsWith('/token/get')) return { json: async () => ({ code: 0, data: { access_token: 'NOVO', refresh_token: 'RT2', access_token_expire_in: 3600, refresh_token_expire_in: 7200 } }) };
    return { json: async () => ({ code: 0, data: {} }) };
  };
  const tk = new TikTokProd({ appKey: 'k', appSecret: 's', serviceId: '777', db, fetchImpl, now: () => 2000 });
  const at = await tk.access('999');
  assert.strictEqual(at, 'NOVO');
});
