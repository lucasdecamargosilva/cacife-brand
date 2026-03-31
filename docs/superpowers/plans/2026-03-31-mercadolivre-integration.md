# Mercado Livre Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Mercado Livre orders into the Cacife Brand dashboard with a global channel filter to toggle between Nuvemshop and ML data.

**Architecture:** Add a `channel` column to `cacife_orders`, sync ML orders via n8n workflow, and add a channel dropdown filter to the dashboard header that applies to all queries, KPIs, charts, and the orders table.

**Tech Stack:** Supabase (Postgres), n8n (workflow automation), Mercado Livre REST API, vanilla JS/HTML dashboard.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `index.html` | Modify | Add channel dropdown, channel badges, update all queries |
| `ranking-produtos.html` | Modify | Add channel dropdown, update queries |
| `style.css` | Modify | Add channel dropdown and badge styles |
| Supabase `cacife_orders` | Alter | Add `channel` column |
| Supabase `ml_tokens` | Create | Store ML OAuth tokens |
| n8n workflow | Create | Sync ML orders to Supabase |

---

### Task 1: Add `channel` column to `cacife_orders` and create `ml_tokens` table

**Target:** Supabase SQL Editor

- [ ] **Step 1: Add `channel` column and backfill existing orders**

Run in Supabase SQL Editor (`https://jytsrxrmgvliyyuktxsd.supabase.co`):

```sql
ALTER TABLE cacife_orders ADD COLUMN IF NOT EXISTS channel text DEFAULT 'nuvemshop';
UPDATE cacife_orders SET channel = 'nuvemshop' WHERE channel IS NULL;
```

- [ ] **Step 2: Create `ml_tokens` table for OAuth token storage**

Run in Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS ml_tokens (
  user_id bigint PRIMARY KEY,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ml_tokens ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Insert initial Cacife ML token**

Run in Supabase SQL Editor:

```sql
INSERT INTO ml_tokens (user_id, access_token, refresh_token, expires_at)
VALUES (
  674281461,
  'APP_USR-523657307062945-033119-76583e18053653a9145d87af641f76df-674281461',
  'TG-69cc522684cf050001a4184a-674281461',
  now() + interval '6 hours'
);
```

- [ ] **Step 4: Verify changes**

Run in SQL Editor:

```sql
SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'cacife_orders' AND column_name = 'channel';
SELECT * FROM ml_tokens;
```

Expected: `channel` column exists with default `'nuvemshop'`; `ml_tokens` has one row for user 674281461.

- [ ] **Step 5: Commit** (nothing to commit locally — DB changes only)

---

### Task 2: Add channel dropdown and badge styles to `style.css`

**Files:**
- Modify: `style.css` (after the `.apply-btn:hover` rule, around line 616)

- [ ] **Step 1: Add channel filter dropdown styles**

Add after line 616 in `style.css`:

```css
/* ── Channel Filter ── */
.channel-filter {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--text-white);
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-family: 'Outfit', sans-serif;
    font-weight: 500;
    cursor: pointer;
    outline: none;
    height: 36px;
    min-width: 160px;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23999' viewBox='0 0 256 256'%3E%3Cpath d='M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z'%3E%3C/path%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 30px;
}

.channel-filter:focus {
    border-color: #ffffff;
}

.channel-filter option {
    background: #111111;
    color: #ffffff;
}

/* ── Channel Badge ── */
.channel-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.channel-badge.nuvemshop {
    background: rgba(114, 105, 255, 0.15);
    color: #7269ff;
}

.channel-badge.mercadolivre {
    background: rgba(255, 224, 51, 0.15);
    color: #ffe033;
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/lucasdecamargosilva/gemini/antigravity/cacife brand"
git add style.css
git commit -m "style: add channel filter dropdown and badge styles"
```

---

### Task 3: Add channel filter to `index.html` header

**Files:**
- Modify: `index.html` (header area, lines 82-100)

- [ ] **Step 1: Add channel dropdown before the filter-group**

Find the `<div class="header-center">` block (line 84) and add the dropdown before the `<div class="filter-group">`:

```html
<div class="header-center">
    <select id="channel-filter" class="channel-filter">
        <option value="all">Todos os Canais</option>
        <option value="nuvemshop">Nuvemshop</option>
        <option value="mercadolivre">Mercado Livre</option>
    </select>
    <div class="filter-group">
```

No other HTML changes in this step.

- [ ] **Step 2: Add `currentChannel` variable to JS initialization**

Find the variable declarations block (around line 478):

```javascript
let supabaseClient;
let charts = {};
let currentPeriod = 'today';
let allOrdersData = [];
let currentOrdersPage = 1;
const ordersPerPage = 10;
```

Add `let currentChannel = 'all';` after `let currentPeriod = 'today';`:

```javascript
let supabaseClient;
let charts = {};
let currentPeriod = 'today';
let currentChannel = 'all';
let allOrdersData = [];
let currentOrdersPage = 1;
const ordersPerPage = 10;
```

- [ ] **Step 3: Update `fetchDashboardData` to filter by channel**

In the `fetchDashboardData` function, find the Supabase query block (around line 534):

```javascript
const { data, error } = await supabaseClient
    .from('cacife_orders')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .range(from, to);
```

Replace with:

```javascript
let query = supabaseClient
    .from('cacife_orders')
    .select('*')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

if (currentChannel !== 'all') {
    query = query.eq('channel', currentChannel);
}

const { data, error } = await query.range(from, to);
```

- [ ] **Step 4: Add channel filter event listener**

In the `DOMContentLoaded` event listener block (around line 1515), add after the period button listeners:

```javascript
document.getElementById('channel-filter').addEventListener('change', function () {
    currentChannel = this.value;
    const activeBtn = document.querySelector('.period-btn.active');
    if (activeBtn.dataset.period === 'custom') {
        const s = document.getElementById('date-start').value;
        const e = document.getElementById('date-end').value;
        if (s && e) fetchDashboardData('custom', s, e);
    } else {
        fetchDashboardData(activeBtn.dataset.period);
    }
});
```

- [ ] **Step 5: Add channel badge to orders table rows**

In the `renderOrdersTable` function, find where each table row is built (around line 859). Locate the `<td>` that shows the customer name. Add a channel badge after the customer name.

Find the line that renders the customer name cell (it looks like):
```javascript
<td>${item.customer_name || 'N/A'}</td>
```

Replace with:
```javascript
<td>
    ${item.customer_name || 'N/A'}
    <span class="channel-badge ${item.channel || 'nuvemshop'}">${item.channel === 'mercadolivre' ? 'ML' : 'NS'}</span>
</td>
```

- [ ] **Step 6: Verify the dashboard loads correctly**

Open the dashboard in the browser, confirm:
- Channel dropdown appears to the left of period buttons
- "Todos os Canais" is selected by default
- Switching channels triggers a data reload
- Orders show NS badges (since only Nuvemshop orders exist currently)

- [ ] **Step 7: Commit**

```bash
cd "/Users/lucasdecamargosilva/gemini/antigravity/cacife brand"
git add index.html
git commit -m "feat: add channel filter and badges to orders dashboard"
```

---

### Task 4: Add channel filter to `ranking-produtos.html`

**Files:**
- Modify: `ranking-produtos.html` (header area and JS)

- [ ] **Step 1: Add channel dropdown before the filter-group**

Find the `<div class="header-center">` block and add the dropdown the same way as in index.html:

```html
<div class="header-center">
    <select id="channel-filter" class="channel-filter">
        <option value="all">Todos os Canais</option>
        <option value="nuvemshop">Nuvemshop</option>
        <option value="mercadolivre">Mercado Livre</option>
    </select>
    <div class="filter-group">
```

- [ ] **Step 2: Add `currentChannel` variable**

Find the JS variables block (around line 182):

```javascript
let supabaseClient;
let chartRanking = null;
let currentPeriod = '7';
```

Add `let currentChannel = 'all';` after `let currentPeriod = '7';`:

```javascript
let supabaseClient;
let chartRanking = null;
let currentPeriod = '7';
let currentChannel = 'all';
```

- [ ] **Step 3: Update `fetchRankingData` query to filter by channel**

Find the Supabase query (around line 230):

```javascript
const { data, error } = await supabaseClient
    .from('cacife_orders')
    .select('product_name, product_price, quantity_buyed, total, payment_status, status')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .range(from, to);
```

Replace with:

```javascript
let query = supabaseClient
    .from('cacife_orders')
    .select('product_name, product_price, quantity_buyed, total, payment_status, status')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

if (currentChannel !== 'all') {
    query = query.eq('channel', currentChannel);
}

const { data, error } = await query.range(from, to);
```

- [ ] **Step 4: Add channel filter event listener**

In the `DOMContentLoaded` block, add:

```javascript
document.getElementById('channel-filter').addEventListener('change', function () {
    currentChannel = this.value;
    const activeBtn = document.querySelector('.period-btn.active');
    if (activeBtn.dataset.period === 'custom') {
        const s = document.getElementById('date-start').value;
        const e = document.getElementById('date-end').value;
        if (s && e) fetchRankingData('custom', s, e);
    } else {
        fetchRankingData(activeBtn.dataset.period);
    }
});
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/lucasdecamargosilva/gemini/antigravity/cacife brand"
git add ranking-produtos.html
git commit -m "feat: add channel filter to product ranking page"
```

---

### Task 5: Build n8n workflow — ML token refresh + order sync

**Target:** n8n at `https://n8n.segredosdodrop.com`

This task is done entirely in the n8n UI. The workflow has these nodes:

- [ ] **Step 1: Create new workflow "Cacife ML — Sync Orders"**

Open n8n, create a new workflow named "Cacife ML — Sync Orders".

- [ ] **Step 2: Add Schedule Trigger node**

- Type: Schedule Trigger
- Interval: Every 30 minutes

- [ ] **Step 3: Add HTTP Request node — "Get Current Token"**

Fetch the current refresh_token from Supabase:

- Method: GET
- URL: `https://jytsrxrmgvliyyuktxsd.supabase.co/rest/v1/ml_tokens?user_id=eq.674281461&select=refresh_token,access_token,expires_at`
- Headers:
  - `apikey`: (Supabase anon key from supabase-config.js)
  - `Authorization`: `Bearer` + (Supabase service role key if RLS blocks anon)

- [ ] **Step 4: Add HTTP Request node — "Refresh ML Token"**

- Method: POST
- URL: `https://api.mercadolibre.com/oauth/token`
- Content-Type: `application/x-www-form-urlencoded`
- Body parameters:
  - `grant_type`: `refresh_token`
  - `client_id`: `523657307062945`
  - `client_secret`: `I7jKNj6gzjyZZ7iqIFAvIvMWcZ3kFLkM`
  - `refresh_token`: `{{ $json.refresh_token }}` (from previous node)

- [ ] **Step 5: Add HTTP Request node — "Save New Token"**

Update the token in Supabase:

- Method: PATCH
- URL: `https://jytsrxrmgvliyyuktxsd.supabase.co/rest/v1/ml_tokens?user_id=eq.674281461`
- Headers:
  - `apikey`: (service role key)
  - `Authorization`: `Bearer` + (service role key)
  - `Content-Type`: `application/json`
  - `Prefer`: `return=minimal`
- Body:
```json
{
  "access_token": "{{ $json.access_token }}",
  "refresh_token": "{{ $json.refresh_token }}",
  "expires_at": "{{ $now.plus(6, 'hours').toISO() }}",
  "updated_at": "{{ $now.toISO() }}"
}
```

- [ ] **Step 6: Add HTTP Request node — "Fetch ML Orders"**

- Method: GET
- URL: `https://api.mercadolibre.com/orders/search?seller=674281461&sort=date_desc&limit=50&order.date_created.from={{ $now.minus(1, 'hours').toISO() }}`
- Headers:
  - `Authorization`: `Bearer {{ $node["Refresh ML Token"].json.access_token }}`

This fetches orders created in the last hour (overlapping with 30min schedule for safety).

- [ ] **Step 7: Add Loop Over Items node**

Split `results` array so each order is processed individually.

- [ ] **Step 8: Add HTTP Request node — "Get Buyer Info"**

For each order, fetch buyer details:

- Method: GET
- URL: `https://api.mercadolibre.com/orders/{{ $json.id }}/billing_info`
- Headers:
  - `Authorization`: `Bearer {{ $node["Refresh ML Token"].json.access_token }}`

Note: Buyer email/phone may require `/users/{buyer_id}` endpoint instead. Test both and use whichever returns the data.

Alternative:
- URL: `https://api.mercadolibre.com/users/{{ $json.buyer.id }}`

- [ ] **Step 9: Add HTTP Request node — "Get Shipping Info"**

- Method: GET
- URL: `https://api.mercadolibre.com/shipments/{{ $json.shipping.id }}`
- Headers:
  - `Authorization`: `Bearer {{ $node["Refresh ML Token"].json.access_token }}`

- [ ] **Step 10: Add Function node — "Map to cacife_orders format"**

```javascript
const order = $('Loop Over Items').item.json;
const buyer = $('Get Buyer Info').item.json;
const shipping = $('Get Shipping Info').item.json;

// Payment status mapping
const mlPayStatus = order.payments?.[0]?.status || 'unknown';
const paymentMap = {
  'approved': 'paid',
  'pending': 'pending',
  'rejected': 'recusado',
  'refunded': 'reembolsado',
  'cancelled': 'cancelled'
};

// Shipping status mapping
const mlShipStatus = shipping.status || '';
const shipMap = {
  'pending': 'não está embalado',
  'ready_to_ship': 'não está embalado',
  'shipped': 'enviado',
  'delivered': 'entregue',
  'cancelled': 'cancelado',
  'not_delivered': 'não está embalado'
};

// Build product name from all order items
const productName = order.order_items
  .map(i => i.item.title)
  .join(' | ');

const productPrice = order.order_items[0]?.unit_price || 0;
const quantity = order.order_items.reduce((sum, i) => sum + i.quantity, 0);

return {
  json: {
    id_pedido: order.id,
    customer_name: buyer.first_name ? `${buyer.first_name} ${buyer.last_name}`.trim() : order.buyer.nickname,
    customer_email: buyer.email || '',
    customer_phone: buyer.phone?.number ? `${buyer.phone.area_code || ''}${buyer.phone.number}` : '',
    product_name: productName,
    product_price: productPrice,
    quantity_buyed: quantity,
    total: order.paid_amount || order.total_amount,
    payment_status: paymentMap[mlPayStatus] || mlPayStatus,
    status: order.status === 'paid' ? 'open' : order.status,
    shipping_status: shipMap[mlShipStatus] || mlShipStatus,
    shipping_city: shipping.receiver_address?.city?.name || '',
    shipping_tracking_number: shipping.tracking_number || '',
    created_at: order.date_created,
    channel: 'mercadolivre',
    payment_method: order.payments?.[0]?.payment_type || ''
  }
};
```

- [ ] **Step 11: Add HTTP Request node — "Upsert to Supabase"**

- Method: POST
- URL: `https://jytsrxrmgvliyyuktxsd.supabase.co/rest/v1/cacife_orders`
- Headers:
  - `apikey`: (service role key)
  - `Authorization`: `Bearer` + (service role key)
  - `Content-Type`: `application/json`
  - `Prefer`: `resolution=merge-duplicates`
- Body: `{{ JSON.stringify([$json]) }}`

Note: This requires a UNIQUE constraint on `id_pedido`. If one doesn't exist yet for the ML range, the upsert will work as insert. Since Nuvemshop and ML order IDs are different number ranges, there won't be collisions.

- [ ] **Step 12: Activate the workflow**

Enable the workflow so it runs every 30 minutes.

- [ ] **Step 13: Test manually**

Run the workflow once manually. Check Supabase to confirm ML orders appear in `cacife_orders` with `channel = 'mercadolivre'`.

---

### Task 6: Initial load — sync last 30 days of ML orders

**Target:** n8n (one-time execution)

- [ ] **Step 1: Create temporary workflow "Cacife ML — Initial Load"**

Duplicate the sync workflow but modify the "Fetch ML Orders" node:

- Change URL to: `https://api.mercadolibre.com/orders/search?seller=674281461&sort=date_asc&limit=50&order.date_created.from={{ $now.minus(30, 'days').toISO() }}`
- Add a pagination loop: after processing 50 orders, fetch next page with `&offset=50`, then `&offset=100`, etc.
- Continue until the API returns fewer than 50 results.

The ML API returns max 50 per page. With 30 days of orders, expect multiple pages.

- [ ] **Step 2: Run the initial load workflow**

Execute manually. Monitor for errors.

- [ ] **Step 3: Verify in Supabase**

```sql
SELECT channel, count(*) FROM cacife_orders GROUP BY channel;
```

Expected: rows with `nuvemshop` (existing) and `mercadolivre` (newly synced).

- [ ] **Step 4: Verify in dashboard**

Open dashboard, select "Mercado Livre" in channel filter with "30 Dias" period. Confirm orders, KPIs, and charts display correctly.

- [ ] **Step 5: Deactivate/delete the initial load workflow**

It was a one-time run.

---

### Task 7: Final verification and commit

- [ ] **Step 1: Test all filter combinations**

In the dashboard:
1. "Todos os Canais" + "Hoje" — shows both channels
2. "Nuvemshop" + "7 Dias" — shows only NS orders
3. "Mercado Livre" + "30 Dias" — shows only ML orders
4. "Todos os Canais" + "Tudo" — shows everything combined
5. Verify KPIs update correctly for each combination
6. Verify charts update correctly
7. Verify orders table shows correct badges
8. Verify search and shipping filter still work with channel filter

- [ ] **Step 2: Test ranking page**

1. Switch channels on ranking-produtos.html
2. Verify product ranking updates per channel

- [ ] **Step 3: Final commit**

```bash
cd "/Users/lucasdecamargosilva/gemini/antigravity/cacife brand"
git add -A
git commit -m "feat: complete Mercado Livre integration with channel filter"
```
