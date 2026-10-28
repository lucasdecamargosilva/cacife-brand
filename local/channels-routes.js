'use strict';
// Rotas da Visão Geral (Mercado Livre + Nuvemshop) para o servidor de produção.
// Mesmo contrato do painel local (local/server.js): sessão com CSRF em /api/session e
// consultas autorizadas pela sessão Supabase de um usuário liberado (CACIFE_ALLOWED_USERS).
const express = require('express');
const { randomBytes } = require('node:crypto');
const mercadoLivre = require('./mercadolivre');
const nuvemshop = require('./nuvemshop');
const mlWorkspace = require('./ml-workspace');
const nsWorkspace = require('./ns-workspace');
const { ChannelCache } = require('./channel-cache');
const { createSync } = require('./ns-sync');

function mountChannels(app, { channelsConfig = {}, warmOnStart = true } = {}) {
  const channelCache = new ChannelCache(), nsSync = createSync(channelCache);
  const { MetricQueries, dates } = require('./metric-queries'), metricQueries = new MetricQueries();
  const M = require('../metricas-core');
  const sessions = new Map(), router = express.Router();
  router.use((req, res, next) => {
    const cookie = /(?:^|;\s*)cacife_local=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
    const session = cookie && sessions.get(cookie[1]);
    res.set('Cache-Control', 'no-store');
    if (req.path === '/session' && req.method === 'GET') {
      if (session && session.until > Date.now()) return res.json({ csrf: session.csrf });
      const id = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
      for (const [key, value] of sessions) if (value.until < Date.now()) sessions.delete(key);
      sessions.set(id, { csrf, until: Date.now() + 8 * 3600000 });
      res.cookie('cacife_local', id, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 8 * 3600000, path: '/' });
      return res.json({ csrf });
    }
    if (!session || session.until < Date.now() || req.headers['x-cacife-local'] !== session.csrf) return res.sendStatus(403);
    next();
  });
  const mlOptions = req => ({ serviceKey: channelsConfig.serviceKey, authorization: req.headers.authorization, internal: req.internal, config: channelsConfig.mercadolivre, noCache: true });
  const nsOptions = req => ({ serviceKey: channelsConfig.serviceKey, authorization: req.headers.authorization, internal: req.internal, config: channelsConfig.nuvemshop, noCache: true });
  async function cachedChannel(req, key, load, ttl = 120000, seed) { await mercadoLivre.authorize({ serviceKey: channelsConfig.serviceKey, authorization: req.headers.authorization, internal: req.internal }); return channelCache.get(key, load, { ttl, force: req.query.refresh === '1', seed }); }
  async function mlOrders(req) {
    const { start, end } = req.query; mlWorkspace.validRange(start, end);
    const cover = channelCache.coveringOrders(start, end); let seed;
    if (cover) { const range = mlWorkspace.validRange(start, end), rows = cover.data.orders.filter(o => new Date(o.created) >= new Date(range.from) && new Date(o.created) <= new Date(range.to)); seed = { updated: cover.updated, data: { ...cover.data, orders: rows, total: rows.length } }; }
    return cachedChannel(req, 'ml-orders:' + start + ':' + end, () => mlWorkspace.orders({ ...mlOptions(req), blockCache: channelCache }, start, end), 120000, seed);
  }
  async function preparedOverview(req, range) {
    const { start, end } = range, scoped = { headers: req.headers, internal: req.internal, query: { ...req.query, start, end } };
    const noNs = { orders: [], queriedAt: null, start, end, cache: { updatedAt: null, refreshing: false, stale: false, error: null } };
    const [ml, ns] = await Promise.all([mlOrders(scoped), channelsConfig.nuvemshop && channelsConfig.nuvemshop.storeId ? nsSync.orders(nsOptions(req), start, end, req.query.refresh === '1') : noNs]);
    const r = metricQueries.sync(ml, ns, start, end);
    const need = (r.topProducts || []).filter(p => p.channel === 'mercadolivre' && !p.image).map(p => p.id);
    if (!need.length) return r;
    try { const m = await mlWorkspace.thumbnails(mlOptions(req), need); return { ...r, topProducts: r.topProducts.map(p => m[p.id] ? { ...p, image: m[p.id] } : p) }; } catch (_) { return r; }
  }
  router.get('/channels/mercadolivre', async (req, res) => res.json(await cachedChannel(req, 'ml-summary', () => mercadoLivre.summary(mlOptions(req)), 60000)));
  router.get('/channels/mercadolivre/workspace/orders', async (req, res) => res.json(await mlOrders(req)));
  router.get('/channels/mercadolivre/workspace/shipping-summary', async (req, res) => { const d = await mlOrders(req); res.json(await mlWorkspace.shippingSummary(mlOptions(req), d.orders || [])); });
  router.get('/channels/mercadolivre/workspace/thumbnails', async (req, res) => { const ids = String(req.query.ids || '').split(',').filter(id => /^MLB\d+$/.test(id)).slice(0, 20); res.json({ images: ids.length ? await mlWorkspace.thumbnails(mlOptions(req), ids) : {} }); });
  router.get('/channels/mercadolivre/workspace/listings', async (req, res) => res.json(await mlWorkspace.listings({ ...mlOptions(req), noCache: false }, { status: req.query.status, offset: Number(req.query.offset || 0), q: String(req.query.q || '') })));
  router.get('/channels/mercadolivre/workspace/questions', async (req, res) => res.json(await mlWorkspace.questions({ ...mlOptions(req), noCache: false }, { status: req.query.status, offset: Number(req.query.offset || 0) })));
  router.get('/channels/mercadolivre/workspace/shipment/:id', async (req, res) => res.json(await mlWorkspace.shipment({ ...mlOptions(req), noCache: false }, req.params.id)));
  router.get('/channels/overview', async (req, res) => res.json(await preparedOverview(req, dates(req.query))));
  router.get('/metrics/queries/:name', async (req, res) => {
    const name = req.params.name;
    if (!['summary', 'sales', 'daily', 'top-products', 'comparison'].includes(name)) return res.status(400).json({ error: 'Consulta não disponível.' });
    const range = dates(req.query), current = await preparedOverview(req, range);
    if (name === 'comparison') { const previousRange = { start: M.range(range.start, range.end).previous.slice(0, 10), end: M.shift(range.start, -1) }; const previous = await preparedOverview(req, previousRange); return res.json({ current, previous, range, previousRange }); }
    res.json({ ...metricQueries.query(name, range.start, range.end), refreshing: current.refreshing, warnings: current.warnings });
  });
  router.get('/channels/nuvemshop', async (req, res) => res.json(await nuvemshop.summary(nsOptions(req))));
  router.get('/channels/nuvemshop/workspace/orders', async (req, res) => res.json(await nsSync.orders(nsOptions(req), req.query.start, req.query.end, req.query.refresh === '1')));
  router.get('/channels/nuvemshop/workspace/products', async (req, res) => res.json(await cachedChannel(req, 'ns-products', () => nsWorkspace.products(nsOptions(req)), 300000)));
  router.get('/channels/nuvemshop/workspace/checkouts', async (req, res) => res.json(await cachedChannel(req, 'ns-checkouts', () => nsWorkspace.checkouts(nsOptions(req)), 60000)));
  router.use((error, req, res, next) => { const auth = /Entre na conta|restrita à conta/.test(error.message || ''); res.status(auth ? 401 : 400).json({ error: error.message || 'Consulta indisponível.' }); });
  // Pré-aquecimento: o servidor consulta sozinho os períodos rápidos da tela (30, 15, 7 dias, ontem, hoje)
  // ao iniciar e a cada 10 min, para ninguém pegar o cache frio (inclusive na virada do dia).
  let warming = false;
  async function warm() {
    if (warming || !channelsConfig.serviceKey) return;
    warming = true;
    try {
      for (const period of ['30', '15', '7', 'yesterday', 'today']) {
        const range = dates({ period }), req = { headers: {}, query: {}, internal: mercadoLivre.INTERNAL };
        try { await preparedOverview(req, range); } catch (e) { console.error('Pré-aquecimento ' + period + ' falhou:', e.message); }
      }
    } finally { warming = false; }
  }
  if (warmOnStart) { setTimeout(warm, 3000); setInterval(warm, 10 * 60000).unref(); }
  // Só estes caminhos passam pelo roteador; o restante de /api segue para as rotas existentes.
  app.use('/api', (req, res, next) => /^\/(session|channels|metrics)(\/|$)/.test(req.path) ? router(req, res, next) : next());
}

module.exports = { mountChannels };
