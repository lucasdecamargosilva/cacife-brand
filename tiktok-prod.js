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
    async upsertItems(rows) { if (rows.length) await rest('tiktok_order_items?on_conflict=shop_id,id_pedido,line_item_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }); },
    async upsertReturns(rows) { if (rows.length) await rest('tiktok_returns?on_conflict=shop_id,return_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }); },
    async seenWebhook(id) { const r = await rest('tiktok_webhook_events?notification_id=eq.' + encodeURIComponent(id) + '&select=notification_id'); return Boolean(r && r.length); },
    async logWebhook(row) { await rest('tiktok_webhook_events?on_conflict=notification_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(row) }); },
    async pendingSettlement(shopId, limit = 40) { return (await rest('tiktok_orders?shop_id=eq.' + encodeURIComponent(shopId) + '&payment_status=eq.paid&settlement_synced=eq.false&select=id_pedido&order=created_at.desc&limit=' + limit)) || []; },
    async query(sql) { const r = await fetchImpl(`${url}/pg/query`, { method: 'POST', headers, body: JSON.stringify({ query: sql }) }); if (!r.ok) throw new Error(`Consulta HTTP ${r.status}`); return r.json(); },
  };
}

const money = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
const tsIso = (sec) => (Number(sec) > 0 ? new Date(Number(sec) * 1000).toISOString() : null);
const DAY = 86400;
// Estados do pedido no TikTok Shop: UNPAID, ON_HOLD, AWAITING_SHIPMENT, AWAITING_COLLECTION, PARTIALLY_SHIPPING, IN_TRANSIT, DELIVERED, COMPLETED, CANCELLED
function normalizeOrder(o, shopId) {
  if (!o || !o.id) throw new Error('Pedido sem identificador.');
  const status = String(o.status || '?');
  const cancelled = status === 'CANCELLED';
  const paid = !cancelled && status !== 'UNPAID' && status !== 'ON_HOLD';
  const pay = o.payment || {};
  return {
    shop_id: String(shopId), id_pedido: String(o.id), status, raw_status: status,
    payment_status: cancelled ? 'cancelled' : paid ? 'paid' : 'pending',
    total: paid ? (money(pay.total_amount) ?? 0) : 0, currency: pay.currency || 'BRL',
    payment_method: o.payment_method_name || null, delivery_option: o.delivery_option_name || o.shipping_type || null,
    cancel_reason: o.cancel_reason || null,
    region: (o.recipient_address && (o.recipient_address.region_code || (o.recipient_address.district_info && o.recipient_address.district_info[0] && o.recipient_address.district_info[0].address_name))) || null,
    items_count: Array.isArray(o.line_items) ? o.line_items.length : null,
    created_at: tsIso(o.create_time), updated_at: tsIso(o.update_time) || tsIso(o.create_time), paid_at: tsIso(o.paid_time),
  };
}
function itemsOf(o, shopId) {
  const out = new Map();
  for (const it of (o.line_items || [])) {
    if (!it || !it.id) continue;
    out.set(String(it.id), {
      shop_id: String(shopId), id_pedido: String(o.id), line_item_id: String(it.id),
      product_id: it.product_id ? String(it.product_id) : null, product_name: it.product_name || null,
      sku_id: it.sku_id ? String(it.sku_id) : null, sku_name: it.sku_name || null, qty: 1,
      price: money(it.sale_price), image_url: it.sku_image || null,
    });
  }
  return [...out.values()];
}
function normalizeReturn(r, shopId) {
  const amt = r.refund_amount || {};
  const total = amt.refund_total != null ? amt.refund_total : (amt.total != null ? amt.total : r.refund_total);
  return {
    shop_id: String(shopId), return_id: String(r.return_id || r.id), order_id: r.order_id ? String(r.order_id) : null,
    status: r.return_status || r.status || null, reason: r.return_reason_text || r.return_reason || null,
    refund_amount: money(total), currency: amt.currency || 'BRL',
    created_at: tsIso(r.create_time),
  };
}
// Assinatura do webhook: HMAC-SHA256(app_secret, app_key + corpo cru), hex minúsculo, no header Authorization.
function webhookSignature(appKey, appSecret, rawBody) { return createHmac('sha256', appSecret).update(appKey + rawBody).digest('hex'); }

class TikTokProd {
  constructor({ appKey, appSecret, serviceId, db, fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) }) {
    if (!appKey || !appSecret) throw new Error('Configure TIKTOK_APP_KEY e TIKTOK_APP_SECRET.');
    if (!db) throw new Error('Persistência (Supabase) não configurada.');
    Object.assign(this, { appKey, appSecret, serviceId, db, fetchImpl, now });
    this.fallbackShopId = arguments[0].fallbackShopId || null;
    this.allowedShopIds = arguments[0].allowedShopIds || [];
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
      // Sem scope de Authorization o TikTok nega /shops. Só guarda o token de fallback se não houver allowlist
      // (com allowlist, a loja não pode ser verificada -> não persiste nada).
      if (this.allowedShopIds && this.allowedShopIds.length) throw new Error('Loja não verificável (sem scope de autorização) — token não salvo: ' + e.message);
      const fallback = (d.seller_name ? 'pending:' + String(d.seller_name).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40) : (this.fallbackShopId || 'pending'));
      await this.db.saveToken({ shop_id: String(fallback), cipher: null, shop_name: '(scopes pendentes)', region: null,
        access_token: d.access_token, refresh_token: d.refresh_token || null,
        expires_at: new Date((now + Number(d.access_token_expire_in || 0)) * 1000).toISOString(),
        refresh_expires_at: new Date((now + Number(d.refresh_token_expire_in || 0)) * 1000).toISOString(),
        updated_at: new Date(now * 1000).toISOString() });
      throw new Error('Token salvo (' + (d.seller_name || '?') + '), mas o app está sem permissões (scopes) no Partner Center: ' + e.message);
    }
    if (!shops.length) throw new Error('Nenhuma loja autorizada retornada pelo TikTok.');
    if (this.allowedShopIds && this.allowedShopIds.length) {
      const ok = shops.filter((s) => this.allowedShopIds.includes(String(s.id)));
      if (!ok.length) throw new Error('Loja não permitida (' + shops.map((s) => s.id).join(',') + ').');
      shops = ok;
    }
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

  async shopRequest(shopId, path, { query = {}, body } = {}) {
    const tk = await this.db.getToken(shopId);
    if (!tk || !tk.cipher) throw new Error('Loja sem cipher; reautorize.');
    return this.request(path, { query: Object.assign({ shop_cipher: tk.cipher }, query), body, accessToken: await this.access(shopId) });
  }

  // Busca pedidos por janela de tempo (create_time ou update_time), paginando.
  async fetchOrders(shopId, from, to, field = 'create_time') {
    const out = []; let pageToken = ''; const seen = new Set();
    for (let pages = 0; pages < 400; pages++) {
      const query = { page_size: 50, sort_field: 'create_time', sort_order: 'DESC' };
      if (pageToken) query.page_token = pageToken;
      const body = field === 'update_time' ? { update_time_ge: from, update_time_lt: to } : { create_time_ge: from, create_time_lt: to };
      const d = await this.shopRequest(shopId, '/order/202309/orders/search', { query, body });
      for (const o of (d && d.orders) || []) out.push(o);
      pageToken = d && d.next_page_token;
      if (!pageToken || seen.has(pageToken)) break;
      seen.add(pageToken);
    }
    return out;
  }

  async fetchOrderDetail(shopId, ids) {
    const d = await this.shopRequest(shopId, '/order/202309/orders', { query: { ids: ids.join(',') } });
    return (d && d.orders) || [];
  }

  // Repasse (financeiro) por pedido -> settlement_amount / fee_amount.
  async fetchSettlement(shopId, orderId) {
    const d = await this.shopRequest(shopId, '/finance/202309/orders/' + encodeURIComponent(orderId) + '/statement_transactions');
    const txs = (d && (d.statement_transactions || d.transactions)) || (d && d.order_id ? [d] : []);
    let settlement = 0, fee = 0, any = false;
    for (const x of txs) { any = true; settlement += Number(x.settlement_amount || 0); fee += Number(x.fee_amount || 0); }
    if (!any) return null;
    return { shop_id: String(shopId), id_pedido: String(orderId), settlement_amount: Math.round(settlement * 100) / 100, fee_amount: Math.round(fee * 100) / 100, settlement_synced: true };
  }

  async syncReturns(shopId, from, to) {
    let saved = 0, pageToken = ''; const seen = new Set();
    for (let pages = 0; pages < 200; pages++) {
      const query = { page_size: 50 }; if (pageToken) query.page_token = pageToken;
      const d = await this.shopRequest(shopId, '/return_refund/202309/returns/search', { query, body: { create_time_ge: from, create_time_lt: to } });
      const rows = ((d && d.return_orders) || []).map((r) => normalizeReturn(r, shopId)).filter((r) => r.return_id && r.return_id !== 'undefined');
      await this.db.upsertReturns(rows); saved += rows.length;
      pageToken = d && d.next_page_token; if (!pageToken || seen.has(pageToken)) break; seen.add(pageToken);
    }
    return saved;
  }

  // Sincroniza pedidos + itens (+ repasse dos pagos, em lotes) + devoluções de uma janela.
  async sync(shopId, from, to, field = 'create_time') {
    if (![from, to].every(Number.isInteger) || to <= from || to - from > 90 * DAY) throw new Error('Escolha um intervalo válido de até 90 dias.');
    const orders = await this.fetchOrders(shopId, from, to, field);
    let saved = 0;
    for (let i = 0; i < orders.length; i += 50) {
      const batch = orders.slice(i, i + 50);
      await this.db.upsertOrders(batch.map((o) => normalizeOrder(o, shopId)));
      await this.db.upsertItems(batch.flatMap((o) => itemsOf(o, shopId)));
      saved += batch.length;
    }
    let withSettlement = 0;
    try {
      const pend = await this.db.pendingSettlement(shopId, 40);
      for (const p of pend) { try { const s = await this.fetchSettlement(shopId, p.id_pedido); if (s) { await this.db.upsertOrders([s]); withSettlement++; } } catch (e) { /* tenta no próximo sync */ } }
    } catch (e) { /* financeiro é complementar */ }
    let returns = 0; try { returns = await this.syncReturns(shopId, from, to); } catch (e) { /* complementar */ }
    return { at: new Date(this.now() * 1000).toISOString(), count: saved, withSettlement, returns, from, to, field };
  }

  verifyWebhook(rawBody, authorization) {
    const expected = webhookSignature(this.appKey, this.appSecret, rawBody);
    const got = String(authorization || '');
    if (got.length !== expected.length) return false;
    let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
    return diff === 0;
  }

  // Webhook: ORDER_STATUS_CHANGE (type 1) -> rebusca o pedido e atualiza; demais tipos só ficam no log.
  async handleWebhook(payload) {
    const id = payload && (payload.tts_notification_id || payload.notification_id);
    if (!id) throw new Error('notificação sem id');
    if (await this.db.seenWebhook(id)) return { duplicate: true };
    const shopId = String(payload.shop_id || ''); const data = payload.data || {};
    const orderId = data.order_id ? String(data.order_id) : null;
    await this.db.logWebhook({ notification_id: String(id), shop_id: shopId, type: Number(payload.type) || null, order_id: orderId, payload });
    if (Number(payload.type) === 1 && orderId && shopId) {
      const [o] = await this.fetchOrderDetail(shopId, [orderId]);
      if (o) { await this.db.upsertOrders([normalizeOrder(o, shopId)]); await this.db.upsertItems(itemsOf(o, shopId)); return { updated: orderId, status: o.status }; }
      await this.db.upsertOrders([{ shop_id: shopId, id_pedido: orderId, status: String(data.order_status || '?'), raw_status: String(data.order_status || '?'), updated_at: tsIso(data.update_time) || new Date().toISOString() }]);
      return { updated: orderId, status: data.order_status, detail: false };
    }
    return { logged: true, type: payload.type };
  }

  async status() {
    const tokens = await this.db.listTokens();
    return { configured: true, shops: tokens };
  }
}

module.exports = { TikTokProd, tiktokDb, sign, API, AUTH, AUTHORIZE, normalizeOrder, itemsOf, normalizeReturn, webhookSignature };
