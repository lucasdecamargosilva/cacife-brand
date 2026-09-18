'use strict';
// Integração Shopee de PRODUÇÃO (loja real da Cacife).
// Autossuficiente: assinatura + normalização inline (não depende de local/, que não vai pro Git).
// Persiste tokens/pedidos/itens/devoluções no Supabase.
const { createHmac } = require('node:crypto');

const DAY = 86400;

const HOSTS = {
  br: 'https://openplatform.shopee.com.br',
  sandbox: 'https://openplatform.sandbox.test-stable.shopee.sg',
  global: 'https://partner.shopeemobile.com',
};

// Assinatura HMAC-SHA256 exigida pela Shopee (base = partnerId+path+timestamp[+token+shopId]).
function sign(key, partnerId, apiPath, timestamp, token = '', shopId = '') {
  return createHmac('sha256', key).update(`${partnerId}${apiPath}${timestamp}${token}${shopId}`).digest('hex');
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

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
    payment_method: order.payment_method || null,
    shipping_carrier: order.shipping_carrier || null,
    shipping_fee: num(order.actual_shipping_fee),
    region: order.region || null,
    cancel_reason: order.cancel_reason || null,
    created_at: new Date(order.create_time * 1000).toISOString(), updated_at: new Date(order.update_time * 1000).toISOString(),
    paid_at: Number(order.pay_time) > 0 ? new Date(order.pay_time * 1000).toISOString() : null,
  };
}

// Itens do pedido -> linhas de shopee_order_items (para ranking de produtos).
// Deduplica pela chave (pedido, order_item_id) pra não repetir na mesma gravação (senão o upsert dá 500).
function itemsOf(order, shopId) {
  const byKey = new Map();
  for (const it of (order.item_list || [])) {
    const oid = Number(it.order_item_id || it.line_item_id || 0);
    if (oid <= 0) continue;
    byKey.set(oid, {
      shop_id: shopId, id_pedido: String(order.order_sn), order_item_id: oid,
      item_id: it.item_id ? Number(it.item_id) : null,
      item_name: it.item_name || null,
      model_sku: it.model_sku || it.item_sku || null,
      qty: Number(it.model_quantity_purchased || 0),
      price: num(it.model_discounted_price),
    });
  }
  return [...byKey.values()];
}

// order_income (do escrow) -> campos de repasse/taxas do pedido.
function incomeOf(orderSn, shopId, income) {
  return {
    shop_id: shopId, id_pedido: String(orderSn),
    buyer_paid: num(income.buyer_total_amount),
    escrow_amount: num(income.escrow_amount),
    commission_fee: num(income.commission_fee),
    service_fee: num(income.service_fee),
    transaction_fee: num(income.seller_transaction_fee),
    seller_voucher: num(income.voucher_from_seller),
    shopee_voucher: num(income.voucher_from_shopee),
    income_synced: true,
  };
}

// Persistência no Supabase via PostgREST (service_role). Leituras agregadas via pg-meta (/pg/query).
function supabaseDb({ url, serviceKey, fetchImpl = fetch }) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  async function rest(pathAndQuery, init = {}) {
    const res = await fetchImpl(`${url}/rest/v1/${pathAndQuery}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase HTTP ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
  const upsert = (table, conflict, rows) => rows.length ? rest(`${table}?on_conflict=${conflict}`, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows),
  }) : Promise.resolve();
  return {
    async getToken(shopId) { const r = await rest(`shopee_tokens?shop_id=eq.${shopId}&select=*`); return r && r[0] ? r[0] : null; },
    async listTokens() { return (await rest(`shopee_tokens?select=shop_id,expires_at,refresh_expires_at,updated_at`)) || []; },
    async saveToken(row) { await upsert('shopee_tokens', 'shop_id', [row]); },
    async upsertOrders(rows) { await upsert('shopee_orders', 'shop_id,id_pedido', rows); },
    async upsertItems(rows) { await upsert('shopee_order_items', 'shop_id,id_pedido,order_item_id', rows); },
    async upsertReturns(rows) { await upsert('shopee_returns', 'shop_id,return_sn', rows); },
    async listOrders(shopId) { return (await rest(shopId ? `shopee_orders?shop_id=eq.${shopId}&select=*` : `shopee_orders?select=*`)) || []; },
    // Consulta agregada de leitura (pg-meta). SQL é fixo/definido pelo servidor, nunca vem do cliente.
    async query(sql) {
      const res = await fetchImpl(`${url}/pg/query`, { method: 'POST', headers, body: JSON.stringify({ query: sql }) });
      if (!res.ok) throw new Error(`Consulta indisponível (HTTP ${res.status}).`);
      return res.json();
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
      shop_id: shopId, access_token: data.access_token, refresh_token: data.refresh_token,
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

  async shopRequest(shopId, apiPath, query, body) { return this.request(apiPath, { query, body, shopId, token: await this.access(shopId) }); }

  // Repasse/taxas em lote (até 50 pedidos por chamada).
  async fetchIncome(shopId, orderSns) {
    const map = new Map();
    for (let i = 0; i < orderSns.length; i += 50) {
      const batch = orderSns.slice(i, i + 50);
      const { response } = await this.shopRequest(shopId, '/api/v2/payment/get_escrow_detail_batch', {}, { order_sn_list: batch });
      for (const entry of (Array.isArray(response) ? response : [])) {
        const d = entry.escrow_detail;
        if (d && d.order_sn && d.order_income) map.set(String(d.order_sn), incomeOf(d.order_sn, shopId, d.order_income));
      }
    }
    return map;
  }

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
      const allIds = [...ids];
      let saved = 0, withIncome = 0;
      const optional = 'item_list,payment_method,shipping_carrier,actual_shipping_fee,cancel_reason,region,total_amount,pay_time';
      for (let i = 0; i < allIds.length; i += 50) {
        const batch = allIds.slice(i, i + 50);
        const { response } = await this.shopRequest(shopId, '/api/v2/order/get_order_detail', { order_sn_list: batch.join(','), response_optional_fields: optional });
        if (!response || !Array.isArray(response.order_list)) throw new Error('Detalhes de pedidos ausentes.');
        const received = new Set(response.order_list.map((o) => o.order_sn));
        if (received.size !== batch.length || batch.some((id) => !received.has(id))) throw new Error('Detalhes de pedidos incompletos; tente novamente.');
        const rows = response.order_list.map((o) => normalize(o, shopId));
        const items = response.order_list.flatMap((o) => itemsOf(o, shopId));
        // Grava o pedido base primeiro (todas as linhas com as MESMAS colunas -> PostgREST aceita).
        await this.db.upsertOrders(rows);
        await this.db.upsertItems(items);
        saved += rows.length;
        // Repasse/taxas: gravação SEPARADA (só pagos, colunas homogêneas). Falha aqui não perde o pedido.
        const paidSns = rows.filter((r) => r.payment_status === 'paid').map((r) => r.id_pedido);
        if (paidSns.length) {
          try {
            const income = await this.fetchIncome(shopId, paidSns);
            const incomeRows = [...income.values()];
            if (incomeRows.length) { await this.db.upsertOrders(incomeRows); withIncome += incomeRows.length; }
          } catch { /* tenta de novo no próximo sync */ }
        }
      }
      let returns = 0;
      try { returns = await this.syncReturns(shopId, from, to); } catch { /* devoluções são complementares */ }
      return { at: new Date(this.now() * 1000).toISOString(), count: saved, withIncome, returns, from, to, field };
    } finally { this.syncs.delete(shopId); }
  }

  // Devoluções da loja no período -> shopee_returns.
  async syncReturns(shopId, from, to) {
    let page = 0, saved = 0;
    for (let guard = 0; guard < 200; guard++) {
      const { response } = await this.shopRequest(shopId, '/api/v2/returns/get_return_list', { page_no: page, page_size: 50 });
      const list = response && Array.isArray(response.return) ? response.return : [];
      const rows = list.map((r) => ({
        shop_id: shopId, return_sn: String(r.return_sn), order_sn: r.order_sn ? String(r.order_sn) : null,
        status: r.status || null, reason: r.reason || r.text_reason || null,
        refund_amount: num(r.refund_amount), currency: r.currency || null,
        created_at: Number.isInteger(r.create_time) ? new Date(r.create_time * 1000).toISOString() : null,
      })).filter((r) => r.return_sn && r.return_sn !== 'null');
      await this.db.upsertReturns(rows);
      saved += rows.length;
      if (!response || response.more !== true) break;
      page += 1;
    }
    return saved;
  }

  async status() {
    const tokens = await this.db.listTokens();
    return { environment: 'production', host: this.host, partnerId: this.partnerId, shops: tokens };
  }
}

module.exports = { ShopeeProd, supabaseDb, HOSTS, sign, normalize, itemsOf, incomeOf };
