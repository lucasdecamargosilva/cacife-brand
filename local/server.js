'use strict';
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { Shopee, Store, DAY } = require('./shopee');
const { simulate } = require('./simulate');
const mercadoLivre = require('./mercadolivre');
const nuvemshop = require('./nuvemshop');
const mlWorkspace = require('./ml-workspace');
const nsWorkspace = require('./ns-workspace');
const {ChannelCache}=require('./channel-cache');
const {createSync}=require('./ns-sync');
const ROOT = path.resolve(__dirname, '..');
const PRIVATE = path.join(os.homedir(), '.cacife-local');
const PUBLIC = new Set(['metricas.html', 'metricas.css', 'metricas.js', 'metricas-core.js', 'supabase-config.js', 'auth-guard.js', 'login.html', 'redefinir-senha.html', 'redefinir-senha.js', 'favicon.png', 'provoulevou-logo.png', 'ranking-produtos.html','crm.html','pedidos.html','style.css','dashboard-shell.css','theme-handler.js','crm-logic.js','script.js','sync-orders.js','fast-data.js','overview-shell.css','cacife-logo.png','shopee-logo.png','tiktokshop-logo.ico', 'shopee-local.html', 'shopee-local.js', 'shopee-local.css']);

function createApp({ port = 8879, store = new Store(path.join(PRIVATE, 'sandbox-store.json')), config = {}, channelsConfig = {}, client } = {}) {
  const channelCache=new ChannelCache(), nsSync=createSync(channelCache);
  const {MetricQueries,dates}=require('./metric-queries'),metricQueries=new MetricQueries();
  const app = express(), origin = `http://127.0.0.1:${port}`, sessions = new Map();
  const shopee = client || (config.partnerKey ? new Shopee({ partnerId: Number(config.partnerId), partnerKey: config.partnerKey, store }) : null);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (req.headers.host !== `127.0.0.1:${port}`) return res.sendStatus(403);
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
    if (req.headers.origin && req.headers.origin !== origin) return res.sendStatus(403);
    if (req.headers['sec-fetch-site'] === 'cross-site' && req.path !== '/shopee/callback') return res.sendStatus(403);
    next();
  });
  app.use(express.json({ limit: '12kb' }));
  app.use('/api', (req,res,next)=>{const json=res.json.bind(res);res.json=function(data){if(!/\bgzip\b/.test(req.headers['accept-encoding']||''))return json(data);const body=JSON.stringify(data);if(Buffer.byteLength(body)<2048)return json(data);require('node:zlib').gzip(body,{level:1},(error,compressed)=>{if(error)return json(data);res.set({'Content-Type':'application/json; charset=utf-8','Content-Encoding':'gzip','Vary':'Accept-Encoding'});res.send(compressed);});return res;};next();});
  app.use('/api', (req, res, next) => {
    const cookie = /(?:^|;\s*)cacife_local=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
    const session = cookie && sessions.get(cookie[1]);
    if (req.path === '/session' && req.method === 'GET') {
      if (session && session.until > Date.now()) return res.json({csrf:session.csrf});
      const id = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
      for (const [key, value] of sessions) if (value.until < Date.now()) sessions.delete(key);
      sessions.set(id, { csrf, until: Date.now() + 8 * 3600000 });
      res.cookie('cacife_local', id, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600000, path: '/' });
      return res.json({ csrf });
    }
    if (!session || session.until < Date.now() || req.headers['x-cacife-local'] !== session.csrf) return res.sendStatus(403);
    req.localSession = session;
    next();
  });
  app.get('/api/shopee/status', (req, res) => res.json({ environment: 'sandbox', configured: Boolean(shopee), redirectReady: config.redirectReady === true, partnerId: config.partnerId || 1244687,
    shops: Object.keys(store.data.tokens).map(id => ({ id, lastSync: store.data.sync[id] || null, orders: Object.values(store.data.orders).filter(o => String(o.shop_id) === id).length })) }));
  const mlOptions=req=>({serviceKey:channelsConfig.serviceKey,authorization:req.headers.authorization,config:channelsConfig.mercadolivre,noCache:true});
  const nsOptions=req=>({serviceKey:channelsConfig.serviceKey,authorization:req.headers.authorization,config:channelsConfig.nuvemshop,noCache:true});
  async function cachedChannel(req,key,load,ttl=120000,seed){await mercadoLivre.authorize({serviceKey:channelsConfig.serviceKey,authorization:req.headers.authorization});return channelCache.get(key,load,{ttl,force:req.query.refresh==='1',seed});}
  app.get('/api/channels/mercadolivre',async(req,res)=>res.json(await cachedChannel(req,'ml-summary',()=>mercadoLivre.summary(mlOptions(req)),60000)));
  async function mlOrders(req){const {start,end}=req.query;mlWorkspace.validRange(start,end);const cover=channelCache.coveringOrders(start,end);let seed;if(cover){const dates=mlWorkspace.validRange(start,end),rows=cover.data.orders.filter(o=>new Date(o.created)>=new Date(dates.from)&&new Date(o.created)<=new Date(dates.to));seed={updated:cover.updated,data:{...cover.data,orders:rows,total:rows.length}};}return cachedChannel(req,'ml-orders:'+start+':'+end,()=>mlWorkspace.orders({...mlOptions(req),blockCache:channelCache},start,end),120000,seed);}
  app.get('/api/channels/mercadolivre/workspace/orders',async(req,res)=>res.json(await mlOrders(req)));
  async function preparedOverview(req,range){const {start,end}=range;const scoped={headers:req.headers,query:{...req.query,start,end}};const [ml,ns]=await Promise.all([mlOrders(scoped),nsSync.orders(nsOptions(req),start,end,req.query.refresh==='1')]);return metricQueries.sync(ml,ns,start,end);}
  app.get('/api/channels/overview',async(req,res)=>res.json(await preparedOverview(req,dates(req.query))));
  app.get('/api/metrics/queries/:name',async(req,res)=>{const name=req.params.name;if(!['summary','sales','daily','top-products','comparison'].includes(name))return res.status(400).json({error:'Consulta não disponível.'});const range=dates(req.query);const current=await preparedOverview(req,range);if(name==='comparison'){const previousRange={start:require('../metricas-core').range(range.start,range.end).previous.slice(0,10),end:require('../metricas-core').shift(range.start,-1)};const previous=await preparedOverview(req,previousRange);return res.json({current,previous,range,previousRange});}res.json({...metricQueries.query(name,range.start,range.end),refreshing:current.refreshing,warnings:current.warnings});});
  app.get('/api/channels/mercadolivre/workspace/listings',async(req,res)=>res.json(await mlWorkspace.listings({...mlOptions(req),noCache:false},{status:req.query.status,offset:Number(req.query.offset||0),q:String(req.query.q||'')})));
  app.get('/api/channels/mercadolivre/workspace/questions',async(req,res)=>res.json(await mlWorkspace.questions({...mlOptions(req),noCache:false},{status:req.query.status,offset:Number(req.query.offset||0)})));
  app.get('/api/channels/mercadolivre/workspace/shipment/:id',async(req,res)=>res.json(await mlWorkspace.shipment({...mlOptions(req),noCache:false},req.params.id)));
  app.get('/api/channels/nuvemshop',async(req,res)=>res.json(await nuvemshop.summary(nsOptions(req))));
  app.get('/api/channels/nuvemshop/workspace/orders',async(req,res)=>res.json(await nsSync.orders(nsOptions(req),req.query.start,req.query.end,req.query.refresh==='1')));
  app.get('/api/channels/nuvemshop/workspace/products',async(req,res)=>res.json(await cachedChannel(req,'ns-products',()=>nsWorkspace.products(nsOptions(req)),300000)));
  app.get('/api/channels/nuvemshop/workspace/checkouts',async(req,res)=>res.json(await cachedChannel(req,'ns-checkouts',()=>nsWorkspace.checkouts(nsOptions(req)),60000)));
  app.post('/api/shopee/authorize', (req, res) => {
    if (!shopee) throw new Error('A chave de teste ainda precisa ser configurada no servidor local.');
    if (config.redirectReady !== true) throw new Error('A Shopee ainda não aceitou o endereço de retorno local. Valide a configuração no portal antes de conectar.');
    const state = randomBytes(32).toString('hex');
    req.localSession.authorization = { state, until: Date.now() + 10 * 60000 };
    const url = new URL('https://open.sandbox.test-stable.shopee.com/auth');
    url.search = new URLSearchParams({ partner_id: String(config.partnerId), auth_type: 'seller', redirect_uri: origin + '/shopee/callback', response_type: 'code', state });
    res.json({ url: url.toString() });
  });
  app.get('/shopee/callback', async (req, res) => {
    const cookie = /(?:^|;\s*)cacife_local=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
    const session = cookie && sessions.get(cookie[1]), pending = session?.authorization;
    const shopId = Number(req.query.shop_id), code = req.query.code;
    if (!shopee || !pending || pending.until < Date.now() || typeof req.query.state !== 'string' || req.query.state !== pending.state || !Number.isSafeInteger(shopId) || shopId <= 0 || typeof code !== 'string' || !code || code.length > 2048) return res.status(400).send('Autorização inválida ou expirada. Inicie novamente pela tela local.');
    delete session.authorization;
    await shopee.exchange(code, shopId);
    res.redirect('/shopee-local.html?connected=1');
  });
  app.post('/api/shopee/sync', async (req, res) => {
    if (!shopee) throw new Error('Configure a chave e autorize a loja sandbox primeiro.');
    const shopId = Number(req.body.shopId);
    if (!Number.isSafeInteger(shopId) || !store.data.tokens[shopId]) throw new Error('Loja sandbox não autorizada.');
    const to = Math.floor(Date.now() / 1000), from = to - 30 * DAY;
    res.json(await shopee.sync(shopId, from, to, 'update_time'));
  });
  app.get('/api/shopee/orders', (req, res) => res.json({ environment: 'sandbox', orders: Object.values(store.data.orders) }));
  app.post('/api/shopee/simulate', async (req, res) => res.json(await simulate()));
  app.get('/', (req, res) => res.redirect('/metricas.html'));
  app.get('/index.html', (req, res) => res.redirect('/metricas.html'));
  app.get('/local-assets/:name', (req, res) => {
    if (!['shopee-local.js', 'shopee-local.css'].includes(req.params.name)) return res.sendStatus(404);
    res.sendFile(path.join(__dirname, req.params.name));
  });
  app.use((req, res) => {
    const name = req.path.slice(1);
    if (!(PUBLIC.has(name) || ['metricas-channel.js','metricas-marketplaces.js','shopee-panel.js','mercadolivre.html','mercadolivre.css','mercadolivre.js','ml-core.js','nuvemshop.html','nuvemshop.js','nuvemshop.css','ns-core.js','channel-logos.css','mercadolivre-logo.png','nuvemshop-logo.png'].includes(name)) || !['GET', 'HEAD'].includes(req.method)) return res.sendStatus(404);
    res.sendFile(path.join(name.startsWith('shopee-local.') ? __dirname : ROOT, name));
  });
  app.use((error, req, res, next) => res.status(400).json({ error: error instanceof SyntaxError ? 'Solicitação inválida.' : error.message }));
  return app;
}
if (require.main === module) {
  const configFile = path.join(PRIVATE, 'shopee-sandbox.json');
  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  const channelsFile = path.join(PRIVATE, 'channels.json');
  const channelsConfig = fs.existsSync(channelsFile) ? JSON.parse(fs.readFileSync(channelsFile, 'utf8')) : {};
  const server = createApp({ config, channelsConfig }).listen(8879, '127.0.0.1');
  server.once('listening', () => console.log('Painel local: http://127.0.0.1:8879/metricas.html'));
  server.once('error', () => { console.error('Não foi possível iniciar o painel. Verifique se a porta 8879 já está em uso.'); process.exitCode = 1; });
}
module.exports = { createApp };
