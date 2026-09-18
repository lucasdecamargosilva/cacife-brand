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
        catch (e) { console.error('Shopee status:', e.message); res.status(500).json({ error: e.message }); }
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
        } catch (e) { console.error('Shopee sync:', e.message); res.status(500).json({ error: e.message }); }
    });

    app.get('/api/shopee/orders', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            if (!requireShopee(res)) return;
            res.json({ environment: 'production', orders: await shopee.db.listOrders(req.query.shopId ? Number(req.query.shopId) : undefined) });
        } catch (e) { console.error('Shopee orders:', e.message); res.status(500).json({ error: e.message }); }
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
