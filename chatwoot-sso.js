// backend/chatwoot-sso.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

const CHATWOOT_URL = 'https://chatwoot.segredosdodrop.com'; // Sua URL do Chatwoot
const PLATFORM_TOKEN = 'AXGGMhrWkqRShtLGFSSJyepr'; // Token do Platform App

// Endpoint para gerar SSO link
router.get('/chatwoot/sso/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        const response = await axios.get(
            `${CHATWOOT_URL}/platform/api/v1/users/${userId}/login`,
            {
                headers: {
                    'api_access_token': PLATFORM_TOKEN
                }
            }
        );

        let ssoUrl = response.data.url;
        // Se houver um accountId na query, redireciona para ele
        if (req.query.accountId) {
            ssoUrl += `&redirect_to=/app/accounts/${req.query.accountId}/dashboard`;
        }

        // Retorna a URL de SSO
        res.json({
            success: true,
            ssoUrl: ssoUrl
        });
    } catch (error) {
        console.error('Erro ao gerar SSO:', error);
        res.status(500).json({
            success: false,
            error: 'Falha ao gerar link SSO'
        });
    }
});

module.exports = router;
