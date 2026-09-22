'use strict';
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const DAY = 86400;
const HOST = 'https://openplatform.sandbox.test-stable.shopee.sg';

function sign(key, partnerId, apiPath, timestamp, token = '', shopId = '') {
  return createHmac('sha256', key).update(`${partnerId}${apiPath}${timestamp}${token}${shopId}`).digest('hex');
}
function normalize(order, shopId) {
  if (!order.order_sn || !Number.isInteger(order.create_time) || !Number.isInteger(order.update_time)) throw new Error('Pedido com identificação ou data inválida.');
  if (order.currency !== 'BRL') throw new Error('A loja de teste precisa usar BRL.');
  const excluded = ['CANCELLED', 'IN_CANCEL', 'TO_RETURN'].includes(order.order_status);
  const paid = Number(order.pay_time) > 0 && !excluded;
  const amount = order.total_amount;
  if (paid && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)) throw new Error('Pedido pago sem total válido.');
  return { id_pedido: String(order.order_sn), shop_id: shopId, channel: 'shopee', environment: 'sandbox',
    currency: 'BRL', total: paid ? Math.round(amount * 100) / 100 : 0,
    payment_status: excluded ? 'cancelled' : paid ? 'paid' : 'pending', status: String(order.order_status),
    created_at: new Date(order.create_time * 1000).toISOString(), updated_at: new Date(order.update_time * 1000).toISOString(),
    paid_at: Number(order.pay_time) > 0 ? new Date(order.pay_time * 1000).toISOString() : null };
}
class Store {
  constructor(file) { this.file = file; this.data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { tokens: {}, orders: {}, sync: {} }; }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
  }
}
class Shopee {
  constructor({ partnerId, partnerKey, store, fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) }) {
    if (!Number.isSafeInteger(partnerId) || partnerId <= 0 || !partnerKey) throw new Error('Configure as credenciais de teste da Shopee.');
    Object.assign(this, { partnerId, partnerKey, store, fetchImpl, now });
    this.refreshes = new Map(); this.syncs = new Map();
  }
  async request(apiPath, { body, query = {}, token, shopId } = {}) {
    const timestamp = this.now();
    const url = new URL(apiPath, HOST);
    const common = { partner_id: this.partnerId, timestamp, sign: sign(this.partnerKey, this.partnerId, apiPath, timestamp, token, shopId) };
    if (token) Object.assign(common, { access_token: token, shop_id: shopId });
    Object.entries({ ...query, ...common }).forEach(([k, v]) => url.searchParams.set(k, v));
    let response;
    try { response = await this.fetchImpl(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000), redirect: 'error' }); }
    catch { throw new Error('Não foi possível consultar o sandbox da Shopee.'); }
    if (!response.ok) throw new Error(`Shopee indisponível (HTTP ${response.status}).`);
    let data; try { data = await response.json(); } catch { throw new Error('Resposta inválida da Shopee.'); }
    // Do not expose upstream messages: they may contain credentials or buyer information.
    if (data.error) throw new Error('A Shopee recusou a consulta. Verifique autorização, validade e permissões no portal.');
    return data;
  }
  saveToken(shopId, data) {
    if (!data.access_token || !data.refresh_token || !(data.expire_in > 0)) throw new Error('A Shopee não retornou uma autorização completa.');
    if (data.shop_id && Number(data.shop_id) !== shopId) throw new Error('A autorização retornou outra loja.');
    this.store.data.tokens[shopId] = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: this.now() + Number(data.expire_in), refresh_expires_at: this.now() + 30 * DAY };
    this.store.save();
    return data.access_token;
  }
  async exchange(code, shopId) {
    return this.saveToken(shopId, await this.request('/api/v2/auth/token/get', { body: { code, shop_id: shopId, partner_id: this.partnerId } }));
  }
  async access(shopId) {
    if (this.refreshes.has(shopId)) return this.refreshes.get(shopId);
    const token = this.store.data.tokens[shopId];
    if (!token) throw new Error('Autorize a loja sandbox primeiro.');
    if (token.expires_at > this.now() + 300) return token.access_token;
    if (token.refresh_expires_at <= this.now()) throw new Error('A autorização expirou. Conecte a loja novamente.');
    const work = this.request('/api/v2/auth/access_token/get', { body: { refresh_token: token.refresh_token, shop_id: shopId, partner_id: this.partnerId } }).then(data => this.saveToken(shopId, data));
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
      // Overlap window boundaries to accommodate inclusive/exclusive API endpoints; IDs deduplicate.
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
        staged.push(...response.order_list.map(o => normalize(o, shopId)));
      }
      for (const row of staged) {
        const key = `${shopId}:${row.id_pedido}`, old = this.store.data.orders[key];
        if (!old || row.updated_at >= old.updated_at) this.store.data.orders[key] = row;
      }
      this.store.data.sync[shopId] = { at: new Date(this.now() * 1000).toISOString(), count: staged.length, from, to, field };
      this.store.save();
      return this.store.data.sync[shopId];
    } finally { this.syncs.delete(shopId); }
  }
}
module.exports = { sign, normalize, Shopee, Store, DAY };
