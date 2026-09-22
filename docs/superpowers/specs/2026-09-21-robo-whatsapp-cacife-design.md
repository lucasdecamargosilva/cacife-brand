# Robô WhatsApp — consulta de dados da Cacife

**Data:** 2026-09-21
**Autor:** Lucas + Claude

## Objetivo

Um robô no WhatsApp (instância Uazapi `quantic.uazapi.com`) que responde perguntas
em texto livre sobre os dados de vendas da Cacife, cruzando **todos os canais
conectados** (Shopee, Mercado Livre, Nuvemshop; TikTok quando conectar).

O robô **só responde ao número `11938034714`**. Qualquer outro remetente é ignorado
(sem resposta). Ele apenas **lê** dados e envia texto para esse único número — nunca
executa ações destrutivas nem mensageia terceiros.

## Decisões tomadas (brainstorm)

1. **Cérebro:** IA com texto livre (não comandos fixos).
2. **Motor:** OpenRouter, modelo `google/gemini-2.0-flash-001` (barato, rápido, bom em
   tool-calling). Trocável por um campo de config.
3. **Onde roda:** produção (`server.js` em `cacife.quanticsolutions.com.br`), que já é
   público e já tem Shopee. ML e Nuvemshop passam a ser consultados **ao vivo** pela
   produção (reaproveitando a lógica que hoje existe só no local).

## Arquitetura

```
WhatsApp → Uazapi → webhook POST /api/bot/whatsapp (produção)
   → valida segredo do webhook + confere remetente == 11938034714
   → bot-brain: OpenRouter (modelo) com "tools"
        ├─ tool resumo_geral(period)      → bot-data
        ├─ tool resumo_canal(canal, period)
        ├─ tool top_produtos(canal, period)
        └─ tool pedidos_recentes(canal, limite)
   → resposta em texto → Uazapi POST /send/text → WhatsApp do usuário
```

### Componentes (unidades isoladas)

- **`bot-data.js`** — camada de dados, uma função por consulta. Não sabe de IA nem de
  WhatsApp. Entrada: canal + período. Saída: números normalizados (centavos).
  - Shopee: lê do Supabase (`shopee_orders`, já existe).
  - Mercado Livre: API do ML (token em `ml_tokens`), resumido via `ml-core.js`.
  - Nuvemshop: API da NS (loja `1081093`, credenciais movidas para env de produção),
    resumido via `ns-core.js`.
  - Períodos: hoje, ontem, 7d, 30d, mês atual, intervalo de datas. Fuso `-03:00`.
- **`bot-brain.js`** — orquestra a conversa com OpenRouter: system prompt, definição das
  tools, laço de tool-calling, montagem da resposta final. Limite de tokens/iterações
  por mensagem para controlar custo. Não sabe de WhatsApp (recebe texto, devolve texto).
- **Rota `/api/bot/whatsapp`** em `server.js` — recebe o webhook do Uazapi, valida
  segredo, confere remetente, chama `bot-brain`, envia a resposta via Uazapi. Sempre
  responde 200 ao Uazapi (mesmo quando ignora), para não gerar reentrega.
- **`bot-wa.js`** (cliente Uazapi) — `sendText(number, text)` e parsing do inbound.
- **Memória curta** — mapa em memória por remetente (só 1 número), últimas ~6 trocas,
  TTL ~30 min, para permitir follow-up ("e na shopee?").

### Fluxo de dados (uma pergunta)

1. Uazapi entrega `{ event, message: { sender, text } }`.
2. Rota normaliza `sender` (dígitos, sem 55) e compara com a whitelist.
3. `bot-brain` manda system prompt + histórico curto + texto do usuário ao modelo.
4. Modelo escolhe tool(s); a rota executa via `bot-data`; devolve resultado ao modelo.
5. Modelo compõe a resposta final em PT-BR; a rota envia via `bot-wa.sendText`.

## Segurança

- **Whitelist dura**: constante `ALLOWED = '11938034714'`; remetente diferente → ignora.
- **Segredo do webhook**: Uazapi inclui um token/segredo combinado; a rota valida com
  `timingSafeEqual`. Sem isso → 401. Evita que qualquer um poste na rota.
- **Segredos só em env** (produção): `OPENROUTER_KEY`, `UAZAPI_TOKEN`,
  `UAZAPI_SERVER_URL`, `BOT_WEBHOOK_SECRET`, `NUVEMSHOP_TOKEN`, `NUVEMSHOP_STORE_ID`.
  Nunca em código, log ou resposta.
- **Sem PII em log/erro**: erros ao usuário são genéricos; detalhe só em `console.error`.
- **Custo controlado**: modelo barato + teto de iterações/tokens por mensagem.
- **Só leitura**: nenhuma tool escreve/apaga; a única ação externa é enviar texto ao
  próprio número do dono.

## Testes

- `bot-data`: normalização de período (fuso -03:00) e agregação por canal, com APIs
  mockadas (ML/NS) e Supabase mockado (Shopee); dinheiro em centavos.
- Rota: trava do remetente (ignora número errado), validação do segredo do webhook,
  parsing do inbound do Uazapi.
- `bot-brain`: laço de tool-calling com um cliente OpenRouter falso (dispatch correto de
  tool e montagem da resposta).
- `bot-wa`: monta a chamada `/send/text` correta (sem enviar de verdade nos testes).

## Fora de escopo (v1)

- TikTok Shop (entra quando a autorização da região do app funcionar).
- Envio proativo/agendado (só responde quando perguntado).
- Múltiplos usuários/lojas (só o número da Cacife).
