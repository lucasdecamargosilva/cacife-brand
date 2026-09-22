require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

try {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());

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
    let tiktok = null;
    if (TIKTOK_APP_KEY && TIKTOK_APP_SECRET) {
        try {
            tiktok = new TikTokProd({ appKey: TIKTOK_APP_KEY, appSecret: TIKTOK_APP_SECRET, serviceId: TIKTOK_SERVICE_ID, db: tiktokDb({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_KEY }) });
            console.log('🎵 TikTok Shop ligado (service ' + TIKTOK_SERVICE_ID + ')');
        } catch (e) { console.error('TikTok init falhou:', e.message); }
    } else { console.log('🎵 TikTok Shop: aguardando TIKTOK_APP_KEY / TIKTOK_APP_SECRET no ambiente.'); }
    const requireTiktok = (res) => { if (!tiktok) { res.status(503).json({ error: 'TikTok ainda não configurado no servidor.' }); return false; } return true; };

    app.get('/tiktok/connect', (req, res) => {
        if (!requireTiktok(res)) return;
        if (!adminOk(req.query.key || req.headers['x-admin-token'])) return res.status(401).send('não autorizado');
        res.set('Referrer-Policy', 'no-referrer');
        const flow = crypto.randomBytes(16).toString('hex');
        res.cookie('tiktok_flow', flow, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 10 * 60000 });
        res.redirect(tiktok.authUrl(flow));
    });
    app.get('/tiktok/callback', async (req, res) => {
        try {
            if (!tiktok) return res.status(503).send('TikTok não configurado.');
            const cookie = readCookie(req, 'tiktok_flow');
            const state = req.query.state;
            if (!cookie || typeof state !== 'string' || state.length !== cookie.length || !timingEq(state, cookie)) return res.status(400).send('Autorização inválida ou expirada. Comece de novo em /tiktok/connect.');
            const code = req.query.code || req.query.auth_code;
            if (typeof code !== 'string' || !code || code.length > 2048) return res.status(400).send('Retorno inválido do TikTok.');
            res.clearCookie('tiktok_flow');
            const r = await tiktok.exchange(code);
            res.redirect('/metricas.html?tiktok=conectado&lojas=' + (r.shops?.length || 0));
        } catch (e) { console.error('TikTok callback:', e.message); res.status(500).send('Falha ao conectar a loja. Tente novamente em /tiktok/connect.'); }
    });
    app.get('/api/tiktok/status', async (req, res) => {
        if (!(await requireViewer(req, res))) return;
        try { res.json(tiktok ? await tiktok.status() : { configured: false, shops: [] }); }
        catch (e) { console.error('TikTok status:', e); res.status(500).json({ error: 'erro interno' }); }
    });

    // --- Robô WhatsApp (consulta de dados da Cacife) ---
    const { resolvePeriod } = require('./bot-period');
    const { isAllowed } = require('./bot-gate');
    const { parseInbound, sendText } = require('./bot-wa');
    const { overview } = require('./bot-data');
    const { makeMlFetch, makeNsFetch } = require('./bot-fetchers');
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
    const botMlFetch = makeMlFetch({ getMlToken: getMLToken, mlUserId: ML_USER_ID });
    const botNsFetch = makeNsFetch({ token: BOT.nsToken, storeId: BOT.nsStore });
    const botChat = BOT.openrouterKey ? makeChat({ apiKey: BOT.openrouterKey }) : null;

    const parsePeriodArg = (p) => {
        if (typeof p === 'string' && p.includes(':')) { const [from, to] = p.split(':'); return { from, to }; }
        return p;
    };
    const botDeps = { shopeeRest: botShopeeRest, mlFetch: botMlFetch, nsFetch: botNsFetch };
    const botTools = {
        resumo_geral: async ({ period }) => overview(botDeps, resolvePeriod(parsePeriodArg(period))),
        resumo_canal: async ({ canal, period }) => {
            const ov = await overview(botDeps, resolvePeriod(parsePeriodArg(period)));
            return { canal, ...(ov.channels[canal] || { error: true }), period: ov.period };
        },
    };

    const botMemory = []; // últimas trocas (só o número autorizado)
    const botDebug = []; // diagnóstico temporário (últimos eventos)
    const botRaw = []; // corpo cru (temporário, para achar o campo do telefone)
    const pushDebug = (o) => { botDebug.push({ at: new Date().toISOString(), ...o }); if (botDebug.length > 15) botDebug.shift(); };
    const pushRaw = (b) => { try { botRaw.push(b && b.message ? b.message : b); } catch (e) {} if (botRaw.length > 6) botRaw.shift(); };
    app.post('/api/bot/whatsapp', async (req, res) => {
        if (!botReady) return res.sendStatus(503);
        const secret = req.headers['x-webhook-secret'] || req.query.secret || '';
        if (!timingEq(String(secret), BOT.webhookSecret)) { pushDebug({ step: 'secret-ruim' }); return res.sendStatus(401); }
        const inbound = parseInbound(req.body);
        res.sendStatus(200); // responde já ao Uazapi; processa em background
        pushRaw(req.body);
        const allowed = Boolean(inbound && !inbound.isGroup && isAllowed(inbound.phone, BOT.allowed));
        pushDebug({ step: 'recebido', eventType: req.body && req.body.EventType, phone: inbound && inbound.phone, isGroup: inbound && inbound.isGroup, text: inbound && inbound.text, parsed: Boolean(inbound), allowed });
        if (!allowed) return;
        try {
            const reply = await answer({ chat: botChat, tools: botTools, model: BOT.model, history: botMemory.slice(-6), text: inbound.text });
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
