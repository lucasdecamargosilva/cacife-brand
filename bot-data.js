'use strict';
// Camada de dados do robô: números por canal, sempre em CENTAVOS.
// Shopee vem do Supabase (reais -> *100). ML e NS vêm crus das APIs.
const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);
const cents = (reais) => Math.round(num(reais) * 100);

// --- Shopee (Supabase) ---
async function shopeeSummary(rest, period) {
  const q = `shopee_orders?select=total,escrow_amount`
    + `&payment_status=eq.paid`
    + `&created_at=gte.${encodeURIComponent(period.startISO)}`
    + `&created_at=lt.${encodeURIComponent(period.endExclusiveISO)}`;
  const rows = (await rest(q)) || [];
  let revenue = 0, net = 0;
  for (const r of rows) { revenue += cents(r.total); net += cents(r.escrow_amount); }
  return { revenue, net, orders: rows.length };
}

// --- Mercado Livre (pedidos crus da API) ---
const ML_PAID = new Set(['paid', 'partially_refunded']);
async function mlSummary(fetchOrders, period) {
  const orders = (await fetchOrders(period.start, period.end)) || [];
  let revenue = 0, fees = 0, count = 0;
  for (const o of orders) {
    if (!ML_PAID.has(o.status)) continue;
    if (o.currency_id && o.currency_id !== 'BRL') continue;
    revenue += cents(o.total_amount);
    for (const it of (o.order_items || [])) fees += cents(it.sale_fee);
    count++;
  }
  return { revenue, net: revenue - fees, orders: count };
}

// --- Nuvemshop (pedidos crus da API) ---
async function nsSummary(fetchOrders, period) {
  const orders = (await fetchOrders(period.start, period.end)) || [];
  let revenue = 0, count = 0;
  for (const o of orders) {
    const paid = o.paid_at || o.status === 'paid';
    if (!paid) continue;
    revenue += cents(o.total);
    count++;
  }
  return { revenue, net: revenue, orders: count };
}

async function safe(fn) {
  try { return await fn(); }
  catch (e) { console.error('bot-data canal:', e.message); return { error: true, revenue: 0, net: 0, orders: 0 }; }
}

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
