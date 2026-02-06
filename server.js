const express = require('express');
const axios = require('axios');
const path = require('path');

// Logs iniciais para debug
console.log('##################################################');
console.log('🚀 Starting Server Initialization...');
console.log(`⌚ Time: ${new Date().toISOString()}`);
console.log('##################################################');

try {
    const app = express();
    app.set('trust proxy', 1);

    const PORT = process.env.PORT || 3000;
    console.log(`ℹ️ Environment PORT: ${process.env.PORT}`);
    console.log(`ℹ️ Selected Configured Port: ${PORT}`);

    // Middleware Global de Logs
    app.use((req, res, next) => {
        console.log(`📝 [${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}`);
        next();
    });

    // Configuração de CORS
    const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ['http://localhost:3000', 'http://72.61.128.136:3000'];

    console.log('ℹ️ Allowed Origins configured:', ALLOWED_ORIGINS);

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

    // --- Chatwoot SSO Integration ---
    const CHATWOOT_URL = process.env.CHATWOOT_URL || 'https://chatwoot.segredosdodrop.com';
    const PLATFORM_TOKEN = process.env.PLATFORM_TOKEN;

    app.get('/api/chatwoot/sso', async (req, res) => {
        try {
            if (!PLATFORM_TOKEN) {
                console.error('❌ CHATWOOT_PLATFORM_TOKEN is not configured in environment variables');
                return res.status(500).json({ success: false, error: 'Configuração do servidor incompleta' });
            }

            // Nota: Em um cenário real, você pegaria o userId do usuário logado na sessão.
            // Por enquanto, usaremos o ID 11 conforme solicitado.
            const userId = 11;
            const accountId = 4;

            console.log(`🔗 Generating SSO link for user ${userId} (Account ${accountId}) at ${CHATWOOT_URL}`);

            const response = await axios.get(
                `${CHATWOOT_URL}/platform/api/v1/users/${userId}/login`,
                {
                    headers: {
                        'api_access_token': PLATFORM_TOKEN
                    }
                }
            );

            // Adiciona o redirecionamento para a conta específica na URL de SSO
            let ssoUrl = response.data.url;
            if (ssoUrl) {
                const separator = ssoUrl.includes('?') ? '&' : '?';
                ssoUrl += `${separator}redirect_url=/app/accounts/${accountId}/dashboard`;
            }

            res.json({
                success: true,
                ssoUrl: ssoUrl
            });
        } catch (error) {
            console.error('❌ Error generating Chatwoot SSO:', error.response?.data || error.message);
            res.status(500).json({
                success: false,
                error: 'Falha ao gerar link de acesso ao Chatwoot'
            });
        }
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
        console.log('❤️ Health check passed');
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'Cacife Brand - Dashboard (No Chatwoot)'
        });
    });

    // Servir arquivos estáticos (Frontend)
    console.log(`📂 Configuring static file serving from: ${__dirname}`);
    app.use(express.static(__dirname));

    // Iniciar o servidor
    app.listen(PORT, (err) => {
        if (err) {
            console.error('❌ FATAL ERROR starting server:', err);
            process.exit(1);
        }
        console.log('--------------------------------------------------');
        console.log(`✅ Server is running successfully!`);
        console.log(`🌍 Listening on port: ${PORT}`);
        console.log(`🏠 Local URL: http://localhost:${PORT}`);
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
