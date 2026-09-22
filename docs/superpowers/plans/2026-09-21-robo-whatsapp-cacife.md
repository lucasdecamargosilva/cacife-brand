# Robô WhatsApp Cacife — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um robô no WhatsApp (Uazapi) que responde, só ao número `11938034714`, perguntas em texto livre sobre vendas da Cacife (Shopee, Mercado Livre, Nuvemshop), usando IA (OpenRouter) com ferramentas que consultam os dados ao vivo na produção.

**Architecture:** Webhook do Uazapi → rota `/api/bot/whatsapp` no `server.js` (produção, público) → valida segredo + confere remetente → `bot-brain` conversa com OpenRouter oferecendo tools → `bot-data` busca números (Shopee do Supabase; ML e NS das APIs, server-side, sem trava de login) → resposta enviada via `bot-wa` (Uazapi `/send/text`).

**Tech Stack:** Node 20, Express (server.js), fetch nativo, OpenRouter (OpenAI-compatible), Uazapi, Supabase PostgREST, módulos existentes `ml-core.js` e `ns-core.js` (summarize), `shopee-prod.js` (supabaseDb).

## Global Constraints

- Só responde ao número `11938034714`. Qualquer outro remetente → ignora (200, sem resposta).
- Segredos apenas em env de produção: `OPENROUTER_KEY`, `BOT_MODEL`, `UAZAPI_SERVER_URL`, `UAZAPI_TOKEN`, `BOT_WEBHOOK_SECRET`, `NUVEMSHOP_TOKEN`, `NUVEMSHOP_STORE_ID`, `ML_USER_ID` (já existe), `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` (já existem). Nunca em código, log ou resposta ao usuário.
- Dinheiro sempre em **centavos** internamente; formatar em BRL só na resposta final.
- Fuso: Brasil = UTC-3. Períodos calculados com offset `-03:00`.
- Erros ao usuário são genéricos; detalhe só em `console.error`.
- Testes com `node --test`; nenhuma chamada de rede real nos testes (fetch mockado).
- Nuvemshop: loja fixa `1081093` (validar). Mercado Livre: `ML_USER_ID` do env.
- Node fetch nativo (sem novas dependências além do que já existe).

---

### Task 1: Helper de período (`bot-period.js`)

**Files:**
- Create: `bot-period.js`
- Test: `bot-period.test.js`

**Interfaces:**
- Produces: `resolvePeriod(spec, now = new Date()) -> { start, end, startISO, endExclusiveISO, label }`
  - `spec`: um de `'hoje'|'ontem'|'7d'|'30d'|'mes'` **ou** `{ from:'YYYY-MM-DD', to:'YYYY-MM-DD' }`.
  - `start`,`end`: strings `'YYYY-MM-DD'` (dias locais BR, inclusivos) — para APIs ML/NS.
  - `startISO`: instante UTC do início do dia `start` em BR (`YYYY-MM-DDT03:00:00.000Z`).
  - `endExclusiveISO`: instante UTC do fim do dia `end` + 1 (exclusivo) — para filtrar timestamps do Shopee.
  - `label`: rótulo PT-BR (ex: `'últimos 7 dias'`).

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { resolvePeriod } = require('./bot-period');

// 2026-09-21 15:00 BR = 2026-09-21T18:00:00Z
const NOW = new Date('2026-09-21T18:00:00.000Z');

test('hoje = o dia local corrente, meia-noite BR até meia-noite BR seguinte', () => {
  const p = resolvePeriod('hoje', NOW);
  assert.strictEqual(p.start, '2026-09-21');
  assert.strictEqual(p.end, '2026-09-21');
  assert.strictEqual(p.startISO, '2026-09-21T03:00:00.000Z');
  assert.strictEqual(p.endExclusiveISO, '2026-09-22T03:00:00.000Z');
});

test('ontem = dia local anterior', () => {
  const p = resolvePeriod('ontem', NOW);
  assert.strictEqual(p.start, '2026-09-20');
  assert.strictEqual(p.end, '2026-09-20');
});

test('7d = 7 dias terminando hoje (inclui hoje)', () => {
  const p = resolvePeriod('7d', NOW);
  assert.strictEqual(p.start, '2026-09-15');
  assert.strictEqual(p.end, '2026-09-21');
});

test('mes = do dia 1 do mês corrente até hoje', () => {
  const p = resolvePeriod('mes', NOW);
  assert.strictEqual(p.start, '2026-09-01');
  assert.strictEqual(p.end, '2026-09-21');
});

test('intervalo custom respeita as datas dadas', () => {
  const p = resolvePeriod({ from: '2026-08-01', to: '2026-08-31' }, NOW);
  assert.strictEqual(p.start, '2026-08-01');
  assert.strictEqual(p.end, '2026-08-31');
  assert.strictEqual(p.endExclusiveISO, '2026-09-01T03:00:00.000Z');
});

test('spec inválido cai em 30d', () => {
  const p = resolvePeriod('xpto', NOW);
  assert.strictEqual(p.start, '2026-08-23');
  assert.strictEqual(p.end, '2026-09-21');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bot-period.test.js`
Expected: FAIL (`Cannot find module './bot-period'`).

- [ ] **Step 3: Write minimal implementation**

```javascript
'use strict';
// Datas em fuso Brasil (UTC-3), sem libs externas.
const OFF = 3 * 3600000; // 3h em ms

function brParts(date) {
  // Componentes do dia local BR de um instante.
  const d = new Date(date.getTime() - OFF);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}
function ymd(y, m, d) {
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}
function startISOof(dateStr) {
  // Meia-noite BR do dia -> instante UTC (dia + 03:00Z).
  return `${dateStr}T03:00:00.000Z`;
}
function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(t);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

function resolvePeriod(spec, now = new Date()) {
  const p = brParts(now);
  const today = ymd(p.y, p.m, p.d);
  let start = today, end = today, label = 'hoje';

  if (spec && typeof spec === 'object' && spec.from && spec.to) {
    start = spec.from; end = spec.to; label = `${spec.from} a ${spec.to}`;
  } else {
    switch (spec) {
      case 'hoje': start = today; end = today; label = 'hoje'; break;
      case 'ontem': start = addDaysStr(today, -1); end = start; label = 'ontem'; break;
      case '7d': start = addDaysStr(today, -6); end = today; label = 'últimos 7 dias'; break;
      case '30d': start = addDaysStr(today, -29); end = today; label = 'últimos 30 dias'; break;
      case 'mes': start = ymd(p.y, p.m, 1); end = today; label = 'este mês'; break;
      default: start = addDaysStr(today, -29); end = today; label = 'últimos 30 dias';
    }
  }
  return {
    start, end, label,
    startISO: startISOof(start),
    endExclusiveISO: startISOof(addDaysStr(end, 1)),
  };
}

module.exports = { resolvePeriod };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bot-period.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add bot-period.js bot-period.test.js
git commit -m "feat(bot): helper de periodo em fuso BR"
```

---

### Task 2: Whitelist + normalização de número (`bot-gate.js`)

**Files:**
- Create: `bot-gate.js`
- Test: `bot-gate.test.js`

**Interfaces:**
- Produces:
  - `normalizeNumber(raw) -> string` — só dígitos, sem `55` inicial e sem `0` inicial.
  - `isAllowed(raw, allowed = '11938034714') -> boolean`.

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizeNumber, isAllowed } = require('./bot-gate');

test('remove 55, sufixos de jid e zeros', () => {
  assert.strictEqual(normalizeNumber('5511938034714@s.whatsapp.net'), '11938034714');
  assert.strictEqual(normalizeNumber('+55 11 93803-4714'), '11938034714');
  assert.strictEqual(normalizeNumber('011938034714'), '11938034714');
  assert.strictEqual(normalizeNumber('11938034714'), '11938034714');
});

test('só o número permitido passa', () => {
  assert.strictEqual(isAllowed('5511938034714@s.whatsapp.net'), true);
  assert.strictEqual(isAllowed('11999999999'), false);
  assert.strictEqual(isAllowed(''), false);
  assert.strictEqual(isAllowed(null), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bot-gate.test.js`
Expected: FAIL (module não encontrado).

- [ ] **Step 3: Write minimal implementation**

```javascript
'use strict';
function normalizeNumber(raw) {
  if (!raw) return '';
  let d = String(raw).split('@')[0].replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d;
}
function isAllowed(raw, allowed = '11938034714') {
  return normalizeNumber(raw) === normalizeNumber(allowed);
}
module.exports = { normalizeNumber, isAllowed };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bot-gate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bot-gate.js bot-gate.test.js
git commit -m "feat(bot): whitelist e normalizacao de numero"
```

---

### Task 3: Cliente Uazapi (`bot-wa.js`)

**Files:**
- Create: `bot-wa.js`
- Test: `bot-wa.test.js`

**Interfaces:**
- Produces:
  - `parseInbound(body) -> { sender, text } | null` — extrai remetente e texto do webhook do Uazapi; ignora eventos que não são mensagem de texto recebida (ex.: `fromMe: true`).
  - `sendText({ serverUrl, token, fetchImpl = fetch }, number, text) -> Promise<void>` — `POST {serverUrl}/send/text`, header `token`, body `{ number, text }`.

**Nota de implementação:** confirmar o formato real do webhook do Uazapi ao ligar (Task 8). O parser abaixo é tolerante aos campos comuns (`message`, `sender`/`chatid`, `text`/`content`); ajustar os nomes de campo se o payload real diferir, mantendo os testes.

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseInbound, sendText } = require('./bot-wa');

test('parseInbound extrai remetente e texto de mensagem recebida', () => {
  const body = { event: 'messages', message: { sender: '5511938034714@s.whatsapp.net', fromMe: false, text: 'quanto vendi hoje?' } };
  assert.deepStrictEqual(parseInbound(body), { sender: '5511938034714@s.whatsapp.net', text: 'quanto vendi hoje?' });
});

test('parseInbound ignora mensagens enviadas por nós (fromMe)', () => {
  const body = { event: 'messages', message: { sender: 'x', fromMe: true, text: 'oi' } };
  assert.strictEqual(parseInbound(body), null);
});

test('parseInbound retorna null sem texto', () => {
  assert.strictEqual(parseInbound({ message: { sender: 'x' } }), null);
  assert.strictEqual(parseInbound({}), null);
});

test('sendText chama /send/text com header token e body correto', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, text: async () => '{}' }; };
  await sendText({ serverUrl: 'https://quantic.uazapi.com', token: 'TK', fetchImpl }, '11938034714', 'olá');
  assert.strictEqual(calls[0].url, 'https://quantic.uazapi.com/send/text');
  assert.strictEqual(calls[0].init.method, 'POST');
  assert.strictEqual(calls[0].init.headers.token, 'TK');
  assert.deepStrictEqual(JSON.parse(calls[0].init.body), { number: '11938034714', text: 'olá' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bot-wa.test.js`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Write minimal implementation**

```javascript
'use strict';
function parseInbound(body) {
  const m = body && (body.message || body.data || body);
  if (!m) return null;
  if (m.fromMe === true) return null;
  const sender = m.sender || m.chatid || m.from || m.jid;
  const text = m.text || m.content || (m.message && m.message.conversation);
  if (!sender || !text || typeof text !== 'string') return null;
  return { sender: String(sender), text };
}

async function sendText({ serverUrl, token, fetchImpl = fetch }, number, text) {
  const res = await fetchImpl(`${serverUrl}/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Uazapi HTTP ${res.status}: ${t.slice(0, 120)}`);
  }
}

module.exports = { parseInbound, sendText };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bot-wa.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bot-wa.js bot-wa.test.js
git commit -m "feat(bot): cliente Uazapi (parse inbound + send text)"
```

---

### Task 4: Camada de dados Shopee (`bot-data.js` — parte 1)

**Files:**
- Create: `bot-data.js`
- Test: `bot-data.test.js`

**Interfaces:**
- Consumes: `resolvePeriod` (Task 1); `shopee-prod.js` `supabaseDb` (existe) para acesso PostgREST.
- Produces: `shopeeSummary(rest, period) -> Promise<{ revenue, net, orders }>` (centavos).
  - `rest(pathAndQuery) -> Promise<array>`: adaptador que faz GET no PostgREST (injetável nos testes).
  - Fonte: tabela `shopee_orders`, colunas `valor_liquido` (repasse, centavos), `valor_total`/`total` (bruto, centavos), `data_pedido` (timestamp). Filtra `data_pedido=gte.startISO&data_pedido=lt.endExclusiveISO`.

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { shopeeSummary } = require('./bot-data');
const { resolvePeriod } = require('./bot-period');
const NOW = new Date('2026-09-21T18:00:00.000Z');

test('shopeeSummary soma bruto, líquido e conta pedidos', async () => {
  const rest = async (q) => {
    assert.ok(q.startsWith('shopee_orders'));
    assert.ok(q.includes('data_pedido=gte.'));
    return [
      { valor_total: 10000, valor_liquido: 8500 },
      { valor_total: 5000, valor_liquido: 4200 },
    ];
  };
  const r = await shopeeSummary(rest, resolvePeriod('hoje', NOW));
  assert.strictEqual(r.revenue, 15000);
  assert.strictEqual(r.net, 12700);
  assert.strictEqual(r.orders, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bot-data.test.js`
Expected: FAIL (módulo/função não existe).

- [ ] **Step 3: Write minimal implementation**

```javascript
'use strict';
const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);

async function shopeeSummary(rest, period) {
  const q = `shopee_orders?select=valor_total,valor_liquido,data_pedido`
    + `&data_pedido=gte.${encodeURIComponent(period.startISO)}`
    + `&data_pedido=lt.${encodeURIComponent(period.endExclusiveISO)}`;
  const rows = (await rest(q)) || [];
  let revenue = 0, net = 0;
  for (const r of rows) { revenue += num(r.valor_total); net += num(r.valor_liquido); }
  return { revenue, net, orders: rows.length };
}

module.exports = { shopeeSummary };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bot-data.test.js`
Expected: PASS.
**Nota:** validar os nomes reais das colunas de `shopee_orders` contra o banco antes de ligar (Task 8). Ajustar `select`/somas se diferirem, mantendo o teste.

- [ ] **Step 5: Commit**

```bash
git add bot-data.js bot-data.test.js
git commit -m "feat(bot-data): resumo Shopee do Supabase"
```

---

### Task 5: Dados ML + NS + overview (`bot-data.js` — parte 2)

**Files:**
- Modify: `bot-data.js`
- Test: `bot-data.test.js`

**Interfaces:**
- Consumes: `ml-core.js` `summarize(orders)` → `{ revenue, fees, net, ... }`; `ns-core.js` `summarize(rows, start, end)` → `{ revenue, ... }`.
- Produces:
  - `mlSummary(fetchOrders, period) -> Promise<{ revenue, net, orders }>` — `fetchOrders(start, end) -> Promise<array>` devolve pedidos já no formato que `ml-core.summarize` espera (itens com `fee`, `quantity`, etc.). `net = revenue - fees`.
  - `nsSummary(fetchOrders, period) -> Promise<{ revenue, net, orders }>` — NS não tem comissão de marketplace: `net = revenue`.
  - `overview(deps, period) -> Promise<{ channels, total }>` onde `deps = { shopeeRest, mlFetch, nsFetch }`; qualquer canal que falhar entra como `{ error: true }` e NÃO derruba os outros.

- [ ] **Step 1: Write the failing test**

```javascript
// adicionar a bot-data.test.js
const { mlSummary, nsSummary, overview } = require('./bot-data');

test('mlSummary usa ml-core e calcula net = revenue - fees', async () => {
  const fetchOrders = async () => ([
    { id: 1, order_items: [{ quantity: 1, unit_price: 100, sale_fee: 10 }], status: 'paid', date_created: '2026-09-21T12:00:00Z' },
  ]);
  const r = await mlSummary(fetchOrders, resolvePeriod('hoje', NOW));
  assert.ok(r.revenue >= 0);
  assert.strictEqual(typeof r.net, 'number');
  assert.strictEqual(typeof r.orders, 'number');
});

test('nsSummary: net = revenue (sem comissão)', async () => {
  const fetchOrders = async () => ([
    { total: '100.00', paid_at: '2026-09-21T12:00:00Z', status: 'paid', products: [] },
  ]);
  const r = await nsSummary(fetchOrders, resolvePeriod('hoje', NOW));
  assert.strictEqual(r.net, r.revenue);
});

test('overview agrega canais e soma total; canal que falha não derruba', async () => {
  const deps = {
    shopeeRest: async () => ([{ valor_total: 10000, valor_liquido: 8000 }]),
    mlFetch: async () => { throw new Error('ml caiu'); },
    nsFetch: async () => ([]),
  };
  const r = await overview(deps, resolvePeriod('hoje', NOW));
  assert.strictEqual(r.channels.shopee.revenue, 10000);
  assert.strictEqual(r.channels.mercadolivre.error, true);
  assert.strictEqual(r.total.revenue, 10000); // ML falho não conta
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bot-data.test.js`
Expected: FAIL (funções novas não existem).

- [ ] **Step 3: Write minimal implementation** (adicionar ao `bot-data.js`)

```javascript
const mlCore = require('./ml-core');
const nsCore = require('./ns-core');

async function mlSummary(fetchOrders, period) {
  const orders = (await fetchOrders(period.start, period.end)) || [];
  const s = mlCore.summarize(orders);
  return { revenue: s.revenue || 0, net: (s.net != null ? s.net : (s.revenue || 0) - (s.fees || 0)), orders: orders.length };
}

async function nsSummary(fetchOrders, period) {
  const rows = (await fetchOrders(period.start, period.end)) || [];
  const s = nsCore.summarize(rows, period.start, period.end);
  return { revenue: s.revenue || 0, net: s.revenue || 0, orders: rows.length };
}

async function safe(fn) { try { return await fn(); } catch (e) { console.error('bot-data canal:', e.message); return { error: true, revenue: 0, net: 0, orders: 0 }; } }

async function overview(deps, period) {
  const [shopee, mercadolivre, nuvemshop] = await Promise.all([
    safe(() => shopeeSummary(deps.shopeeRest, period)),
    safe(() => mlSummary(deps.mlFetch, period)),
    safe(() => nsSummary(deps.nsFetch, period)),
  ]);
  const channels = { shopee, mercadolivre, nuvemshop };
  const total = { revenue: 0, net: 0, orders: 0 };
  for (const c of Object.values(channels)) {
    if (c.error) continue;
    total.revenue += c.revenue; total.net += c.net; total.orders += c.orders;
  }
  return { channels, total, period: { start: period.start, end: period.end, label: period.label } };
}

module.exports = { shopeeSummary, mlSummary, nsSummary, overview };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bot-data.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add bot-data.js bot-data.test.js
git commit -m "feat(bot-data): ML, NS e overview agregado"
```

---

### Task 6: Adaptadores de produção para ML e NS (`bot-fetchers.js`)

**Files:**
- Create: `bot-fetchers.js`
- Test: `bot-fetchers.test.js`

**Interfaces:**
- Consumes: env `ML_USER_ID`, token ML de `ml_tokens` (Supabase); env `NUVEMSHOP_TOKEN`, `NUVEMSHOP_STORE_ID`.
- Produces:
  - `makeMlFetch({ getMlToken, mlUserId, fetchImpl = fetch }) -> (start, end) => Promise<orders[]>` — busca em `api.mercadolibre.com/orders/search?seller={mlUserId}&order.date_created.from=...&.to=...`, paginando; devolve os `results` (formato que `ml-core.summarize` consome).
  - `makeNsFetch({ token, storeId, fetchImpl = fetch }) -> (start, end) => Promise<orders[]>` — busca em `api.nuvemshop.com.br/2025-03/{storeId}/orders?created_at_min=...&created_at_max=...`, header `Authentication: bearer {token}`, `User-Agent` da Cacife; pagina via header `link`.
- **Nota:** `getMlToken()` reaproveita o refresh que já existe em `server.js` (OAuth ML). Extrair para função exportável nesta task se ainda estiver inline.

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeMlFetch, makeNsFetch } = require('./bot-fetchers');

test('makeMlFetch monta a URL de orders/search com seller e datas', async () => {
  const seen = [];
  const fetchImpl = async (url) => { seen.push(url); return { ok: true, json: async () => ({ results: [], paging: { total: 0 } }) }; };
  const ml = makeMlFetch({ getMlToken: async () => 'AT', mlUserId: '123', fetchImpl });
  await ml('2026-09-01', '2026-09-21');
  assert.ok(seen[0].includes('/orders/search'));
  assert.ok(seen[0].includes('seller=123'));
  assert.ok(seen[0].includes('order.date_created.from='));
});

test('makeNsFetch usa a loja e o header de auth da Nuvemshop', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, init }); return { ok: true, status: 200, headers: new Headers(), json: async () => [] }; };
  const ns = makeNsFetch({ token: 'NT', storeId: '1081093', fetchImpl });
  await ns('2026-09-01', '2026-09-21');
  assert.ok(seen[0].url.includes('/1081093/orders'));
  assert.strictEqual(seen[0].init.headers.Authentication, 'bearer NT');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bot-fetchers.test.js`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```javascript
'use strict';
const UA = 'Cacife metrics (cacifebrand@outlook.com)';

function makeMlFetch({ getMlToken, mlUserId, fetchImpl = fetch }) {
  return async function mlOrders(start, end) {
    const token = await getMlToken();
    const from = `${start}T00:00:00.000-03:00`;
    const to = `${end}T23:59:59.999-03:00`;
    const out = [];
    let offset = 0;
    for (let i = 0; i < 40; i++) {
      const url = `https://api.mercadolibre.com/orders/search?seller=${encodeURIComponent(mlUserId)}`
        + `&order.date_created.from=${encodeURIComponent(from)}&order.date_created.to=${encodeURIComponent(to)}`
        + `&sort=date_desc&limit=50&offset=${offset}`;
      const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`ML HTTP ${r.status}`);
      const j = await r.json();
      const results = j.results || [];
      out.push(...results);
      const total = (j.paging && j.paging.total) || out.length;
      offset += 50;
      if (offset >= total || results.length === 0) break;
    }
    return out;
  };
}

function makeNsFetch({ token, storeId, fetchImpl = fetch }) {
  return async function nsOrders(start, end) {
    const base = `https://api.nuvemshop.com.br/2025-03/${storeId}/orders`;
    let url = `${base}?created_at_min=${start}T00:00:00-03:00&created_at_max=${end}T23:59:59-03:00&per_page=200&fields=id,total,paid_at,status,created_at,products`;
    const out = [];
    for (let i = 0; i < 40 && url; i++) {
      const r = await fetchImpl(url, { headers: { Authentication: `bearer ${token}`, 'User-Agent': UA }, signal: AbortSignal.timeout(25000), redirect: 'error' });
      if (r.status === 404) break; // sem próxima página
      if (!r.ok) throw new Error(`NS HTTP ${r.status}`);
      const page = await r.json();
      out.push(...(Array.isArray(page) ? page : []));
      const link = r.headers.get('link') || '';
      const next = /<([^>]+)>;\s*rel="next"/.exec(link);
      url = next ? next[1] : null;
    }
    return out;
  };
}

module.exports = { makeMlFetch, makeNsFetch };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bot-fetchers.test.js`
Expected: PASS.
**Nota:** confirmar contra as APIs reais (Task 8) que os campos consumidos por `ml-core`/`ns-core` batem com o que `orders/search` e `/orders` retornam. Se `ml-core.summarize` esperar detalhe por item que `orders/search` não traz, buscar detalhe por pedido (`/orders/{id}`) dentro de `makeMlFetch`.

- [ ] **Step 5: Commit**

```bash
git add bot-fetchers.js bot-fetchers.test.js
git commit -m "feat(bot): fetchers de producao para ML e NS"
```

---

### Task 7: Cérebro IA (`bot-brain.js`)

**Files:**
- Create: `bot-brain.js`
- Test: `bot-brain.test.js`

**Interfaces:**
- Consumes: `overview` e afins de `bot-data.js` (via um objeto `tools` injetado); um `chat(messages, toolDefs)` cliente OpenRouter injetável.
- Produces: `answer({ chat, tools, model, history, text }) -> Promise<string>`.
  - `chat(payload) -> Promise<response>`: wrapper do POST `https://openrouter.ai/api/v1/chat/completions` (injetável nos testes).
  - `tools`: `{ resumo_geral(period), resumo_canal(canal, period), ... }` — funções async que devolvem objetos JSON.
  - Loop de tool-calling: no máx. 4 iterações; se estourar, devolve texto de fallback.
  - System prompt fixa: responder em PT-BR, curto, valores em R$, nunca inventar número (só usar o que as tools retornam).

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { answer } = require('./bot-brain');

test('answer chama a tool pedida pelo modelo e devolve o texto final', async () => {
  let step = 0;
  const chat = async ({ messages }) => {
    step++;
    if (step === 1) {
      return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'resumo_geral', arguments: JSON.stringify({ period: 'hoje' }) } }] } }] };
    }
    // 2ª volta: o modelo já viu o resultado da tool
    const toolMsg = messages.find((m) => m.role === 'tool');
    assert.ok(toolMsg, 'resultado da tool deve entrar no histórico');
    return { choices: [{ message: { role: 'assistant', content: 'Hoje você vendeu R$ 150,00.' } }] };
  };
  const tools = { resumo_geral: async ({ period }) => ({ total: { revenue: 15000 }, period }) };
  const out = await answer({ chat, tools, model: 'x', history: [], text: 'quanto vendi hoje?' });
  assert.strictEqual(out, 'Hoje você vendeu R$ 150,00.');
});

test('answer sem tool_call devolve o content direto', async () => {
  const chat = async () => ({ choices: [{ message: { role: 'assistant', content: 'Oi! Pergunte sobre suas vendas.' } }] });
  const out = await answer({ chat, tools: {}, model: 'x', history: [], text: 'oi' });
  assert.strictEqual(out, 'Oi! Pergunte sobre suas vendas.');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bot-brain.test.js`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```javascript
'use strict';
const SYSTEM = [
  'Você é o assistente de dados da loja Cacife no WhatsApp.',
  'Responda em português do Brasil, curto e direto.',
  'Valores sempre em reais (R$), com duas casas. Os dados vêm em centavos.',
  'NUNCA invente números: só use o que as ferramentas retornarem.',
  'Se a pergunta não for sobre vendas/canais, responda gentilmente o que você faz.',
].join(' ');

const TOOL_DEFS = [
  { type: 'function', function: { name: 'resumo_geral', description: 'Vendas, líquido e nº de pedidos de todos os canais + total, num período.', parameters: { type: 'object', properties: { period: { type: 'string', description: "hoje|ontem|7d|30d|mes ou 'YYYY-MM-DD:YYYY-MM-DD'" } }, required: ['period'] } } },
  { type: 'function', function: { name: 'resumo_canal', description: 'Mesmo que resumo_geral, mas de um canal só.', parameters: { type: 'object', properties: { canal: { type: 'string', enum: ['shopee', 'mercadolivre', 'nuvemshop'] }, period: { type: 'string' } }, required: ['canal', 'period'] } } },
];

async function answer({ chat, tools, model, history = [], text }) {
  const messages = [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: text }];
  for (let i = 0; i < 4; i++) {
    const resp = await chat({ model, messages, tools: TOOL_DEFS, tool_choice: 'auto' });
    const msg = resp.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return (msg.content || '').trim() || 'Não consegui responder agora.';
    }
    for (const call of msg.tool_calls) {
      const fn = tools[call.function.name];
      let result;
      try { result = fn ? await fn(JSON.parse(call.function.arguments || '{}')) : { error: 'ferramenta desconhecida' }; }
      catch (e) { console.error('tool erro:', e.message); result = { error: 'falha ao buscar dados' }; }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return 'Consultei bastante coisa, mas não fechei a resposta. Tenta perguntar de novo mais específico?';
}

module.exports = { answer, SYSTEM, TOOL_DEFS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bot-brain.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bot-brain.js bot-brain.test.js
git commit -m "feat(bot): cerebro IA com loop de tool-calling"
```

---

### Task 8: Fiação na produção — rota, tools, OpenRouter, env, webhook, deploy

**Files:**
- Modify: `server.js` (nova rota `/api/bot/whatsapp` + montagem das dependências)
- Create: `bot-openrouter.js` (wrapper `chat` do OpenRouter)
- Test: `bot-openrouter.test.js`; teste de rota via supertest-like (fetch contra app em porta efêmera) — ou teste unitário do handler extraído.

**Interfaces:**
- `makeChat({ apiKey, fetchImpl = fetch }) -> (payload) => Promise<response>` — POST `https://openrouter.ai/api/v1/chat/completions`, header `Authorization: Bearer {apiKey}`.
- Rota `POST /api/bot/whatsapp`:
  1. valida `BOT_WEBHOOK_SECRET` (header combinado no Uazapi, ex.: `x-webhook-secret`) com `timingSafeEqual`; senão 401.
  2. `parseInbound(req.body)`; se null → `res.sendStatus(200)`.
  3. `isAllowed(sender)`; se false → `res.sendStatus(200)` (ignora).
  4. `res.sendStatus(200)` **imediato** (evita reentrega do Uazapi); processa em background.
  5. `answer(...)` com `tools` ligadas a `bot-data` (deps reais) + memória curta; envia via `sendText`.

- [ ] **Step 1: Teste do wrapper OpenRouter (falha primeiro)**

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeChat } = require('./bot-openrouter');

test('makeChat posta no OpenRouter com Bearer e body', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }; };
  const chat = makeChat({ apiKey: 'sk-or', fetchImpl });
  const r = await chat({ model: 'm', messages: [{ role: 'user', content: 'oi' }] });
  assert.strictEqual(seen[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.strictEqual(seen[0].init.headers.Authorization, 'Bearer sk-or');
  assert.strictEqual(r.choices[0].message.content, 'ok');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test bot-openrouter.test.js` → FAIL.

- [ ] **Step 3: Implementar `bot-openrouter.js`**

```javascript
'use strict';
function makeChat({ apiKey, fetchImpl = fetch }) {
  return async function chat(payload) {
    const res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'X-Title': 'Cacife Bot' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`OpenRouter HTTP ${res.status}: ${t.slice(0, 120)}`); }
    return res.json();
  };
}
module.exports = { makeChat };
```

- [ ] **Step 4: Rodar e ver passar** → `node --test bot-openrouter.test.js` PASS.

- [ ] **Step 5: Montar a rota em `server.js`**

Adicionar perto das demais rotas (usar helpers existentes `timingEq`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, o refresh do token ML já presente):

```javascript
// --- Robô WhatsApp (consulta de dados) ---
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
  mlUserId: process.env.ML_USER_ID || '',
};
const botReady = BOT.openrouterKey && BOT.uazapi.token && BOT.webhookSecret;

// PostgREST GET (service_role) já usado no server para Shopee — reutilizar helper existente.
const shopeeRest = async (q) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
  if (!r.ok) throw new Error(`Supabase ${r.status}`); return r.json();
};
const mlFetch = makeMlFetch({ getMlToken: getMlAccessToken /* função de refresh já existente no server */, mlUserId: BOT.mlUserId });
const nsFetch = makeNsFetch({ token: BOT.nsToken, storeId: BOT.nsStore });
const chat = makeChat({ apiKey: BOT.openrouterKey });

function parsePeriodArg(p) {
  if (typeof p === 'string' && p.includes(':')) { const [from, to] = p.split(':'); return { from, to }; }
  return p;
}
const botTools = {
  resumo_geral: async ({ period }) => overview({ shopeeRest, mlFetch, nsFetch }, resolvePeriod(parsePeriodArg(period))),
  resumo_canal: async ({ canal, period }) => {
    const ov = await overview({ shopeeRest, mlFetch, nsFetch }, resolvePeriod(parsePeriodArg(period)));
    return { canal, ...(ov.channels[canal] || { error: true }), period: ov.period };
  },
};

const botMemory = []; // últimas trocas (só 1 número)
app.post('/api/bot/whatsapp', express.json({ limit: '32kb' }), async (req, res) => {
  if (!botReady) return res.sendStatus(503);
  const secret = req.headers['x-webhook-secret'] || req.query.secret || '';
  if (!BOT.webhookSecret || !timingEq(String(secret), BOT.webhookSecret)) return res.sendStatus(401);
  const inbound = parseInbound(req.body);
  res.sendStatus(200); // responde já; processa depois
  if (!inbound || !isAllowed(inbound.sender)) return;
  try {
    const reply = await answer({ chat, tools: botTools, model: BOT.model, history: botMemory.slice(-6), text: inbound.text });
    botMemory.push({ role: 'user', content: inbound.text }, { role: 'assistant', content: reply });
    if (botMemory.length > 12) botMemory.splice(0, botMemory.length - 12);
    await sendText(BOT.uazapi, '11938034714', reply);
  } catch (e) { console.error('bot whatsapp:', e.message); }
});
```

**Nota:** extrair o refresh do token ML já existente em `server.js` para `getMlAccessToken()` reutilizável (ver linhas ~96). Se `express.json` global já existir, não duplicar o middleware.

- [ ] **Step 6: Rodar toda a suíte**

Run: `npm test && node --test bot-*.test.js`
Expected: tudo PASS.

- [ ] **Step 7: Setar env na produção (EasyPanel) e deploy**

Ler valores de `~/.cacife-local/uazapi-bot.json` e `~/.cacife-local/channels.json`; acrescentar sem apagar as existentes (mesmo script já usado para TikTok): `OPENROUTER_KEY`, `BOT_MODEL`, `UAZAPI_SERVER_URL`, `UAZAPI_TOKEN`, `BOT_WEBHOOK_SECRET` (gerar aleatório), `NUVEMSHOP_TOKEN`, `NUVEMSHOP_STORE_ID=1081093`. Confirmar `ML_USER_ID` já presente. Depois `git push` + `services.app.deployService`.

- [ ] **Step 8: Configurar o webhook no Uazapi**

Apontar o webhook de mensagens recebidas da instância para `https://cacife.quanticsolutions.com.br/api/bot/whatsapp` com o header/secret `BOT_WEBHOOK_SECRET`. Validar o formato real do inbound (ajustar `parseInbound` se preciso) e as colunas reais de `shopee_orders` e os campos de ML/NS.

- [ ] **Step 9: Teste ponta a ponta**

Do próprio número `11938034714`, mandar "quanto vendi hoje?" e conferir a resposta. Mandar de outro número (ou simular) e confirmar que é ignorado.

- [ ] **Step 10: Commit final**

```bash
git add server.js bot-openrouter.js bot-openrouter.test.js
git commit -m "feat(bot): fiacao da rota WhatsApp + OpenRouter na producao"
```

---

## Self-Review (feito)

- **Cobertura do spec:** período ✓ (T1), whitelist/segurança ✓ (T2, T8), Uazapi ✓ (T3, T8), dados Shopee/ML/NS/overview ✓ (T4–T6), IA/tools ✓ (T7), env/webhook/deploy/testes ✓ (T8).
- **Placeholders:** os "Nota" apontam validações contra sistemas reais (formato do webhook, nomes de coluna) que só dá para confirmar ligando — são checagens, não código faltando. Código de cada passo está completo.
- **Consistência de tipos:** `resolvePeriod` retorna `{start,end,startISO,endExclusiveISO,label}` usado igual em T4–T6/T8; `overview` retorna `{channels,total,period}` usado nas tools de T8; `answer` assinatura igual em T7/T8.
