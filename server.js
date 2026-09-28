require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

try {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));

    const PORT = process.env.PORT || 3000;


    // Configuração de CORS
    const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ['http://localhost:3000', 'http://72.61.128.136:3000', 'https://cacife.quanticsolutions.com.br'];


    app.use((req, res, next) => {
        const origin = req.headers.origin;
        // Permite a origem da requisição ou fallback para wildcard
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
        res.header('Access-Control-Expose-Headers', 'set-cookie');

        if (req.method === 'OPTIONS') return res.sendStatus(200);
        next();
    });

    // --- SSO Chatwoot Endpoint ---
    app.get('/api/chatwoot/sso', async (req, res) => {
        try {
            const CHATWOOT_URL = process.env.CHATWOOT_URL;
            const PLATFORM_TOKEN = process.env.PLATFORM_TOKEN;
            const USER_ID = process.env.CHATWOOT_USER_ID || 11;
            const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || 4;

            if (!PLATFORM_TOKEN || !CHATWOOT_URL) {
                console.error('❌ Chatwoot configuration missing in .env');
                return res.status(500).json({ success: false, error: 'Configuração incompleta' });
            }

            // Requesting SSO URL from Chatwoot Platform API
            const response = await axios.get(
                `${CHATWOOT_URL}/platform/api/v1/users/${USER_ID}/login`,
                {
                    headers: { 'api_access_token': PLATFORM_TOKEN }
                }
            );

            let ssoUrl = response.data.url;

            // Force redirection to the specific account dashboard
            if (ACCOUNT_ID) {
                ssoUrl += `&redirect_to=/app/accounts/${ACCOUNT_ID}/dashboard`;
            }


            res.json({
                success: true,
                ssoUrl: ssoUrl
            });
        } catch (error) {
            console.error('❌ Chatwoot SSO Error:', error.response?.data || error.message);
            const status = error.response?.status || 500;
            res.status(status).json({
                success: false,
                error: error.response?.data?.error || 'Falha ao autenticar no Chatwoot'
            });
        }
    });

    // --- ML API Proxy ---
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://quantic-supabase.k5jwra.easypanel.host';
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.QF_2cwXiC3ry1eSjGGJVFHp2jZQtJdr3TBLxiR0ruG0';
    const ML_APP_ID = '523657307062945';
    const ML_APP_SECRET = 'I7jKNj6gzjyZZ7iqIFAvIvMWcZ3kFLkM';
    const ML_USER_ID = 674281461;

    async function getMLToken() {
        try {
            const { data: tokens } = await axios.get(
                `${SUPABASE_URL}/rest/v1/ml_tokens?user_id=eq.${ML_USER_ID}&select=access_token,refresh_token,expires_at`,
                { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
            );
            if (!tokens || !tokens[0]) return null;
            const token = tokens[0];

            if (new Date(token.expires_at) > new Date()) return token.access_token;

            // Refresh
            const { data: refreshed } = await axios.post('https://api.mercadolibre.com/oauth/token',
                `grant_type=refresh_token&client_id=${ML_APP_ID}&client_secret=${ML_APP_SECRET}&refresh_token=${token.refresh_token}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            if (refreshed.access_token) {
                await axios.patch(
                    `${SUPABASE_URL}/rest/v1/ml_tokens?user_id=eq.${ML_USER_ID}`,
                    { access_token: refreshed.access_token, refresh_token: refreshed.refresh_token, expires_at: new Date(Date.now() + 21600000).toISOString(), updated_at: new Date().toISOString() },
                    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' } }
                );
                return refreshed.access_token;
            }
        } catch (e) { console.error('ML token error:', e.message); }
        return null;
    }

    app.get('/api/ml/reputation', async (req, res) => {
        try {
            const token = await getMLToken();
            if (!token) return res.status(401).json({ error: 'No ML token' });
            const { data } = await axios.get(`https://api.mercadolibre.com/users/${ML_USER_ID}`, { headers: { Authorization: `Bearer ${token}` } });
            res.json(data);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/ml/questions', async (req, res) => {
        try {
            const token = await getMLToken();
            if (!token) return res.status(401).json({ error: 'No ML token' });
            const status = req.query.status || 'UNANSWERED';
            const { data } = await axios.get(`https://api.mercadolibre.com/my/received_questions/search?seller_id=${ML_USER_ID}&status=${status}&limit=1`, { headers: { Authorization: `Bearer ${token}` } });
            res.json(data);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/ml/listings', async (req, res) => {
        try {
            const token = await getMLToken();
            if (!token) return res.status(401).json({ error: 'No ML token' });
            const { data: listingsData } = await axios.get(`https://api.mercadolibre.com/users/${ML_USER_ID}/items/search?status=active&sort=sold_quantity_desc&limit=10`, { headers: { Authorization: `Bearer ${token}` } });
            const ids = listingsData.results || [];
            if (ids.length === 0) return res.json([]);
            const { data: items } = await axios.get(`https://api.mercadolibre.com/items?ids=${ids.join(',')}`, { headers: { Authorization: `Bearer ${token}` } });
            items.sort((a, b) => ((b.body || {}).sold_quantity || 0) - ((a.body || {}).sold_quantity || 0));
            res.json(items);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // --- Shopee (loja real) ---
    const crypto = require('crypto');
    const { ShopeeProd, supabaseDb, HOSTS } = require('./shopee-prod');
    const SHOPEE_PARTNER_ID = Number(process.env.SHOPEE_PARTNER_ID || 0);
    const SHOPEE_PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY || '';
    const SHOPEE_HOST = HOSTS[process.env.SHOPEE_REGION || 'br'] || HOSTS.br;
    const SHOPEE_ADMIN_TOKEN = process.env.SHOPEE_ADMIN_TOKEN || '';
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
    const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://cacife.quanticsolutions.com.br';
    const SHOPEE_REDIRECT = PUBLIC_BASE_URL + '/shopee/callback';

    let shopee = null;
    if (SHOPEE_PARTNER_ID && SHOPEE_PARTNER_KEY) {
        try {
            shopee = new ShopeeProd({
                partnerId: SHOPEE_PARTNER_ID, partnerKey: SHOPEE_PARTNER_KEY, host: SHOPEE_HOST,
                db: supabaseDb({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_KEY }),
            });
            console.log(`🛍️  Shopee ligada (host: ${SHOPEE_HOST}, partner: ${SHOPEE_PARTNER_ID})`);
        } catch (e) { console.error('Shopee init falhou:', e.message); }
    } else {
        console.log('🛍️  Shopee: aguardando SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY no ambiente.');
    }
    const requireShopee = (res) => { if (!shopee) { res.status(503).json({ error: 'Shopee ainda não configurada no servidor.' }); return false; } return true; };
    const readCookie = (req, name) => (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(name + '='))?.split('=')[1];
    const timingEq = (a, b) => { const ba = Buffer.from(String(a)), bb = Buffer.from(String(b)); return ba.length === bb.length && crypto.timingSafeEqual(ba, bb); };
    const adminOk = (provided) => Boolean(SHOPEE_ADMIN_TOKEN) && timingEq(provided || '', SHOPEE_ADMIN_TOKEN);
    // Rotas de dados (API): token SÓ por header x-admin-token (não em URL).
    const requireAdmin = (req, res) => {
        if (!adminOk(req.headers['x-admin-token'])) { res.status(401).json({ error: 'não autorizado' }); return false; }
        return true;
    };
    // Leitura (tela): aceita o token de admin OU uma sessão Supabase válida (usuário logado no painel).
    const requireViewer = async (req, res) => {
        if (adminOk(req.headers['x-admin-token'])) return true;
        const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
        if (m && SUPABASE_ANON_KEY) {
            try {
                const u = await axios.get(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${m[1]}` } });
                if (u.data && u.data.id) return true;
            } catch { /* sessão inválida */ }
        }
        res.status(401).json({ error: 'não autorizado' });
        return false;
    };

    // Sync automático: 1 min após subir e a cada 24h (últimos 7 dias por atualização).
    if (shopee) {
        const runDailySync = async () => {
            try {
                const st = await shopee.status();
                for (const s of st.shops) {
                    const to = Math.floor(Date.now() / 1000), from = to - 7 * 86400;
                    console.log('🛍️  sync diário:', JSON.stringify(await shopee.sync(Number(s.shop_id), from, to, 'update_time')));
                }
            } catch (e) { console.error('sync diário falhou:', e.message); }
        };
        setTimeout(runDailySync, 60000);
        setInterval(runDailySync, 24 * 60 * 60 * 1000);
    }

    // Inicia a autorização: manda o lojista pra página da Shopee aprovar a loja.
    // Fluxo de navegador -> aceita ?key= (link de uso único; o token é rotacionado após conectar).
    app.get('/shopee/connect', (req, res) => {
        if (!requireShopee(res)) return;
        if (!adminOk(req.query.key || req.headers['x-admin-token'])) return res.status(401).send('não autorizado');
        res.set('Referrer-Policy', 'no-referrer');
        const flow = crypto.randomBytes(16).toString('hex');
        res.cookie('shopee_flow', flow, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 10 * 60000 });
        // state viaja no CAMINHO (/callback/<state>) -> a Shopee gruda ?code&shop_id sem brigar. anti-CSRF.
        res.redirect(shopee.authUrl(SHOPEE_REDIRECT + '/' + flow));
    });

    // Retorno da Shopee com o código; valida state+cookie, troca por token e salva no Supabase.
    app.get(['/shopee/callback', '/shopee/callback/:state'], async (req, res) => {
        try {
            if (!shopee) return res.status(503).send('Shopee não configurada.');
            const cookie = readCookie(req, 'shopee_flow');
            const state = req.params.state || req.query.state;
            if (!cookie || typeof state !== 'string' || !timingEq(state, cookie)) return res.status(400).send('Autorização inválida ou expirada. Comece de novo em /shopee/connect.');
            const shopId = Number(req.query.shop_id), code = req.query.code;
            if (!Number.isSafeInteger(shopId) || shopId <= 0 || typeof code !== 'string' || !code || code.length > 2048) return res.status(400).send('Retorno inválido da Shopee.');
            res.clearCookie('shopee_flow');
            await shopee.exchange(code, shopId);
            res.redirect('/metricas.html?shopee=conectada');
        } catch (e) { console.error('Shopee callback:', e.message); res.status(500).send('Falha ao conectar a loja. Tente novamente.'); }
    });

    app.get('/api/shopee/status', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try { res.json(shopee ? await shopee.status() : { environment: 'production', configured: false, shops: [] }); }
        catch (e) { console.error('Shopee status:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    app.post('/api/shopee/sync', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            if (!requireShopee(res)) return;
            const shopId = Number(req.body?.shopId || (await shopee.status()).shops[0]?.shop_id);
            if (!Number.isSafeInteger(shopId) || shopId <= 0) return res.status(400).json({ error: 'Nenhuma loja autorizada.' });
            const days = Math.min(Number(req.body?.days) || 30, 90);
            const to = Math.floor(Date.now() / 1000), from = to - days * 86400;
            res.json(await shopee.sync(shopId, from, to, 'update_time'));
        } catch (e) { console.error('Shopee sync:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    app.get('/api/shopee/orders', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            if (!requireShopee(res)) return;
            res.json({ environment: 'production', orders: await shopee.db.listOrders(req.query.shopId ? Number(req.query.shopId) : undefined) });
        } catch (e) { console.error('Shopee orders:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    // Resumo pronto pra tela da Shopee (repasse, taxas, pagamento, envio, top produtos, região, devoluções).
    app.get('/api/shopee/summary', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        try {
            if (!requireShopee(res)) return;
            const Q = {
                totais: `select count(*) filter (where payment_status='paid') pedidos_pagos,
                    round(coalesce(sum(total) filter (where payment_status='paid'),0)::numeric,2) bruto,
                    round(coalesce(sum(escrow_amount) filter (where payment_status='paid'),0)::numeric,2) liquido,
                    round(coalesce(sum(coalesce(commission_fee,0)+coalesce(service_fee,0)+coalesce(transaction_fee,0)) filter (where payment_status='paid'),0)::numeric,2) taxas,
                    round(coalesce(sum(seller_voucher) filter (where payment_status='paid'),0)::numeric,2) desconto_lojista,
                    count(*) filter (where payment_status='paid' and income_synced) com_repasse,
                    count(*) filter (where payment_status='cancelled') cancelados
                    from shopee_orders`,
                pagamento: `select coalesce(payment_method,'?') metodo, count(*) n, round(coalesce(sum(total),0)::numeric,2) bruto from shopee_orders where payment_status='paid' group by 1 order by n desc`,
                envio: `select coalesce(shipping_carrier,'?') tipo, count(*) n from shopee_orders where payment_status='paid' group by 1 order by n desc`,
                top_produtos: `select i.item_name, sum(i.qty) unidades, count(distinct i.id_pedido) pedidos from shopee_order_items i join shopee_orders o on o.shop_id=i.shop_id and o.id_pedido=i.id_pedido and o.payment_status='paid' group by i.item_name order by unidades desc limit 10`,
                regiao: `select coalesce(region,'?') uf, count(*) n from shopee_orders where payment_status='paid' group by 1 order by n desc limit 15`,
                devolucoes: `select count(*) n, round(coalesce(sum(refund_amount),0)::numeric,2) valor from shopee_returns where created_at >= now() - interval '30 days'`,
            };
            const out = {};
            for (const [k, sql] of Object.entries(Q)) out[k] = await shopee.db.query(sql);
            out.totais = out.totais[0] || {};
            out.devolucoes = out.devolucoes[0] || {};
            res.json(out);
        } catch (e) { console.error('Shopee summary:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    // Resumo POR PERÍODO, no formato que o painel de canais consome (valores em centavos).
    app.get('/api/shopee/overview', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        try {
            if (!requireShopee(res)) return;
            const re = /^\d{4}-\d{2}-\d{2}$/;
            const { start, end } = req.query;
            if (!re.test(start || '') || !re.test(end || '') || start > end) return res.status(400).json({ error: 'período inválido' });
            // janelas em horário de Brasília (-03:00); [lo, hi)
            const lo = `'${start} 00:00:00-03'`;
            const hi = `('${end} 00:00:00-03'::timestamptz + interval '1 day')`;
            const per = `created_at >= ${lo} and created_at < ${hi}`;
            const q1 = `select
                count(*) filter (where payment_status='paid') paid,
                count(*) orders,
                count(*) filter (where payment_status='cancelled') cancelled,
                round(coalesce(sum(total*100) filter (where payment_status='paid'),0)) revenue,
                round(coalesce(sum(escrow_amount*100) filter (where payment_status='paid'),0)) liquido,
                round(coalesce(sum((coalesce(commission_fee,0)+coalesce(service_fee,0)+coalesce(transaction_fee,0))*100) filter (where payment_status='paid'),0)) fees,
                round(coalesce(sum(seller_voucher*100) filter (where payment_status='paid'),0)) discounts
                from shopee_orders where ${per}`;
            const qDay = `select to_char((created_at at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') d, round(coalesce(sum(total*100),0)) c
                from shopee_orders where payment_status='paid' and ${per} group by 1`;
            const qRank = `select coalesce(i.item_id,0) id, max(i.item_name) title, max(i.image_url) image, sum(i.qty)::int units, round(coalesce(sum(i.price*i.qty*100),0))::bigint value
                from shopee_order_items i join shopee_orders o on o.shop_id=i.shop_id and o.id_pedido=i.id_pedido
                where o.payment_status='paid' and ${per.replace(/created_at/g, 'o.created_at')} group by i.item_id order by value desc limit 8`;
            const qPay = `select coalesce(payment_method,'?') metodo, count(*) n, round(coalesce(sum(total*100),0)) bruto from shopee_orders where payment_status='paid' and ${per} group by 1 order by n desc`;
            const qShip = `select coalesce(shipping_carrier,'?') tipo, count(*) n from shopee_orders where payment_status='paid' and ${per} group by 1 order by n desc`;
            const qRet = `select count(*) n, round(coalesce(sum(refund_amount*100),0)) valor from shopee_returns where ${per}`;
            const qStatus = `select coalesce(status,'?') status, count(*) n, round(coalesce(sum(total*100),0)) valor from shopee_orders where ${per} group by 1 order by n desc`;
            const qRecent = `select id_pedido, to_char(created_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI') dt, coalesce(status,'?') status, coalesce(payment_status,'?') pay_status, coalesce(payment_method,'-') pay, round(coalesce(total*100,0)) total from shopee_orders where ${per} order by created_at desc limit 40`;
            const qDev = `select return_sn, order_sn, coalesce(status,'?') status, coalesce(reason,'-') reason, round(coalesce(refund_amount*100,0)) refund, to_char(created_at at time zone 'America/Sao_Paulo','DD/MM') dt from shopee_returns where ${per} order by created_at desc limit 30`;
            const [base, days, rank, pay, ship, ret, sts, recent, dev] = await Promise.all([
                shopee.db.query(q1), shopee.db.query(qDay), shopee.db.query(qRank),
                shopee.db.query(qPay), shopee.db.query(qShip), shopee.db.query(qRet),
                shopee.db.query(qStatus), shopee.db.query(qRecent), shopee.db.query(qDev),
            ]);
            const b = base[0] || {};
            const N = (v) => Math.round(Number(v) || 0);
            const revenue = N(b.revenue), paid = N(b.paid);
            const byDay = {}; for (const r of days) byDay[r.d] = N(r.c);
            res.json({
                revenue, paid, orders: N(b.orders), cancelled: N(b.cancelled),
                ticket: paid ? Math.round(revenue / paid) : 0,
                liquido: N(b.liquido), fees: N(b.fees), discounts: N(b.discounts),
                byDay,
                ranking: rank.map(r => ({ id: r.id, title: r.title || 'Produto', image: r.image || null, units: N(r.units), value: N(r.value) })),
                pagamento: pay.map(r => ({ metodo: r.metodo, n: N(r.n), bruto: N(r.bruto) })),
                envio: ship.map(r => ({ tipo: r.tipo, n: N(r.n) })),
                devolucoes: { n: N(ret[0]?.n), valor: N(ret[0]?.valor) },
                porStatus: sts.map(r => ({ status: r.status, n: N(r.n), valor: N(r.valor) })),
                recentes: recent.map(r => ({ id: r.id_pedido, dt: r.dt, status: r.status, pay_status: r.pay_status, pay: r.pay, total: N(r.total) })),
                devList: dev.map(r => ({ return_sn: r.return_sn, order_sn: r.order_sn, status: r.status, reason: r.reason, refund: N(r.refund), dt: r.dt })),
            });
        } catch (e) { console.error('Shopee overview:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    // --- Chat da Shopee (leitura) ---
    const shopeeShopId = async () => Number((await shopee.status()).shops[0]?.shop_id) || 0;
    app.get('/api/shopee/chat/conversations', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        try {
            if (!requireShopee(res)) return;
            const shop = await shopeeShopId(); if (!shop) return res.status(400).json({ error: 'Nenhuma loja autorizada.' });
            res.json(await shopee.chatConversations(shop, { pageSize: Number(req.query.page_size) || 25, next: req.query.next }));
        } catch (e) { console.error('Shopee chat conversations:', e); res.status(500).json({ error: 'erro interno' }); }
    });
    app.get('/api/shopee/chat/messages', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        try {
            if (!requireShopee(res)) return;
            const shop = await shopeeShopId(); if (!shop) return res.status(400).json({ error: 'Nenhuma loja autorizada.' });
            res.json(await shopee.chatMessages(shop, String(req.query.conversation_id || ''), { pageSize: Number(req.query.page_size) || 30 }));
        } catch (e) { console.error('Shopee chat messages:', e); res.status(500).json({ error: 'erro interno' }); }
    });
    app.post('/api/shopee/chat/send', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        try {
            if (!requireShopee(res)) return;
            const shop = await shopeeShopId(); if (!shop) return res.status(400).json({ error: 'Nenhuma loja autorizada.' });
            const toId = Number(req.body?.to_id), text = String(req.body?.text || '');
            if (!Number.isSafeInteger(toId) || toId <= 0 || !text.trim()) return res.status(400).json({ error: 'Dados inválidos.' });
            res.json(await shopee.chatSend(shop, toId, text));
        } catch (e) { console.error('Shopee chat send:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    // --- TikTok Shop (loja real) ---
    const { TikTokProd, tiktokDb } = require('./tiktok-prod');
    const TIKTOK_APP_KEY = process.env.TIKTOK_APP_KEY || '';
    const TIKTOK_APP_SECRET = process.env.TIKTOK_APP_SECRET || '';
    const TIKTOK_SERVICE_ID = process.env.TIKTOK_SERVICE_ID || '';
    let tiktok = null, tiktok2 = null;
    if (TIKTOK_APP_KEY && TIKTOK_APP_SECRET) {
        try {
            tiktok = new TikTokProd({ appKey: TIKTOK_APP_KEY, appSecret: TIKTOK_APP_SECRET, serviceId: TIKTOK_SERVICE_ID, fallbackShopId: process.env.TIKTOK_SHOP_ID || null, allowedShopIds: String(process.env.TIKTOK_ALLOWED_SHOP_IDS || process.env.TIKTOK_SHOP_ID || '').split(',').map(x=>x.trim()).filter(Boolean), db: tiktokDb({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_KEY }) });
            // 2º app (categoria TikTok Shop Seller): Analytics + Afiliados. Tokens em tabela própria.
            if (process.env.TIKTOK2_APP_KEY && process.env.TIKTOK2_APP_SECRET) {
                tiktok2 = new TikTokProd({ appKey: process.env.TIKTOK2_APP_KEY, appSecret: process.env.TIKTOK2_APP_SECRET, serviceId: process.env.TIKTOK2_SERVICE_ID || '', trustedSellerName: process.env.TIKTOK_SELLER_NAME || 'Cacife Brand', fallbackShopId: process.env.TIKTOK_SHOP_ID || null, allowedShopIds: String(process.env.TIKTOK_ALLOWED_SHOP_IDS || process.env.TIKTOK_SHOP_ID || '').split(',').map(x=>x.trim()).filter(Boolean), db: tiktokDb({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_KEY, tokensTable: 'tiktok_tokens_analytics' }) });
                console.log('🎵 TikTok app 2 (Analytics/Afiliados) ligado (service ' + (process.env.TIKTOK2_SERVICE_ID || '?') + ')');
            }
            console.log('🎵 TikTok Shop ligado (service ' + TIKTOK_SERVICE_ID + ')');
        } catch (e) { console.error('TikTok init falhou:', e.message); }
    } else { console.log('🎵 TikTok Shop: aguardando TIKTOK_APP_KEY / TIKTOK_APP_SECRET no ambiente.'); }
    const requireTiktok = (res) => { if (!tiktok) { res.status(503).json({ error: 'TikTok ainda não configurado no servidor.' }); return false; } return true; };

    // Link de autorização assinado (HMAC + validade) para o lojista clicar sem receber a senha de admin.
    const connectSign = (exp) => crypto.createHmac('sha256', SHOPEE_ADMIN_TOKEN || 'x').update('tiktok-connect:' + exp).digest('hex');
    const stateSign = (exp) => crypto.createHmac('sha256', SHOPEE_ADMIN_TOKEN || 'x').update('tiktok-state:' + exp).digest('hex');
    const stateOk = (st) => { const m = /^(\d{10,13})\.([0-9a-f]{64})$/.exec(String(st || '')); return Boolean(m) && Number(m[1]) >= Date.now() && timingEq(m[2], stateSign(m[1])); };
    const connectLinkOk = (t) => {
        const m = /^(\d{10,13})\.([0-9a-f]{64})$/.exec(String(t || '')); if (!m) return false;
        if (Number(m[1]) < Date.now()) return false;
        return timingEq(m[2], connectSign(m[1]));
    };
    app.get('/api/tiktok/connect-link', (req, res) => {
        if (!adminOk(req.query.key || req.headers['x-admin-token'])) return res.sendStatus(401);
        const exp = String(Date.now() + 48 * 3600000);
        res.json({ url: `${PUBLIC_BASE_URL}/tiktok/connect?t=${exp}.${connectSign(exp)}`, expira: new Date(Number(exp)).toISOString() });
    });
    app.get('/tiktok/connect', (req, res) => {
        if (!requireTiktok(res)) return;
        const ok = adminOk(req.query.key || req.headers['x-admin-token']) || connectLinkOk(req.query.t);
        if (!ok) return res.status(401).send('Link inválido ou expirado. Peça um novo link de autorização.');
        res.set('Referrer-Policy', 'no-referrer');
        // state assinado com validade (2h): o TikTok devolve e a gente confere a assinatura — não depende de cookie.
        const exp = String(Date.now() + 2 * 3600000);
        res.redirect(tiktok.authUrl(exp + '.' + stateSign(exp)));
    });
    const tiktokDebug = [];
    const tkLog = (o) => { tiktokDebug.push({ at: new Date().toISOString(), ...o }); if (tiktokDebug.length > 20) tiktokDebug.shift(); };
    app.get('/api/tiktok/debug', (req, res) => { if (!adminOk(req.query.key || req.headers['x-admin-token'])) return res.sendStatus(401); res.json(tiktokDebug); });
    app.get('/tiktok/callback', async (req, res) => {
        tkLog({ step: 'callback', query: Object.keys(req.query), app_key: req.query.app_key, error: req.query.error, error_description: req.query.error_description, shop_region: req.query.shop_region, locale: req.query.locale, codeLen: typeof req.query.code === 'string' ? req.query.code.length : 0, state: typeof req.query.state === 'string' ? req.query.state.slice(0, 8) : null });
        try {
            if (!tiktok) return res.status(503).send('TikTok não configurado.');
            const state = req.query.state;
            if (state !== undefined && !stateOk(state)) { tkLog({ step: 'state-invalido' }); return res.status(400).send('Autorização inválida ou expirada. Peça um novo link e tente de novo.'); }
            // Sem state = veio pelo link de autorização do próprio TikTok; a trava passa a ser a allowlist de lojas (TIKTOK_ALLOWED_SHOP_IDS).
            const code = req.query.code || req.query.auth_code;
            if (typeof code !== 'string' || !code || code.length > 2048) return res.status(400).send('Retorno inválido do TikTok.');
            const inst = (tiktok2 && req.query.app_key === process.env.TIKTOK2_APP_KEY) ? tiktok2 : tiktok;
            const r = await inst.exchange(code); tkLog({ step: 'ok', app: inst === tiktok2 ? 'analytics' : 'principal', lojas: r.shops, granted: r.granted });
            res.set('Content-Type','text/html; charset=utf-8').send('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#031b30;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><div style="font-size:64px">✅</div><h2>Loja do TikTok Shop conectada!</h2><p>Pode fechar esta página. Obrigado!</p></div></body>');
        } catch (e) { console.error('TikTok callback:', e.message); tkLog({ step: 'erro', erro: String(e.message).slice(0, 200) });
            if (/Token salvo/.test(e.message)) return res.set('Content-Type','text/html; charset=utf-8').send('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#031b30;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><div style="font-size:64px">🟡</div><h2>Autorização recebida!</h2><p>A chave da loja foi salva. Falta só liberar as permissões de API do app no Partner Center.<br>Pode fechar esta página.</p></div></body>');
            res.status(500).send('Falha ao conectar a loja. Tente novamente em /tiktok/connect.'); }
    });
    // Fallback: trocar um auth_code obtido fora do redirect (ex.: exibido na tela do TikTok) — admin only.
    app.post('/api/tiktok/exchange', async (req, res) => {
        if (!requireTiktok(res)) return;
        if (!adminOk(req.query.key || req.headers['x-admin-token'])) return res.sendStatus(401);
        const code = req.body && req.body.code;
        if (typeof code !== 'string' || !code.trim() || code.length > 2048) return res.status(400).json({ error: 'code inválido' });
        try { const r = await tiktok.exchange(code.trim()); tkLog({ step: 'exchange-manual', lojas: r.shops }); res.json(r); }
        catch (e) { tkLog({ step: 'exchange-manual-erro', erro: String(e.message).slice(0, 200) }); res.status(400).json({ error: String(e.message).slice(0, 200) }); }
    });
    app.get('/api/tiktok/status', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        try { res.json(tiktok ? await tiktok.status() : { configured: false, shops: [] }); }
        catch (e) { console.error('TikTok status:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    // Loja principal do TikTok: a primeira com cipher (prefere a Cacife se estiver liberada).
    const tiktokShopId = async () => {
        const st = await tiktok.status();
        const withCipher = st.shops.filter((x) => x.cipher);
        const pref = withCipher.find((x) => x.shop_id === (process.env.TIKTOK_SHOP_ID || '')) || withCipher[0];
        return pref ? String(pref.shop_id) : '';
    };

    app.post('/api/tiktok/sync', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        if (!requireTiktok(res)) return;
        try {
            const shop = await tiktokShopId(); if (!shop) return res.status(400).json({ error: 'Nenhuma loja do TikTok liberada.' });
            const to = Math.floor(Date.now() / 1000), days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
            const r = await tiktok.sync(shop, to - days * 86400, to, 'update_time');
            tkLog({ step: 'sync', shop, ...r });
            res.json(r);
        } catch (e) { console.error('TikTok sync:', e.message); tkLog({ step: 'sync-erro', erro: String(e.message).slice(0, 200) }); res.status(500).json({ error: 'sincronização falhou' }); }
    });

    app.get('/api/tiktok/overview', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        if (!requireTiktok(res)) return;
        try {
            const re = /^\d{4}-\d{2}-\d{2}$/;
            const { start, end } = req.query;
            if (!re.test(start || '') || !re.test(end || '') || start > end) return res.status(400).json({ error: 'período inválido' });
            const shop = await tiktokShopId();
            const shopF = shop ? "shop_id='" + shop.replace(/[^0-9a-zA-Z_:-]/g, '') + "' and " : '';
            const lo = "'" + start + " 00:00:00-03'", hi = "('" + end + " 00:00:00-03'::timestamptz + interval '1 day')";
            const per = shopF + 'created_at >= ' + lo + ' and created_at < ' + hi;
            const q1 = "select count(*) filter (where payment_status='paid') paid, count(*) orders, count(*) filter (where payment_status='cancelled') cancelled, " +
                "round(coalesce(sum(total*100) filter (where payment_status='paid'),0)) revenue, round(coalesce(sum(settlement_amount*100) filter (where payment_status='paid'),0)) liquido, " +
                "round(coalesce(sum(fee_amount*100) filter (where payment_status='paid'),0)) fees from tiktok_orders where " + per;
            const qDay = "select to_char((created_at at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') d, round(coalesce(sum(total*100),0)) c from tiktok_orders where payment_status='paid' and " + per + " group by 1";
            const qRank = "select coalesce(i.product_id,'0') id, max(i.product_name) title, max(i.image_url) image, sum(i.qty)::int units, round(coalesce(sum(i.price*i.qty*100),0))::bigint value " +
                "from tiktok_order_items i join tiktok_orders o on o.shop_id=i.shop_id and o.id_pedido=i.id_pedido where o.payment_status='paid' and " + per.replace(/created_at/g, 'o.created_at').replace(/shop_id=/g, 'o.shop_id=') + " group by i.product_id order by value desc limit 8";
            const qPay = "select coalesce(payment_method,'?') metodo, count(*) n, round(coalesce(sum(total*100),0)) bruto from tiktok_orders where payment_status='paid' and " + per + " group by 1 order by n desc";
            const qShip = "select coalesce(delivery_option,'?') tipo, count(*) n from tiktok_orders where payment_status='paid' and " + per + " group by 1 order by n desc";
            const qRet = "select count(*) n, round(coalesce(sum(refund_amount*100),0)) valor from tiktok_returns where " + per;
            const qStatus = "select coalesce(status,'?') status, count(*) n, round(coalesce(sum(total*100),0)) valor from tiktok_orders where " + per + " group by 1 order by n desc";
            const qRecent = "select id_pedido, to_char(created_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI') dt, coalesce(status,'?') status, coalesce(payment_status,'?') pay_status, coalesce(payment_method,'-') pay, round(coalesce(total*100,0)) total from tiktok_orders where " + per + " order by created_at desc limit 40";
            const qDev = "select r.return_id, r.order_id, coalesce(r.status,'?') status, coalesce(r.reason,'-') reason, round(coalesce(r.refund_amount*100,0)) refund, to_char(r.created_at at time zone 'America/Sao_Paulo','DD/MM') dt, it.product_name, it.sku_name, it.image_url " +
                "from tiktok_returns r left join lateral (select product_name, sku_name, image_url from tiktok_order_items i where i.shop_id=r.shop_id and i.id_pedido=r.order_id limit 1) it on true where " + per.replace(/shop_id=/g, 'r.shop_id=').replace(/created_at/g, 'r.created_at') + " order by r.created_at desc limit 30";
            const qDevMot = "select coalesce(reason,'Sem motivo') reason, count(*) n from tiktok_returns where " + per + " group by 1 order by 2 desc limit 6";
            const qDevSt = "select coalesce(status,'?') status, count(*) n from tiktok_returns where " + per + " group by 1";
            const qSync = "select to_char(max(updated_at) at time zone 'America/Sao_Paulo','DD/MM HH24:MI') last from tiktok_orders where " + (shopF ? shopF.replace(/ and $/, '') : 'true');
            const db = tiktok.db;
            const shopOnly = shopF ? shopF.replace(/ and $/, '') : 'true';
            const perPaid = shopF + "paid_time >= " + lo + " and paid_time < " + hi;
            const perStmt = shopF + "statement_time >= " + lo + " and statement_time < " + hi;
            // Financeiro: o que caiu (depósitos), extratos do período, taxa média de repasse (últimos 30d) e o que falta cair.
            const qRecebido = "select round(coalesce(sum(amount*100),0)) v, count(*) n from tiktok_payments where status='PAID' and " + perPaid;
            const qRecDia = "select to_char((paid_time at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') d, round(coalesce(sum(amount*100),0)) c from tiktok_payments where status='PAID' and " + perPaid + " group by 1";
            const qExtr = "select round(coalesce(sum(revenue*100),0)) rev, round(coalesce(sum(settlement*100),0)) settle, round(coalesce(sum(fee*100),0)) fee, " +
                "round(coalesce(sum(com_tiktok*100) filter (where detalhado),0)) com_tiktok, round(coalesce(sum(com_afiliados*100) filter (where detalhado),0)) com_afiliados, round(coalesce(sum(outras_taxas*100) filter (where detalhado),0)) outras, " +
                "round(coalesce(sum(frete*100) filter (where detalhado),0)) frete, round(coalesce(sum(ajustes*100) filter (where detalhado),0)) ajustes, count(*) n, count(*) filter (where detalhado) n_det from tiktok_statements where " + perStmt;
            const qExtrList = "select to_char(statement_time at time zone 'America/Sao_Paulo','DD/MM/YYYY') dt, round(coalesce(revenue*100,0)) rev, round(coalesce(com_tiktok*100,0)) com_tiktok, round(coalesce(com_afiliados*100,0)) com_afiliados, " +
                "round(coalesce(frete*100,0)) frete, round(coalesce(outras_taxas*100,0)) outras, round(coalesce(fee*100,0)) fee, round(coalesce(settlement*100,0)) settle, coalesce(payment_status,'?') status, detalhado from tiktok_statements where " + perStmt + " order by statement_time desc limit 15";
            const qTaxa = "select coalesce(sum(settlement)/nullif(sum(revenue),0),0) r from tiktok_statements where " + shopOnly + " and statement_time >= now() - interval '30 days'";
            const qPendConf = "select round(coalesce(sum(settlement*100),0)) v, count(*) n, to_char(min(statement_time) at time zone 'America/Sao_Paulo','DD/MM') desde from tiktok_statements where " + shopOnly + " and coalesce(payment_status,'') <> 'PAID'";
            const qPendEst = "select case when status in ('DELIVERED','COMPLETED') then 'entregue' when status in ('IN_TRANSIT','AWAITING_COLLECTION','PARTIALLY_SHIPPING') then 'transito' else 'aguardando' end grupo, count(*) n, round(coalesce(sum(total*100),0)) bruto " +
                "from tiktok_orders where " + shopOnly + " and payment_status='paid' and coalesce(settlement_synced,false)=false and created_at >= now() - interval '60 days' group by 1";
            const qDepositos = "select to_char(paid_time at time zone 'America/Sao_Paulo','DD/MM') dt, status, round(coalesce(amount*100,0)) v from tiktok_payments where " + shopOnly + " order by coalesce(paid_time,create_time) desc limit 12";
            // Estoque: quantidade por variação x velocidade de venda (unidades pagas nos últimos 30 dias).
            const qEstoque = "with vend as (select i.sku_id, sum(i.qty) u30 from tiktok_order_items i join tiktok_orders o on o.shop_id=i.shop_id and o.id_pedido=i.id_pedido " +
                "where o.payment_status='paid' and o.created_at >= now() - interval '30 days' and " + shopOnly.replace(/shop_id=/g, 'o.shop_id=') + " group by 1) " +
                ", nm as (select distinct on (sku_id) sku_id, sku_name, image_url from tiktok_order_items where " + shopOnly + " and sku_id is not null order by sku_id, (sku_name is null), (image_url is null)) " +
                "select s.sku_id, s.title, s.seller_sku, nm.sku_name, coalesce(nm.image_url, p.image_url) img, coalesce(s.qty,0) qty, coalesce(v.u30,0) u30, " +
                "case when coalesce(v.u30,0) > 0 then round(coalesce(s.qty,0) / (v.u30/30.0), 1) else null end dias " +
                "from tiktok_skus s left join vend v on v.sku_id=s.sku_id left join nm on nm.sku_id=s.sku_id left join tiktok_products p on p.shop_id=s.shop_id and p.product_id=s.product_id where " + shopOnly.replace(/shop_id=/g, 's.shop_id=') + " and s.status='ACTIVATE'";
            const [base, days, rank, pay, ship, ret, sts, recent, dev, last, recebido, recDia, extr, taxa, pendConf, pendEst, depositos, estoque, devMot, devSt, extrList] = await Promise.all([db.query(q1), db.query(qDay), db.query(qRank), db.query(qPay), db.query(qShip), db.query(qRet), db.query(qStatus), db.query(qRecent), db.query(qDev), db.query(qSync),
                db.query(qRecebido), db.query(qRecDia), db.query(qExtr), db.query(qTaxa), db.query(qPendConf), db.query(qPendEst), db.query(qDepositos), db.query(qEstoque), db.query(qDevMot), db.query(qDevSt), db.query(qExtrList)]);
            const b = base[0] || {}; const N = (v) => Math.round(Number(v) || 0);
            const revenue = N(b.revenue), paid = N(b.paid);
            const byDay = {}; for (const r of days) byDay[r.d] = N(r.c);
            const st = await tiktok.status(); const shopRow = st.shops.find((x) => String(x.shop_id) === shop);
            res.json({
                shop: shopRow ? shopRow.shop_name : null, lastSync: (last[0] && last[0].last) || null,
                revenue, paid, orders: N(b.orders), cancelled: N(b.cancelled), ticket: paid ? Math.round(revenue / paid) : 0,
                liquido: N(b.liquido), fees: N(b.fees), byDay,
                ranking: rank.map((r) => ({ id: r.id, title: r.title || 'Produto', image: r.image || null, units: N(r.units), value: N(r.value) })),
                pagamento: pay.map((r) => ({ metodo: r.metodo, n: N(r.n), bruto: N(r.bruto) })),
                envio: ship.map((r) => ({ tipo: r.tipo, n: N(r.n) })),
                devolucoes: { n: N(ret[0] && ret[0].n), valor: N(ret[0] && ret[0].valor) },
                porStatus: sts.map((r) => ({ status: r.status, n: N(r.n), valor: N(r.valor) })),
                recentes: recent.map((r) => ({ id: r.id_pedido, dt: r.dt, status: r.status, pay_status: r.pay_status, pay: r.pay, total: N(r.total) })),
                devList: dev.map((r) => ({ return_id: r.return_id, order_id: r.order_id, status: r.status, reason: r.reason, refund: N(r.refund), dt: r.dt, produto: r.product_name || null, variacao: r.sku_name || null, img: r.image_url || null })),
                devMotivos: devMot.map((r) => ({ reason: r.reason, n: N(r.n) })),
                devStatus: devSt.map((r) => ({ status: r.status, n: N(r.n) })),
                financeiro: (() => {
                    const r = Number(taxa[0] && taxa[0].r) || 0;
                    const grupos = { entregue: { n: 0, bruto: 0 }, transito: { n: 0, bruto: 0 }, aguardando: { n: 0, bruto: 0 } };
                    for (const g of pendEst) grupos[g.grupo] = { n: N(g.n), bruto: N(g.bruto) };
                    const est = (b) => Math.round(b * r);
                    const recDay = {}; for (const x of recDia) recDay[x.d] = N(x.c);
                    return {
                        recebido: N(recebido[0] && recebido[0].v), depositos: N(recebido[0] && recebido[0].n), recebidoPorDia: recDay,
                        extratos: { bruto: N(extr[0] && extr[0].rev), repasse: N(extr[0] && extr[0].settle), taxas: N(extr[0] && extr[0].fee),
                            detalhe: { comTiktok: N(extr[0] && extr[0].com_tiktok), comAfiliados: N(extr[0] && extr[0].com_afiliados), outras: N(extr[0] && extr[0].outras), frete: N(extr[0] && extr[0].frete), ajustes: N(extr[0] && extr[0].ajustes), n: N(extr[0] && extr[0].n), nDetalhados: N(extr[0] && extr[0].n_det) } },
                        lista: extrList.map((x) => ({ dt: x.dt, bruto: N(x.rev), comTiktok: N(x.com_tiktok), comAfiliados: N(x.com_afiliados), frete: N(x.frete), outras: N(x.outras), taxas: N(x.fee), liquido: N(x.settle), status: x.status, detalhado: !!x.detalhado })),
                        taxaRepasse: Math.round(r * 1000) / 10,
                        aReceberConfirmado: { v: N(pendConf[0] && pendConf[0].v), n: N(pendConf[0] && pendConf[0].n), desde: pendConf[0] && pendConf[0].desde },
                        aReceberEstimado: {
                            entregue: { n: grupos.entregue.n, v: est(grupos.entregue.bruto) },
                            transito: { n: grupos.transito.n, v: est(grupos.transito.bruto) },
                            aguardando: { n: grupos.aguardando.n, v: est(grupos.aguardando.bruto) },
                            total: est(grupos.entregue.bruto + grupos.transito.bruto + grupos.aguardando.bruto),
                        },
                        ultimosDepositos: depositos.map((x) => ({ dt: x.dt, status: x.status, v: N(x.v) })),
                    };
                })(),
                estoque: (() => {
                    const rows = estoque.map((x) => ({ sku: x.sku_id, title: x.title, seller_sku: x.seller_sku, variacao: x.sku_name || null, img: x.img || null, qty: N(x.qty), u30: N(x.u30), dias: x.dias == null ? null : Number(x.dias) }));
                    const esgotados = rows.filter((x) => x.qty <= 0 && x.u30 > 0).sort((a, b) => b.u30 - a.u30);
                    const criticos = rows.filter((x) => x.qty > 0 && x.dias != null && x.dias <= 10).sort((a, b) => a.dias - b.dias);
                    return { skus: rows.length, semEstoque: rows.filter((x) => x.qty <= 0).length, esgotados: esgotados.slice(0, 30), criticos: criticos.slice(0, 30), nEsgotadosVendendo: esgotados.length, nCriticos: criticos.length };
                })(),
            });
        } catch (e) { console.error('TikTok overview:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    // Nome do comprador abreviado ("Ana L.") — o painel não precisa do nome completo.
    const nomeCurto = (nm) => { const p = String(nm || '').trim().split(/\s+/).filter(Boolean); if (!p.length) return null; const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); return p.length > 1 ? cap(p[0]) + ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.' : cap(p[0]); };
    const GRUPOS_TT = { aguardando: "('AWAITING_SHIPMENT','ON_HOLD')", transito: "('IN_TRANSIT','AWAITING_COLLECTION','PARTIALLY_SHIPPING')", entregue: "('DELIVERED','COMPLETED')", cancelado: "('CANCELLED')", naopago: "('UNPAID')" };
    const periodoTT = (req) => { const re = /^\d{4}-\d{2}-\d{2}$/; const { start, end } = req.query; if (!re.test(start || '') || !re.test(end || '') || start > end) return null; return { start, end, lo: "'" + start + " 00:00:00-03'", hi: "('" + end + " 00:00:00-03'::timestamptz + interval '1 day')" }; };

    app.get('/api/tiktok/orders', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        if (!requireTiktok(res)) return;
        try {
            const p = periodoTT(req); if (!p) return res.status(400).json({ error: 'período inválido' });
            const grupo = String(req.query.grupo || ''); if (grupo && !GRUPOS_TT[grupo]) return res.status(400).json({ error: 'filtro inválido' });
            const q = String(req.query.q || '').trim().slice(0, 40).replace(/[^0-9A-Za-zÀ-ÿ .-]/g, '');
            const page = Math.max(1, Math.min(2000, parseInt(req.query.page, 10) || 1));
            const shop = String(await tiktokShopId()).replace(/[^0-9]/g, '');
            const base = "o.shop_id='" + shop + "' and o.created_at >= " + p.lo + " and o.created_at < " + p.hi;
            let where = base + (grupo ? ' and o.status in ' + GRUPOS_TT[grupo] : '');
            if (q) where += /^\d{6,}$/.test(q) ? " and o.id_pedido like '%" + q + "%'" : " and o.buyer_name ilike '%" + q.replace(/[%_]/g, '') + "%'";
            const db = tiktok.db; const N = (v) => Math.round(Number(v) || 0);
            const [cnt, tot, rows] = await Promise.all([
                db.query("select case when status in " + GRUPOS_TT.aguardando + " then 'aguardando' when status in " + GRUPOS_TT.transito + " then 'transito' when status in " + GRUPOS_TT.entregue + " then 'entregue' when status in " + GRUPOS_TT.cancelado + " then 'cancelado' else 'naopago' end g, count(*) n from tiktok_orders o where " + base + " group by 1"),
                db.query("select count(*) n from tiktok_orders o where " + where),
                db.query("select o.id_pedido, to_char(o.created_at at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') dt, o.status, o.payment_status, o.payment_method, round(coalesce(o.total*100,0)) total, " +
                    "round(o.settlement_amount*100) repasse, o.buyer_name, o.buyer_phone, o.city, o.state, o.tracking_number, o.shipping_provider, o.items_count, it.product_name, it.sku_name, it.image_url " +
                    "from tiktok_orders o left join lateral (select product_name, sku_name, image_url from tiktok_order_items i where i.shop_id=o.shop_id and i.id_pedido=o.id_pedido limit 1) it on true where " + where + " order by o.created_at desc limit 10 offset " + ((page - 1) * 10)),
            ]);
            const contagem = { todos: 0 }; for (const r of cnt) { contagem[r.g] = N(r.n); contagem.todos += N(r.n); }
            res.json({ total: N(tot[0] && tot[0].n), page, contagem, pedidos: rows.map((r) => ({ id: r.id_pedido, dt: r.dt, status: r.status, pay_status: r.payment_status, metodo: r.payment_method || null, total: N(r.total),
                repasse: r.repasse == null ? null : N(r.repasse), cliente: nomeCurto(r.buyer_name), telefone: r.buyer_phone || null, cidade: [r.city, r.state].filter(Boolean).join(' / ') || null,
                rastreio: r.tracking_number || null, transportadora: r.shipping_provider || null, itens: N(r.items_count) || 1, produto: r.product_name || null, variacao: r.sku_name || null, img: r.image_url || null })) });
        } catch (e) { console.error('TikTok orders:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    app.get('/api/tiktok/products', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        if (!requireTiktok(res)) return;
        try {
            const p = periodoTT(req); if (!p) return res.status(400).json({ error: 'período inválido' });
            const shop = String(await tiktokShopId()).replace(/[^0-9]/g, '');
            const per = "o.shop_id='" + shop + "' and o.payment_status='paid' and o.created_at >= " + p.lo + " and o.created_at < " + p.hi;
            const db = tiktok.db; const N = (v) => Math.round(Number(v) || 0);
            const [prods, daily, tops] = await Promise.all([
                db.query("select coalesce(i.product_id,'0') id, max(i.product_name) title, coalesce(max(pr.image_url), max(i.image_url)) img, sum(i.qty)::int units, count(distinct i.id_pedido) pedidos, round(sum(i.price*i.qty)*100)::bigint gmv " +
                    "from tiktok_order_items i join tiktok_orders o on o.shop_id=i.shop_id and o.id_pedido=i.id_pedido left join tiktok_products pr on pr.shop_id=i.shop_id and pr.product_id=i.product_id where " + per + " group by 1 order by gmv desc limit 60"),
                db.query("select coalesce(i.product_id,'0') id, to_char((o.created_at at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') d, round(sum(i.price*i.qty)*100)::bigint v " +
                    "from tiktok_order_items i join tiktok_orders o on o.shop_id=i.shop_id and o.id_pedido=i.id_pedido where " + per + " group by 1,2"),
                db.query("select distinct on (id) id, sku_name, u from (select coalesce(i.product_id,'0') id, i.sku_name, sum(i.qty) u from tiktok_order_items i join tiktok_orders o on o.shop_id=i.shop_id and o.id_pedido=i.id_pedido where " + per + " group by 1,2) t order by id, u desc"),
            ]);
            const dias = []; for (let d = new Date(p.start + 'T12:00:00Z'); d <= new Date(p.end + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10));
            const serie = {}; for (const r of daily) { (serie[r.id] = serie[r.id] || {})[r.d] = N(r.v); }
            const topSku = {}; for (const r of tops) topSku[r.id] = r.sku_name;
            res.json({ dias: dias.length, produtos: prods.map((r) => ({ id: r.id, title: r.title || 'Produto', img: r.img || null, units: N(r.units), pedidos: N(r.pedidos), gmv: N(r.gmv), variacaoTop: topSku[r.id] || null,
                porDia: dias.length <= 120 ? dias.map((d) => (serie[r.id] || {})[d] || 0) : [] })) });
        } catch (e) { console.error('TikTok products:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    app.get('/api/tiktok/chat/customer', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        if (!requireTiktok(res)) return;
        const uid = String(req.query.user_id || ''); if (!/^\d{5,30}$/.test(uid)) return res.status(400).json({ error: 'cliente inválido' });
        try {
            const shop = String(await tiktokShopId()).replace(/[^0-9]/g, '');
            const db = tiktok.db; const N = (v) => Math.round(Number(v) || 0);
            const w = "o.shop_id='" + shop + "' and o.buyer_user_id='" + uid + "'";
            const [agg, last] = await Promise.all([
                db.query("select count(*) n, count(*) filter (where payment_status='paid') pagos, round(coalesce(sum(total*100) filter (where payment_status='paid'),0)) gasto, to_char(min(created_at) at time zone 'America/Sao_Paulo','DD/MM/YYYY') desde from tiktok_orders o where " + w),
                db.query("select o.id_pedido, to_char(o.created_at at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') dt, o.status, round(coalesce(o.total*100,0)) total, o.buyer_name, o.city, o.state, o.tracking_number, o.shipping_provider, it.product_name, it.sku_name, it.image_url " +
                    "from tiktok_orders o left join lateral (select product_name, sku_name, image_url from tiktok_order_items i where i.shop_id=o.shop_id and i.id_pedido=o.id_pedido limit 1) it on true where " + w + " order by o.created_at desc limit 3"),
            ]);
            const a = agg[0] || {}; const l = last[0];
            res.json({ pedidos: N(a.n), pagos: N(a.pagos), gasto: N(a.gasto), desde: a.desde || null, nome: l ? nomeCurto(l.buyer_name) : null, cidade: l ? [l.city, l.state].filter(Boolean).join(' / ') || null : null,
                ultimos: last.map((r) => ({ id: r.id_pedido, dt: r.dt, status: r.status, total: N(r.total), rastreio: r.tracking_number || null, transportadora: r.shipping_provider || null, produto: r.product_name || null, variacao: r.sku_name || null, img: r.image_url || null })) });
        } catch (e) { console.error('TikTok chat customer:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    // Insights (app 2): desempenho da loja, top produtos, top vídeos e criadores — com imagens. Cache de 10 min por período.
    const insightsCache = new Map();
    const productImages = async (ids) => {
        const uniq = [...new Set(ids.filter(Boolean).map(String))];
        const out = {};
        if (!uniq.length) return out;
        const list = uniq.map((x) => "'" + x.replace(/[^0-9]/g, '') + "'").join(',');
        const shop = await tiktokShopId();
        const known = await tiktok.db.query("select product_id, image_url, title from tiktok_products where shop_id='" + shop + "' and product_id in (" + list + ")");
        for (const r of known) out[r.product_id] = { img: r.image_url, title: r.title };
        const fromItems = await tiktok.db.query("select product_id, max(image_url) img, max(product_name) title from tiktok_order_items where shop_id='" + shop + "' and product_id in (" + list + ") and image_url is not null group by 1");
        for (const r of fromItems) if (!out[r.product_id] || !out[r.product_id].img) out[r.product_id] = { img: r.img, title: r.title };
        const missing = uniq.filter((id) => !out[id] || !out[id].img).slice(0, 40);
        await Promise.all(missing.map(async (id) => { try { const r = await tiktok.productInfo(shop, id); out[id] = { img: r.image_url, title: r.title }; } catch (e) { /* sem foto */ } }));
        return out;
    };
    app.get('/api/tiktok/insights', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        if (!tiktok2) return res.status(503).json({ error: 'app de Analytics não configurado' });
        try {
            const re = /^\d{4}-\d{2}-\d{2}$/; const { start, end } = req.query;
            if (!re.test(start || '') || !re.test(end || '') || start > end) return res.status(400).json({ error: 'período inválido' });
            const key = start + ':' + end, hit = insightsCache.get(key);
            if (hit && Date.now() - hit.at < 600000) return res.json(hit.data);
            const shop = await tiktokShopId();
            const endEx = new Date(new Date(end + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
            const [perf, daily, prods, vids] = await Promise.all([
                tiktok2.shopPerformance(shop, start, endEx, 'ALL').catch((e) => ({ erro: e.message })),
                tiktok2.shopPerformance(shop, start, endEx, '1D').catch(() => null),
                tiktok2.topProducts(shop, start, endEx, 10).catch(() => []),
                tiktok2.topVideos(shop, start, endEx, 50).catch(() => ({ videos: [], total: 0 })),
            ]);
            const lo = "'" + start + " 00:00:00-03'", hi = "('" + end + " 00:00:00-03'::timestamptz + interval '1 day')";
            const aff = await tiktok.db.query("select a.creator, count(distinct a.order_id) pedidos, sum(a.qty) unidades, round(sum(a.price*a.qty)*100) gmv, round(coalesce(sum(a.commission),0)*100) comissao, max(a.content_type) tipo " +
                "from tiktok_affiliate_orders a join tiktok_orders o on o.shop_id=a.shop_id and o.id_pedido=a.order_id and o.payment_status='paid' where a.shop_id='" + shop + "' and a.create_time >= " + lo + " and a.create_time < " + hi + " and a.creator is not null group by 1 order by gmv desc nulls last limit 1000");
            const affTot = await tiktok.db.query("select count(distinct a.order_id) pedidos, round(sum(a.price*a.qty)*100) gmv, round(coalesce(sum(a.commission),0)*100) comissao, count(distinct a.creator) criadores " +
                "from tiktok_affiliate_orders a join tiktok_orders o on o.shop_id=a.shop_id and o.id_pedido=a.order_id and o.payment_status='paid' where a.shop_id='" + shop + "' and a.create_time >= " + lo + " and a.create_time < " + hi);
            const affProd = await tiktok.db.query("select creator, product_id, count(*) n from tiktok_affiliate_orders where shop_id='" + shop + "' and create_time >= " + lo + " and create_time < " + hi + " and creator is not null group by 1,2");
            const perfis = {}; for (const r of await tiktok.db.query("select username, nickname, avatar_url, followers from tiktok_creators where shop_id='" + shop + "'")) perfis[r.username] = r;
            const topProdOfCreator = {}; for (const r of affProd) { const c = topProdOfCreator[r.creator]; if (!c || Number(r.n) > c.n) topProdOfCreator[r.creator] = { id: r.product_id, n: Number(r.n) }; }
            const imgs = await productImages([...prods.map((p) => p.id), ...vids.videos.flatMap((v) => (v.products || []).map((p) => p.id)), ...Object.values(topProdOfCreator).map((x) => x.id)]);
            const cents = (m) => Math.round((Number(m && m.amount) || 0) * 100);
            const iv = perf && perf.performance && perf.performance.intervals && perf.performance.intervals[0];
            const brk = (arr) => Object.fromEntries((arr || []).map((x) => [x.type, x.currency ? Math.round(Number(x.amount) * 100) : Number(x.amount)]));
            const N = (v) => Math.round(Number(v) || 0);
            const data = {
                shop: iv ? {
                    gmv: cents(iv.gmv), orders: N(iv.orders), units: N(iv.units_sold), visitors: N(iv.avg_product_page_visitors), buyers: N(iv.buyers), pageViews: N(iv.product_page_views), impressions: N(iv.product_impressions),
                    ticket: cents(iv.avg_order_value), refunds: cents(iv.refunds), cancellations: N(iv.cancellations_and_returns),
                    conversao: iv.product_page_views ? Math.round(N(iv.orders) / N(iv.product_page_views) * 10000) / 100 : 0,
                    gmvPor: brk(iv.gmv_breakdowns), viewsPor: brk(iv.product_page_view_breakdowns), imprPor: brk(iv.product_impression_breakdowns),
                } : null,
                disponivelAte: perf && perf.latest_available_date || null,
                porDia: ((daily && daily.performance && daily.performance.intervals) || []).reduce((o, x) => { o[x.start_date] = cents(x.gmv); return o; }, {}),
                porDiaVisitas: ((daily && daily.performance && daily.performance.intervals) || []).reduce((o, x) => { o[x.start_date] = { visitantes: N(x.avg_product_page_visitors), pedidos: N(x.orders), compradores: N(x.buyers), views: N(x.product_page_views) }; return o; }, {}),
                produtos: prods.map((p) => ({ id: String(p.id), title: (imgs[String(p.id)] || {}).title || 'Produto', img: (imgs[String(p.id)] || {}).img || null, gmv: cents(p.gmv), orders: N(p.orders), units: N(p.units_sold), ctr: Math.round(Number(p.click_through_rate || 0) * 10000) / 100 })),
                videos: vids.videos.map((v) => { const pid = v.products && v.products[0] && String(v.products[0].id); return { id: String(v.id), title: v.title || '', user: v.username || '', views: N(v.views), gmv: cents(v.gmv), units: N(v.units_sold), ctr: Math.round(Number(v.click_through_rate || 0) * 10000) / 100, postado: v.video_post_time || null, produto: pid ? ((imgs[pid] || {}).title || (v.products[0].name || '')) : '', img: pid ? (imgs[pid] || {}).img || null : null, url: 'https://www.tiktok.com/@' + encodeURIComponent(v.username || '') + '/video/' + v.id }; }),
                totalVideos: vids.total,
                afiliados: { total: affTot[0] ? { pedidos: N(affTot[0].pedidos), gmv: N(affTot[0].gmv), comissao: N(affTot[0].comissao), criadores: N(affTot[0].criadores) } : null,
                    criadores: aff.map((c) => { const tp = topProdOfCreator[c.creator]; const pf = perfis[c.creator] || {}; return { user: c.creator, nome: pf.nickname || '', avatar: pf.avatar_url || null, seguidores: pf.followers != null ? N(pf.followers) : null, pedidos: N(c.pedidos), unidades: N(c.unidades), gmv: N(c.gmv), comissao: N(c.comissao), tipo: c.tipo, img: tp ? (imgs[tp.id] || {}).img || null : null, produto: tp ? (imgs[tp.id] || {}).title || '' : '', url: 'https://www.tiktok.com/@' + encodeURIComponent(c.creator) }; }) },
                erro: perf && perf.erro ? String(perf.erro).slice(0, 120) : null,
            };
            insightsCache.set(key, { at: Date.now(), data });
            res.json(data);
        } catch (e) { console.error('TikTok insights:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    // Vídeos (e LIVEs) de um criador que mais venderam no período — a partir das vendas de afiliado (só pedidos pagos).
    app.get('/api/tiktok/creator-videos', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        if (!tiktok) return res.status(503).json({ error: 'indisponível' });
        try {
            const re = /^\d{4}-\d{2}-\d{2}$/; const { start, end } = req.query; const creator = String(req.query.creator || '');
            if (!re.test(start || '') || !re.test(end || '') || start > end || !/^[A-Za-z0-9._]{1,40}$/.test(creator)) return res.status(400).json({ error: 'parâmetros inválidos' });
            const shop = await tiktokShopId();
            const lo = "'" + start + " 00:00:00-03'", hi = "('" + end + " 00:00:00-03'::timestamptz + interval '1 day')";
            const rows = await tiktok.db.query("select a.content_id, max(a.content_type) tipo, count(distinct a.order_id) pedidos, sum(a.qty) unidades, round(sum(a.price*a.qty)*100) gmv, round(coalesce(sum(a.commission),0)*100) comissao, " +
                "(array_agg(a.product_id order by a.price desc))[1] produto, min(a.create_time) primeira, max(a.create_time) ultima " +
                "from tiktok_affiliate_orders a join tiktok_orders o on o.shop_id=a.shop_id and o.id_pedido=a.order_id and o.payment_status='paid' " +
                "where a.shop_id='" + shop + "' and a.creator='" + creator + "' and a.create_time >= " + lo + " and a.create_time < " + hi + " group by 1 order by gmv desc nulls last limit 60");
            const imgs = await productImages(rows.map((r) => r.produto));
            const N = (v) => Math.round(Number(v) || 0);
            const fmt = (t) => t ? new Date(t).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }) : '';
            res.json({
                creator,
                perfil: 'https://www.tiktok.com/@' + encodeURIComponent(creator),
                videos: rows.map((r) => {
                    const live = r.tipo === 'LIVE', ok = /^\d{5,30}$/.test(String(r.content_id || ''));
                    return { id: r.content_id, tipo: live ? 'LIVE' : (r.tipo === 'VIDEO' ? 'VIDEO' : (r.tipo || 'OUTRO')), pedidos: N(r.pedidos), unidades: N(r.unidades), gmv: N(r.gmv), comissao: N(r.comissao),
                        produto: (imgs[r.produto] || {}).title || '', img: (imgs[r.produto] || {}).img || null, periodo: fmt(r.primeira) + (fmt(r.primeira) !== fmt(r.ultima) ? ' – ' + fmt(r.ultima) : ''),
                        url: !live && ok ? 'https://www.tiktok.com/@' + encodeURIComponent(creator) + '/video/' + r.content_id : 'https://www.tiktok.com/@' + encodeURIComponent(creator) };
                }),
            });
        } catch (e) { console.error('TikTok creator-videos:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    // Atendimento (chat do TikTok Shop) via app 2.
    app.get('/api/tiktok/chat/conversations', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        if (!tiktok2) return res.status(503).json({ error: 'indisponível' });
        try { res.json(await tiktok2.chatConversations(await tiktokShopId(), typeof req.query.page_token === 'string' ? req.query.page_token : '')); }
        catch (e) { console.error('TikTok chat conv:', e.message); res.status(500).json({ error: 'não consegui carregar as conversas' }); }
    });
    app.get('/api/tiktok/chat/messages', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        if (!tiktok2) return res.status(503).json({ error: 'indisponível' });
        const id = String(req.query.conversation_id || ''); if (!/^\d{5,30}$/.test(id)) return res.status(400).json({ error: 'conversa inválida' });
        try { res.json(await tiktok2.chatMessages(await tiktokShopId(), id)); }
        catch (e) { console.error('TikTok chat msgs:', e.message); res.status(500).json({ error: 'não consegui carregar as mensagens' }); }
    });
    app.post('/api/tiktok/chat/send', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        if (!tiktok2) return res.status(503).json({ error: 'indisponível' });
        const id = String((req.body && req.body.conversation_id) || ''), text = String((req.body && req.body.text) || '').trim();
        if (!/^\d{5,30}$/.test(id) || !text || text.length > 2000) return res.status(400).json({ error: 'mensagem inválida' });
        try { res.json(await tiktok2.chatSend(await tiktokShopId(), id, text)); }
        catch (e) { console.error('TikTok chat send:', e.message); res.status(500).json({ error: 'não consegui enviar' }); }
    });

    // Webhook do TikTok Shop (ORDER_STATUS_CHANGE etc.): assinatura HMAC no header Authorization; responde 200 rápido.
    app.post('/tiktok/webhook', async (req, res) => {
        if (!tiktok) return res.sendStatus(503);
        const raw = req.rawBody || '';
        if (!raw || !(tiktok.verifyWebhook(raw, req.headers['authorization']) || (tiktok2 && tiktok2.verifyWebhook(raw, req.headers['authorization'])))) { tkLog({ step: 'webhook-assinatura-invalida' }); return res.sendStatus(401); }
        res.sendStatus(200);
        try { const r = await tiktok.handleWebhook(req.body); tkLog({ step: 'webhook', type: req.body && req.body.type, ...r }); }
        catch (e) { console.error('TikTok webhook:', e.message); tkLog({ step: 'webhook-erro', erro: String(e.message).slice(0, 200) }); }
    });

    // Sync automático do TikTok: 2 min após subir e a cada 6h (últimos 7 dias por atualização).
    if (tiktok) {
        const runTikTokSync = async () => {
            try {
                const shop = await tiktokShopId(); if (!shop) return;
                const to = Math.floor(Date.now() / 1000);
                console.log('🎵 sync TikTok:', JSON.stringify(await tiktok.sync(shop, to - 7 * 86400, to, 'update_time')));
                if (tiktok2) {
                    try {
                        const velhos = await tiktok.db.query("select a.creator from tiktok_affiliate_orders a left join tiktok_creators c on c.shop_id=a.shop_id and c.username=a.creator " +
                            "where a.shop_id='" + shop + "' and a.creator is not null and a.create_time > now() - interval '90 days' group by a.creator " +
                            "having max(c.updated_at) is null or max(c.updated_at) < now() - interval '20 hours' order by sum(a.price*a.qty) desc limit 400");
                        const users = velhos.map((r) => r.creator).filter((u) => /^[A-Za-z0-9._]{1,40}$/.test(u));
                        if (users.length) tiktok2.syncCreatorProfiles(shop, users).then((r) => { console.log('🎵 perfis criadores:', JSON.stringify(r)); insightsCache.clear(); }).catch((e) => console.error('perfis criadores falhou:', e.message));
                    } catch (e) { console.error('perfis criadores falhou:', e.message); }
                }
                if (tiktok2) { try { console.log('🎵 sync afiliados:', JSON.stringify(await tiktok2.syncAffiliate(shop, to - 7 * 86400, to))); } catch (e) { console.error('sync afiliados falhou:', e.message); } }
            } catch (e) { console.error('sync TikTok falhou:', e.message); }
        };
        setTimeout(runTikTokSync, 120000);
        setInterval(runTikTokSync, 6 * 60 * 60 * 1000);
    }

    // --- Robô WhatsApp (consulta de dados da Cacife) ---
    const { resolvePeriod } = require('./bot-period');
    const { isAllowed } = require('./bot-gate');
    const { parseInbound, sendText } = require('./bot-wa');
    const { overview, topProducts, productSales } = require('./bot-data');
    const { fmtOverview, toWhatsApp } = require('./bot-format');
    const { guardSelect } = require('./bot-sql');
    const { makeChat } = require('./bot-openrouter');
    const { answer } = require('./bot-brain');

    const BOT = {
        model: process.env.BOT_MODEL || 'google/gemini-2.0-flash-001',
        openrouterKey: process.env.OPENROUTER_KEY || '',
        uazapi: { serverUrl: process.env.UAZAPI_SERVER_URL || '', token: process.env.UAZAPI_TOKEN || '' },
        webhookSecret: process.env.BOT_WEBHOOK_SECRET || '',
        nsToken: process.env.NUVEMSHOP_TOKEN || '',
        nsStore: process.env.NUVEMSHOP_STORE_ID || '1081093',
        allowed: process.env.BOT_ALLOWED_NUMBER || '11938034714',
    };
    const botReady = Boolean(BOT.openrouterKey && BOT.uazapi.token && BOT.webhookSecret);
    if (botReady) console.log('💬 Robô WhatsApp ligado (modelo ' + BOT.model + ')');
    else console.log('💬 Robô WhatsApp: aguardando OPENROUTER_KEY / UAZAPI_TOKEN / BOT_WEBHOOK_SECRET no ambiente.');

    const botShopeeRest = async (q) => {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
        if (!r.ok) throw new Error(`Supabase ${r.status}`);
        return r.json();
    };
    // Roda a consulta sob o papel read-only bot_ro (só SELECT nas 4 tabelas; SET LOCAL reseta no commit).
    const botPgQuery = async (sql) => {
        const wrapped = `begin; set local role bot_ro; ${sql}; commit`;
        const r = await fetch(`${SUPABASE_URL}/pg/query`, { method: 'POST', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: wrapped }), signal: AbortSignal.timeout(15000) });
        if (!r.ok) {
            let msg = `HTTP ${r.status}`;
            try { const j = await r.json(); msg = (j && (j.message || j.error)) || msg; } catch (e) {}
            throw new Error(String(msg).replace(/\s+/g, ' ').slice(0, 200));
        }
        return r.json();
    };
    const botChat = BOT.openrouterKey ? makeChat({ apiKey: BOT.openrouterKey }) : null;

    const parsePeriodArg = (p) => {
        if (typeof p === 'string' && p.includes(':')) { const [from, to] = p.split(':'); return { from, to }; }
        return p;
    };
    const botDeps = { shopeeRest: botShopeeRest, pgQuery: botPgQuery };
    const chSummary = (ov) => Object.fromEntries(Object.entries(ov.channels).map(([k, v]) => [k, v.error ? 'erro' : v.orders + 'ped']));
    const botTools = {
        resumo_geral: async ({ period }) => {
            const t0 = Date.now();
            const ov = await overview(botDeps, resolvePeriod(parsePeriodArg(period)));
            pushDebug({ step: 'tool', tool: 'resumo_geral', period: ov.period.label, ms: Date.now() - t0, canais: chSummary(ov) });
            return fmtOverview(ov);
        },
        resumo_canal: async ({ canal, period }) => {
            const t0 = Date.now();
            const ov = await overview(botDeps, resolvePeriod(parsePeriodArg(period)));
            pushDebug({ step: 'tool', tool: 'resumo_canal:' + canal, period: ov.period.label, ms: Date.now() - t0, canais: chSummary(ov) });
            const f = fmtOverview(ov);
            return { periodo: f.periodo, canal, ...(f.canais[canal] || { erro: true }) };
        },
        top_produtos: async ({ canal, period, limite }) => {
            const t0 = Date.now();
            const per = resolvePeriod(parsePeriodArg(period));
            const canais = canal ? [canal] : ['shopee', 'mercadolivre', 'nuvemshop'];
            const top = {};
            await Promise.all(canais.map(async (c) => {
                try { top[c] = await topProducts(botDeps, per, c, limite || 3); }
                catch (e) { console.error('top_produtos ' + c + ':', e.message); top[c] = { erro: true }; }
            }));
            pushDebug({ step: 'tool', tool: 'top_produtos', period: per.label, ms: Date.now() - t0, canais: canais.join(',') });
            return { periodo: per.label, top };
        },
        vendas_produto: async ({ produto, canal, period, limite }) => {
            const t0 = Date.now();
            const per = resolvePeriod(parsePeriodArg(period));
            const canais = canal ? [canal] : ['shopee', 'mercadolivre', 'nuvemshop'];
            const resultado = {};
            await Promise.all(canais.map(async (c) => {
                try { resultado[c] = await productSales(botDeps, per, c, produto, limite || 5); }
                catch (e) { console.error('vendas_produto ' + c + ':', e.message); resultado[c] = { erro: true }; }
            }));
            pushDebug({ step: 'tool', tool: 'vendas_produto', period: per.label, ms: Date.now() - t0, produto: String(produto || '').slice(0, 40), canais: canais.join(',') });
            return { periodo: per.label, busca: produto, resultado };
        },
        consulta_banco: async ({ sql }) => {
            const t0 = Date.now();
            let safe;
            try { safe = guardSelect(sql, 200); }
            catch (e) { pushDebug({ step: 'tool', tool: 'consulta_banco', erro: e.message }); return { erro: e.message }; }
            try {
                const rows = await botPgQuery(safe);
                const arr = Array.isArray(rows) ? rows : [];
                pushDebug({ step: 'tool', tool: 'consulta_banco', ms: Date.now() - t0, linhas: arr.length, sql: safe.slice(0, 160) });
                return { linhas: arr.slice(0, 100) };
            } catch (e) {
                console.error('consulta_banco:', e.message);
                pushDebug({ step: 'tool', tool: 'consulta_banco', erro: String(e.message).slice(0, 200), sql: safe.slice(0, 160) });
                // devolve o motivo (sem dados sensíveis) para a IA poder corrigir a consulta na próxima tentativa
                return { erro: 'a consulta falhou no banco: ' + String(e.message).slice(0, 160) + '. Corrija o SQL e tente de novo.' };
            }
        },
        perguntas_ml: async () => {
            const t0 = Date.now();
            try {
                const token = await getMLToken();
                if (!token) return { erro: 'Mercado Livre não conectado' };
                const { data } = await axios.get(`https://api.mercadolibre.com/my/received_questions/search?seller_id=${ML_USER_ID}&status=UNANSWERED&limit=1`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
                const n = (data && (data.total != null ? data.total : (data.paging && data.paging.total))) || 0;
                pushDebug({ step: 'tool', tool: 'perguntas_ml', ms: Date.now() - t0, pendentes: n });
                return { perguntas_sem_resposta: n };
            } catch (e) { console.error('perguntas_ml:', e.message); return { erro: 'não consegui consultar o Mercado Livre' }; }
        },
        chat_shopee: async () => {
            const t0 = Date.now();
            try {
                if (!shopee) return { erro: 'Shopee não conectada' };
                const shop = await shopeeShopId();
                if (!shop) return { erro: 'Shopee não conectada' };
                const data = await shopee.chatConversations(shop, { pageSize: 50 });
                const list = (data && data.conversations) || [];
                let aguardando = 0, naoLidas = 0;
                for (const c of list) { const u = Number(c.unread_count || 0); if (u > 0) { aguardando++; naoLidas += u; } }
                pushDebug({ step: 'tool', tool: 'chat_shopee', ms: Date.now() - t0, aguardando });
                return { conversas: list.length, aguardando_resposta: aguardando, mensagens_nao_lidas: naoLidas };
            } catch (e) { console.error('chat_shopee:', e.message); return { erro: 'não consegui consultar o chat da Shopee' }; }
        },
    };

    const botMemory = []; // últimas trocas (só o número autorizado)
    const botDebug = []; // diagnóstico temporário (últimos eventos)
    const botRaw = []; // corpo cru (temporário, para achar o campo do telefone)
    const pushDebug = (o) => { botDebug.push({ at: new Date().toISOString(), ...o }); if (botDebug.length > 40) botDebug.shift(); };
    const pushRaw = (b) => { try { botRaw.push(b && b.message ? b.message : b); } catch (e) {} if (botRaw.length > 6) botRaw.shift(); };
    app.post('/api/bot/whatsapp', async (req, res) => {
        if (!botReady) return res.sendStatus(503);
        const secret = req.headers['x-webhook-secret'] || req.query.secret || '';
        if (!timingEq(String(secret), BOT.webhookSecret)) { pushDebug({ step: 'secret-ruim' }); return res.sendStatus(401); }
        const inbound = parseInbound(req.body);
        res.sendStatus(200); // responde já ao Uazapi; processa em background
        pushRaw(req.body);
        const allowed = Boolean(inbound && !inbound.isGroup && isAllowed(inbound.phone, BOT.allowed));
        if (!(inbound && inbound.isGroup)) pushDebug({ step: 'recebido', eventType: req.body && req.body.EventType, phone: inbound && inbound.phone, isGroup: inbound && inbound.isGroup, text: inbound && inbound.text, parsed: Boolean(inbound), allowed });
        if (!allowed) return;
        try {
            const reply = toWhatsApp(await answer({ chat: botChat, tools: botTools, model: BOT.model, history: botMemory.slice(-6), text: inbound.text }));
            botMemory.push({ role: 'user', content: inbound.text }, { role: 'assistant', content: reply });
            if (botMemory.length > 12) botMemory.splice(0, botMemory.length - 12);
            await sendText(BOT.uazapi, inbound.phone, reply); // responde no telefone real (com DDI)
            pushDebug({ step: 'respondido', reply: reply.slice(0, 120) });
        } catch (e) { console.error('bot whatsapp:', e.message); pushDebug({ step: 'erro', erro: e.message }); }
    });
    app.get('/api/bot/debug', (req, res) => {
        if (!adminOk(req.query.key || req.headers['x-admin-token'])) return res.sendStatus(401);
        res.json({ botReady, model: BOT.model, allowed: BOT.allowed, events: botDebug, raw: req.query.raw ? botRaw : undefined });
    });

    // --- Health Check ---
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok', service: 'Cacife Dashboard with Proxy' });
    });

    // --- Servir Arquivos Estáticos do Dashboard ---
    // Fazemos isso ANTES do proxy para que as rotas locais tenham prioridade
    app.use(express.static(__dirname));

    // --- Proxy Reverso Híbrido para Chatwoot ---
    // Todas as rotas que não foram capturadas acima serão enviadas ao Chatwoot
    app.use('/', createProxyMiddleware({
        target: process.env.CHATWOOT_URL,
        changeOrigin: true,
        ws: true, // Suporte a WebSockets
        onProxyRes: (proxyRes) => {
            // Remove headers restritivos de segurança para permitir o Iframe
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['content-security-policy-report-only'];

            // Adiciona permissões
            proxyRes.headers['X-Frame-Options'] = 'ALLOWALL';
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        },
        onError: (err, req, res) => {
            console.error('❌ Erro no Proxy:', err.message);
            res.status(500).send('Erro ao conectar com o servidor de chat');
        }
    }));

    // Iniciar o servidor
    app.listen(PORT, () => {
        console.log('--------------------------------------------------');
        console.log(`✅ Servidor Rodando na Porta: ${PORT}`);
        console.log(`🌍 Dashboard: http://localhost:${PORT}`);
        console.log(`💬 Chatwoot Tunnel: ${process.env.CHATWOOT_URL}`);
        console.log('--------------------------------------------------');
    });

} catch (e) {
    console.error('❌ CRITICAL ERROR during server definition:', e);
    process.exit(1);
}

// Global Error Handlers
process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err);
    process.exit(1); // Force restart on critical error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('� Unhandled Rejection at:', promise, 'reason:', reason);
});
