'use strict';
// Camada de dados do robô: números por canal, sempre em CENTAVOS.
// Shopee: tabela shopee_orders. Mercado Livre e Nuvemshop: tabela cacife_orders.
// Tudo lido do banco (Supabase) — soma no SQL, instantâneo para qualquer período.
const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);
const cents = (reais) => Math.round(num(reais) * 100);

// --- Shopee (shopee_orders, valores em reais -> centavos) ---
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

// Filtro de "pago" por canal em cacife_orders (status vêm em PT e EN misturados).
const PAID_CLAUSE = {
  mercadolivre: "payment_status = 'paid'",
  nuvemshop: "payment_status in ('paid','Confirmado')",
};

// --- Mercado Livre / Nuvemshop (cacife_orders via SQL agregado) ---
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
async function channelSummary(pgQuery, period, channel) {
  const paid = PAID_CLAUSE[channel]; // canal restrito ao conjunto fixo
  if (!paid) throw new Error('canal desconhecido: ' + channel);
  // datas só entram no SQL se forem instantes ISO estritos (blinda contra injeção)
  if (!ISO_RE.test(period.startISO) || !ISO_RE.test(period.endExclusiveISO)) throw new Error('período inválido');
  const sql = `select
      count(*) filter (where ${paid}) as orders,
      coalesce(round(sum(total) filter (where ${paid}) * 100), 0) as revenue,
      coalesce(round(sum(coalesce(sale_fee,0)) filter (where ${paid}) * 100), 0) as fees
    from cacife_orders
    where channel = '${channel}'
      and created_at >= '${period.startISO}' and created_at < '${period.endExclusiveISO}'`;
  const rows = (await pgQuery(sql)) || [];
  const r = rows[0] || { orders: 0, revenue: 0, fees: 0 };
  const revenue = num(r.revenue), fees = num(r.fees);
  const net = channel === 'nuvemshop' ? revenue : revenue - fees; // NS não tem comissão
  return { revenue, net, orders: num(r.orders) };
}

function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout ' + label)), ms)),
  ]);
}

async function safe(fn, ms, label) {
  try { return await withTimeout(Promise.resolve().then(fn), ms, label); }
  catch (e) { console.error('bot-data canal ' + label + ':', e.message); return { error: true, revenue: 0, net: 0, orders: 0 }; }
}

async function overview(deps, period, timeoutMs = 20000) {
  const [shopee, mercadolivre, nuvemshop] = await Promise.all([
    safe(() => shopeeSummary(deps.shopeeRest, period), timeoutMs, 'shopee'),
    safe(() => channelSummary(deps.pgQuery, period, 'mercadolivre'), timeoutMs, 'mercadolivre'),
    safe(() => channelSummary(deps.pgQuery, period, 'nuvemshop'), timeoutMs, 'nuvemshop'),
  ]);
  const channels = { shopee, mercadolivre, nuvemshop };
  const total = { revenue: 0, net: 0, orders: 0 };
  for (const c of Object.values(channels)) {
    if (c.error) continue;
    total.revenue += c.revenue; total.net += c.net; total.orders += c.orders;
  }
  return { channels, total, period: { start: period.start, end: period.end, label: period.label } };
}

module.exports = { shopeeSummary, channelSummary, overview, PAID_CLAUSE };
