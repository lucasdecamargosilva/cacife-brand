'use strict';
// Integração Shopee de PRODUÇÃO (loja real da Cacife).
// Autossuficiente: assinatura + normalização inline (não depende de local/, que não vai pro Git).
// Persiste tokens/pedidos no Supabase (não em arquivo, que se perde no redeploy).
const { createHmac } = require('node:crypto');

const DAY = 86400;

// Assinatura HMAC-SHA256 exigida pela Shopee (base = partnerId+path+timestamp[+token+shopId]).
function sign(key, partnerId, apiPath, timestamp, token = '', shopId = '') {
  return createHmac('sha256', key).update(`${partnerId}${apiPath}${timestamp}${token}${shopId}`).digest('hex');
}

// Converte um pedido da Shopee no formato da tabela shopee_orders. Descarta dados do comprador.
function normalize(order, shopId) {
  if (!order.order_sn || !Number.isInteger(order.create_time) || !Number.isInteger(order.update_time)) throw new Error('Pedido com identificação ou data inválida.');
  if (order.currency !== 'BRL') throw new Error('A loja precisa usar BRL.');
  const excluded = ['CANCELLED', 'IN_CANCEL', 'TO_RETURN'].includes(order.order_status);
  const paid = Number(order.pay_time) > 0 && !excluded;
  const amount = order.total_amount;
  if (paid && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)) throw new Error('Pedido pago sem total válido.');
  return {
    id_pedido: String(order.order_sn), shop_id: shopId, channel: 'shopee', environment: 'production',
    currency: 'BRL', total: paid ? Math.round(amount * 100) / 100 : 0,
    payment_status: excluded ? 'cancelled' : paid ? 'paid' : 'pending', status: String(order.order_status),
    created_at: new Date(order.create_time * 1000).toISOString(), updated_at: new Date(order.update_time * 1000).toISOString(),
    paid_at: Number(order.pay_time) > 0 ? new Date(order.pay_time * 1000).toISOString() : null,
  };
}

const HOSTS = {
  br: 'https://openplatform.shopee.com.br',
  sandbox: 'https://openplatform.sandbox.test-stable.shopee.sg',
  global: 'https://partner.shopeemobile.com',
};

// Camada de persistência no Supabase via PostgREST (service_role).
function supabaseDb({ url, serviceKey, fetchImpl = fetch }) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  async function rest(pathAndQuery, init = {}) {
    const res = await fetchImpl(`${url}/rest/v1/${pathAndQuery}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`Supabase indisponível (HTTP ${res.status}).`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  return {
    async getToken(shopId) {
      const rows = await rest(`shopee_tokens?shop_id=eq.${shopId}&select=*`);
      return rows && rows[0] ? rows[0] : null;
    },
    async listTokens() {
      return (await rest(`shopee_tokens?select=shop_id,expires_at,refresh_expires_at,updated_at`)) || [];
    },
    async saveToken(row) {
      await rest(`shopee_tokens?on_conflict=shop_id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row),
      });
    },
    async upsertOrders(rows) {
      if (!rows.length) return;
      await rest(`shopee_orders?on_conflict=shop_id,id_pedido`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
    },
    async listOrders(shopId) {
      const q = shopId ? `shopee_orders?shop_id=eq.${shopId}&select=*` : `shopee_orders?select=*`;
      return (await rest(q)) || [];
    },
  };
}

class ShopeeProd {
  constructor({ partnerId, partnerKey, host = HOSTS.br, db, fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) }) {
    if (!Number.isSafeInteger(partnerId) || partnerId <= 0 || !partnerKey) throw new Error('Configure SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY.');
    if (!db) throw new Error('Persistência (Supabase) não configurada.');
    Object.assign(this, { partnerId, partnerKey, host, db, fetchImpl, now });
    this.refreshes = new Map();
    this.syncs = new Map();
  }

  // URL da página de autorização da loja (o lojista clica e aprova). v2: auth_partner.
  authUrl(redirect) {
    const apiPath = '/api/v2/shop/auth_partner';
    const timestamp = this.now();
    const url = new URL(apiPath, this.host);
    url.searchParams.set('partner_id', String(this.partnerId));
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign(this.partnerKey, this.partnerId, apiPath, timestamp));
    url.searchParams.set('redirect', redirect);
    return url.toString();
  }

  async request(apiPath, { body, query = {}, token, shopId } = {}) {
    const timestamp = this.now();
    const url = new URL(apiPath, this.host);
    const common = { partner_id: this.partnerId, timestamp, sign: sign(this.partnerKey, this.partnerId, apiPath, timestamp, token, shopId) };
    if (token) Object.assign(common, { access_token: token, shop_id: shopId });
    Object.entries({ ...query, ...common }).forEach(([k, v]) => url.searchParams.set(k, v));
    let response;
    try {
      response = await this.fetchImpl(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000), redirect: 'error' });
    } catch { throw new Error('Não foi possível consultar a Shopee.'); }
    if (!response.ok) throw new Error(`Shopee indisponível (HTTP ${response.status}).`);
    let data; try { data = await response.json(); } catch { throw new Error('Resposta inválida da Shopee.'); }
    if (data.error) throw new Error('A Shopee recusou a consulta. Verifique autorização, validade e permissões no portal.');
    return data;
  }

  async saveToken(shopId, data) {
    if (!data.access_token || !data.refresh_token || !(data.expire_in > 0)) throw new Error('A Shopee não retornou uma autorização completa.');
    if (data.shop_id && Number(data.shop_id) !== shopId) throw new Error('A autorização retornou outra loja.');
    const now = this.now();
    await this.db.saveToken({
      shop_id: shopId,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date((now + Number(data.expire_in)) * 1000).toISOString(),
      refresh_expires_at: new Date((now + 30 * DAY) * 1000).toISOString(),
      updated_at: new Date(now * 1000).toISOString(),
    });
    return data.access_token;
  }

  async exchange(code, shopId) {
    return this.saveToken(shopId, await this.request('/api/v2/auth/token/get', { body: { code, shop_id: shopId, partner_id: this.partnerId } }));
  }

  async access(shopId) {
    // Dedupe concorrente: o promise é registrado ANTES de qualquer await,
    // então duas chamadas simultâneas compartilham a mesma renovação.
    if (this.refreshes.has(shopId)) return this.refreshes.get(shopId);
    const work = (async () => {
      const token = await this.db.getToken(shopId);
      if (!token) throw new Error('Autorize a loja primeiro.');
      const now = this.now();
      const expiresAt = Math.floor(new Date(token.expires_at).getTime() / 1000);
      const refreshExpiresAt = Math.floor(new Date(token.refresh_expires_at).getTime() / 1000);
      if (expiresAt > now + 300) return token.access_token;
      if (refreshExpiresAt <= now) throw new Error('A autorização expirou. Conecte a loja novamente.');
      const data = await this.request('/api/v2/auth/access_token/get', { body: { refresh_token: token.refresh_token, shop_id: shopId, partner_id: this.partnerId } });
      return this.saveToken(shopId, data);
    })();
    this.refreshes.set(shopId, work);
    try { return await work; } finally { this.refreshes.delete(shopId); }
  }

  async shopRequest(shopId, apiPath, query) { return this.request(apiPath, { query, shopId, token: await this.access(shopId) }); }

  async sync(shopId, from, to, field = 'create_time') {
    if (![from, to].every(Number.isInteger) || from < 0 || to <= from || to - from > 90 * DAY || to > this.now() + 60 || !['create_time', 'update_time'].includes(field)) throw new Error('Escolha um intervalo válido de até 90 dias.');
    if (this.syncs.has(shopId)) throw new Error('Já existe uma consulta em andamento para esta loja.');
    this.syncs.set(shopId, true);
    try {
      const ids = new Set();
      for (let start = from; start < to; start += 14 * DAY) {
        let cursor = ''; const cursors = new Set(); let pages = 0;
        do {
          if (++pages > 1000) throw new Error('Limite de páginas atingido; a importação não foi salva.');
          const { response } = await this.shopRequest(shopId, '/api/v2/order/get_order_list', { time_range_field: field, time_from: start, time_to: Math.min(to, start + 14 * DAY), page_size: 100, cursor });
          if (!response || !Array.isArray(response.order_list) || typeof response.more !== 'boolean') throw new Error('Lista de pedidos incompleta.');
          for (const item of response.order_list) { if (!item.order_sn) throw new Error('Pedido sem identificador.'); ids.add(String(item.order_sn)); }
          if (!response.more) break;
          cursor = response.next_cursor;
          if (!cursor || cursors.has(cursor)) throw new Error('A paginação da Shopee não avançou.');
          cursors.add(cursor);
        } while (true);
      }
      const allIds = [...ids], staged = [];
      for (let i = 0; i < allIds.length; i += 50) {
        const batch = allIds.slice(i, i + 50);
        const { response } = await this.shopRequest(shopId, '/api/v2/order/get_order_detail', { order_sn_list: batch.join(','), response_optional_fields: 'total_amount,pay_time' });
        if (!response || !Array.isArray(response.order_list)) throw new Error('Detalhes de pedidos ausentes.');
        const received = new Set(response.order_list.map(o => o.order_sn));
        if (received.size !== batch.length || batch.some(id => !received.has(id))) throw new Error('Detalhes de pedidos incompletos; tente novamente.');
        staged.push(...response.order_list.map(o => { const row = normalize(o, shopId); row.environment = 'production'; return row; }));
      }
      await this.db.upsertOrders(staged);
      return { at: new Date(this.now() * 1000).toISOString(), count: staged.length, from, to, field };
    } finally { this.syncs.delete(shopId); }
  }

  async status() {
    const tokens = await this.db.listTokens();
    return { environment: 'production', host: this.host, partnerId: this.partnerId, shops: tokens };
  }
}

module.exports = { ShopeeProd, supabaseDb, HOSTS };
