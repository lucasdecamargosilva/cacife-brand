'use strict';
// Conector TikTok Shop (loja real da Cacife) — app in-house do vendedor.
// Assinatura HMAC-SHA256 (app_secret + path + params ordenados + body + app_secret), token via header x-tts-access-token.
const { createHmac } = require('node:crypto');

const API = 'https://open-api.tiktokglobalshop.com';
const AUTH = 'https://auth.tiktok-shops.com';
const AUTHORIZE = 'https://services.tiktokshop.com/open/authorize';

function sign(appSecret, path, queries, body) {
  const keys = Object.keys(queries).filter((k) => k !== 'sign' && k !== 'access_token').sort();
  let s = path;
  for (const k of keys) s += k + queries[k];
  if (body) s += body;
  s = appSecret + s + appSecret;
  return createHmac('sha256', appSecret).update(s).digest('hex');
}

// Persistência (Supabase via PostgREST, service_role).
function tiktokDb({ url, serviceKey, fetchImpl = fetch }) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  async function rest(pathAndQuery, init = {}) {
    const res = await fetchImpl(`${url}/rest/v1/${pathAndQuery}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase HTTP ${res.status}: ${text.slice(0, 150)}`);
    return text ? JSON.parse(text) : null;
  }
  return {
    async saveToken(row) { await rest('tiktok_tokens?on_conflict=shop_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) }); },
    async listTokens() { return (await rest('tiktok_tokens?select=shop_id,cipher,shop_name,region,expires_at,refresh_expires_at,updated_at&order=updated_at.desc')) || []; },
    async getToken(shopId) { const r = await rest(`tiktok_tokens?shop_id=eq.${encodeURIComponent(shopId)}&select=*`); return r && r[0] ? r[0] : null; },
    async firstToken() { const r = await rest('tiktok_tokens?select=*&order=updated_at.desc&limit=1'); return r && r[0] ? r[0] : null; },
    async upsertOrders(rows) { if (rows.length) await rest('tiktok_orders?on_conflict=shop_id,id_pedido', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }); },
    async query(sql) { const r = await fetchImpl(`${url}/pg/query`, { method: 'POST', headers, body: JSON.stringify({ query: sql }) }); if (!r.ok) throw new Error(`Consulta HTTP ${r.status}`); return r.json(); },
  };
}

class TikTokProd {
  constructor({ appKey, appSecret, serviceId, db, fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) }) {
    if (!appKey || !appSecret) throw new Error('Configure TIKTOK_APP_KEY e TIKTOK_APP_SECRET.');
    if (!db) throw new Error('Persistência (Supabase) não configurada.');
    Object.assign(this, { appKey, appSecret, serviceId, db, fetchImpl, now });
    this.fallbackShopId = arguments[0].fallbackShopId || null;
    this.refreshes = new Map();
  }

  authUrl(state) {
    const u = new URL(AUTHORIZE);
    u.searchParams.set('service_id', this.serviceId);
    if (state) u.searchParams.set('state', state);
    return u.toString();
  }

  // Troca o auth_code por tokens (esse endpoint NÃO usa assinatura).
  async exchange(authCode) {
    const u = new URL('/api/v2/token/get', AUTH);
    u.searchParams.set('app_key', this.appKey);
    u.searchParams.set('app_secret', this.appSecret);
    u.searchParams.set('auth_code', authCode);
    u.searchParams.set('grant_type', 'authorized_code');
    let j; try { const r = await this.fetchImpl(u, { signal: AbortSignal.timeout(20000) }); j = await r.json(); } catch { throw new Error('Não foi possível falar com o TikTok.'); }
    if (j.code !== 0 || !j.data?.access_token) throw new Error('O TikTok recusou a autorização (code ' + j.code + ': ' + (j.message || '?') + '; request_id ' + (j.request_id || '-') + ').');
    const d = j.data;
    const now = this.now();
    let shops = [];
    try { shops = await this.getShops(d.access_token); }
    catch (e) {
      // Sem scope de Authorization o TikTok nega /shops. Guarda o token mesmo assim (shop_id de fallback) para não perder a chave.
      const fallback = this.fallbackShopId || 'pending';
      await this.db.saveToken({ shop_id: String(fallback), cipher: null, shop_name: '(scopes pendentes)', region: null,
        access_token: d.access_token, refresh_token: d.refresh_token || null,
        expires_at: new Date((now + Number(d.access_token_expire_in || 0)) * 1000).toISOString(),
        refresh_expires_at: new Date((now + Number(d.refresh_token_expire_in || 0)) * 1000).toISOString(),
        updated_at: new Date(now * 1000).toISOString() });
      throw new Error('Token salvo, mas o app está sem permissões (scopes) no Partner Center: ' + e.message);
    }
    if (!shops.length) throw new Error('Nenhuma loja autorizada retornada pelo TikTok.');
    for (const s of shops) {
      await this.db.saveToken({
        shop_id: String(s.id), cipher: s.cipher || null, shop_name: s.name || null, region: s.region || null,
        access_token: d.access_token, refresh_token: d.refresh_token || null,
        expires_at: new Date((now + Number(d.access_token_expire_in || 0)) * 1000).toISOString(),
        refresh_expires_at: new Date((now + Number(d.refresh_token_expire_in || 0)) * 1000).toISOString(),
        updated_at: new Date(now * 1000).toISOString(),
      });
    }
    return { shops: shops.map((s) => ({ id: s.id, name: s.name, hasCipher: !!s.cipher })) };
  }

  async refresh(shopId) {
    if (this.refreshes.has(shopId)) return this.refreshes.get(shopId);
    const work = (async () => {
      const tk = await this.db.getToken(shopId);
      if (!tk) throw new Error('Autorize a loja primeiro.');
      const u = new URL('/api/v2/token/get', AUTH);
      u.searchParams.set('app_key', this.appKey); u.searchParams.set('app_secret', this.appSecret);
      u.searchParams.set('refresh_token', tk.refresh_token); u.searchParams.set('grant_type', 'refresh_token');
      const r = await this.fetchImpl(u, { signal: AbortSignal.timeout(20000) }); const j = await r.json();
      if (j.code !== 0 || !j.data?.access_token) throw new Error('A autorização do TikTok expirou. Conecte a loja novamente.');
      const d = j.data, now = this.now();
      await this.db.saveToken({ shop_id: String(shopId), cipher: tk.cipher, shop_name: tk.shop_name, region: tk.region,
        access_token: d.access_token, refresh_token: d.refresh_token || tk.refresh_token,
        expires_at: new Date((now + Number(d.access_token_expire_in || 0)) * 1000).toISOString(),
        refresh_expires_at: new Date((now + Number(d.refresh_token_expire_in || 0)) * 1000).toISOString(),
        updated_at: new Date(now * 1000).toISOString() });
      return d.access_token;
    })();
    this.refreshes.set(shopId, work);
    try { return await work; } finally { this.refreshes.delete(shopId); }
  }

  async access(shopId) {
    const tk = await this.db.getToken(shopId);
    if (!tk) throw new Error('Autorize a loja primeiro.');
    const exp = Math.floor(new Date(tk.expires_at).getTime() / 1000);
    if (exp > this.now() + 300) return tk.access_token;
    return this.refresh(shopId);
  }

  // Chamada assinada à Open API.
  async request(path, { query = {}, body, accessToken } = {}) {
    const timestamp = this.now();
    const q = { app_key: this.appKey, timestamp, ...query };
    q.sign = sign(this.appSecret, path, q, body ? JSON.stringify(body) : '');
    const u = new URL(path, API);
    Object.entries(q).forEach(([k, v]) => u.searchParams.set(k, v));
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers['x-tts-access-token'] = accessToken;
    let j;
    try { const r = await this.fetchImpl(u, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) }); j = await r.json(); }
    catch { throw new Error('Não foi possível consultar o TikTok Shop.'); }
    if (j.code !== 0) throw new Error('TikTok API (' + (j.message || j.code) + ').');
    return j.data;
  }

  async getShops(accessToken) {
    const data = await this.request('/authorization/202309/shops', { accessToken });
    return (data && data.shops) || [];
  }

  async status() {
    const tokens = await this.db.listTokens();
    return { configured: true, shops: tokens };
  }
}

module.exports = { TikTokProd, tiktokDb, sign, API, AUTH, AUTHORIZE };
