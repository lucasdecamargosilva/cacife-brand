# Mercado Livre Integration — Design Spec

## Overview

Integrate Mercado Livre orders into the Cacife Brand dashboard, adding a global channel filter to toggle between Nuvemshop and ML data. Orders from both channels live in the same `cacife_orders` table, differentiated by a `channel` column.

## ML App Credentials

- **App ID:** 523657307062945
- **Secret:** `zLCN0jo9jZ5KPFt2VvkDhf7GxECm28VX`
- **Redirect URI:** `https://quanticsolutions.com.br/ml-callback`
- **Webhook:** `https://n8n.segredosdodrop.com/webhook/ml-cacife`
- **Cacife ML User ID:** 674281461
- **Cacife ML Nickname:** CACIFEBRANDCACIFEBRAND

## 1. Database Changes

### 1.1 Add `channel` column to `cacife_orders`

```sql
ALTER TABLE cacife_orders ADD COLUMN channel text DEFAULT 'nuvemshop';
UPDATE cacife_orders SET channel = 'nuvemshop' WHERE channel IS NULL;
```

### 1.2 Token storage

Create a table or use an existing mechanism to store the ML refresh token so the n8n workflow can renew access automatically.

Option: simple `ml_tokens` table:

```sql
CREATE TABLE ml_tokens (
  user_id bigint PRIMARY KEY,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz DEFAULT now()
);
```

## 2. Field Mapping — ML API to `cacife_orders`

| cacife_orders       | ML API Source                          |
|---------------------|----------------------------------------|
| `id_pedido`         | `order.id`                             |
| `customer_name`     | `GET /users/{buyer.id}` → name fields  |
| `customer_email`    | `GET /users/{buyer.id}` → email        |
| `customer_phone`    | `GET /users/{buyer.id}` → phone        |
| `product_name`      | `order_items[].item.title`             |
| `product_price`     | `order_items[].unit_price`             |
| `quantity_buyed`    | `order_items[].quantity`               |
| `total`             | `paid_amount`                          |
| `payment_status`    | `payments[].status` (mapped, see below)|
| `status`            | `order.status`                         |
| `shipping_status`   | `GET /shipments/{shipping.id}` → status|
| `created_at`        | `date_created`                         |
| `channel`           | `'mercadolivre'` (hardcoded)           |

### Payment status mapping

| ML `payments.status` | `cacife_orders.payment_status` |
|----------------------|-------------------------------|
| `approved`           | `paid`                        |
| `pending`            | `pending`                     |
| `rejected`           | `recusado`                    |
| `refunded`           | `reembolsado`                 |
| `cancelled`          | `cancelled`                   |

## 3. n8n Sync Workflow

### 3.1 Schedule

Runs every 15-30 minutes.

### 3.2 Steps

1. **Refresh token** — `POST /oauth/token` with `grant_type=refresh_token` to keep access valid (expires every 6h). Save new refresh_token to `ml_tokens`.
2. **Fetch recent orders** — `GET /orders/search?seller=674281461&sort=date_desc&limit=50`, filtering by `date_created` since last execution.
3. **Enrich each order:**
   - Fetch buyer info via `GET /users/{buyer_id}` (name, email, phone)
   - Fetch shipping via `GET /shipments/{shipping_id}` (status, tracking)
4. **Upsert to Supabase** — insert or update in `cacife_orders` with `channel = 'mercadolivre'`.

### 3.3 Initial load

Sync only the last 30 days of orders (not the full 57k history). Paginate in batches of 50.

## 4. Dashboard — Global Channel Filter

### 4.1 Filter UI

A dropdown in the header, to the LEFT of the period filters:

- **Todos os Canais** (default — shows combined data)
- **Nuvemshop**
- **Mercado Livre**

### 4.2 Behavior

- The filter is global — affects KPIs, charts, orders table, and search.
- All Supabase queries add `.eq('channel', selected)` when a specific channel is selected.
- When "Todos os Canais" is selected, no channel filter is applied.
- The orders table shows a visual badge/tag next to each order indicating the source (Nuvemshop or ML icon).

### 4.3 Pages affected

- `index.html` (orders) — primary filter + badge
- `ranking-produtos.html` — product ranking per channel
- Other pages (CRM, abandoned carts, inventory) remain Nuvemshop-only for now.

## 5. Out of Scope

- ML questions/perguntas integration
- ML listings/anuncios management
- CRM integration with ML orders
- Abandoned carts from ML
- Multi-seller support (only Cacife ML account for now)
