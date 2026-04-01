require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

try {
    const app = express();
    app.set('trust proxy', 1);

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
