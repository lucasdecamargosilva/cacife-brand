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

// --- Produtos: ranking e busca por nome, com VALOR (R$) rateado do total pago do pedido ---
// Shopee: rateio exato pelo preço do item. ML/NS: product_name é lista "A, B, C" por pedido,
// então o total é dividido igualmente entre os produtos do pedido (aproximado em pedidos com >1 item).
const brlStr = (reais) => { const v = Number(reais || 0); const [i, d] = v.toFixed(2).split('.'); return 'R$ ' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; };
const short = (s) => { const t = String(s || '').trim(); return t.length > 42 ? t.slice(0, 42).trim() + '…' : t; };
const sqlLit = (s) => String(s).replace(/'/g, "''"); // escapa aspas para termos de busca
// Busca sem acento e por palavra: "oculos madrid" acha "Óculos de Sol Madrid ...".
const ACENTOS = 'áàâãäéèêëíìîïóòôõöúùûüç', SEM = 'aaaaaeeeeiiiiooooouuuuc';
const semAcento = (s) => String(s).toLowerCase().split('').map((ch) => { const i = ACENTOS.indexOf(ch); return i >= 0 ? SEM[i] : ch; }).join('');
function termoClause(col, termo) {
  const palavras = semAcento(termo).replace(/[%_]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
  if (!palavras.length) return null;
  const norm = `translate(lower(${col}), '${ACENTOS}', '${SEM}')`;
  return palavras.map((w) => `${norm} like '%${sqlLit(w)}%'`).join(' and ');
}

function productSql(period, channel, { limit = 3, termo = null } = {}) {
  if (!ISO_RE.test(period.startISO) || !ISO_RE.test(period.endExclusiveISO)) throw new Error('período inválido');
  const lim = Math.min(20, Math.max(1, Number(limit) || 3));
  const win = `created_at >= '${period.startISO}' and created_at < '${period.endExclusiveISO}'`;
  const like = termo ? termoClause(channel === 'shopee' ? 'item_name' : 'produto', termo) : null;
  if (channel === 'shopee') {
    // Rateio do total pago pelo preço dos itens; se algum item do pedido não tem preço, divide igual.
    return `with itens as (
        select i.item_name, i.qty, i.qty * i.price as bruto_item, o.total, i.id_pedido,
               sum(i.qty * i.price) over (partition by i.shop_id, i.id_pedido) as bruto_pedido,
               count(*) over (partition by i.shop_id, i.id_pedido) as n_itens,
               bool_or(i.price is null or i.price = 0) over (partition by i.shop_id, i.id_pedido) as sem_preco
        from shopee_order_items i
        join shopee_orders o on o.shop_id = i.shop_id and o.id_pedido = i.id_pedido
        where o.payment_status = 'paid' and o.${win}
      )
      select item_name as produto, sum(qty) as unidades, count(distinct id_pedido) as pedidos,
             round(sum(case when sem_preco or bruto_pedido is null or bruto_pedido = 0
                            then total / greatest(n_itens, 1)
                            else total * bruto_item / bruto_pedido end)::numeric, 2) as valor
      from itens ${like ? `where ${like}` : ''}
      group by item_name order by unidades desc nulls last limit ${lim}`;
  }
  const paid = PAID_CLAUSE[channel];
  if (!paid) throw new Error('canal desconhecido: ' + channel);
  return `with linhas as (
      select trim(prod) as produto, id_pedido, total,
             cardinality(string_to_array(product_name, ',')) as n_itens
      from cacife_orders, unnest(string_to_array(product_name, ',')) as prod
      where channel = '${channel}' and ${paid} and ${win} and product_name is not null and trim(prod) <> ''
    )
    select produto, count(*) as unidades, count(distinct id_pedido) as pedidos,
           round(sum(total / greatest(n_itens, 1))::numeric, 2) as valor,
           bool_or(n_itens > 1) as aproximado
    from linhas ${like ? `where ${like}` : ''}
    group by produto order by unidades desc limit ${lim}`;
}

function mapProductRows(rows, channel) {
  return (rows || []).map((r) => ({
    produto: short(r.produto), produto_completo: String(r.produto || '').trim(),
    unidades: num(r.unidades), pedidos: num(r.pedidos),
    valor: brlStr(r.valor), valor_tipo: channel === 'shopee' || !r.aproximado ? 'exato' : 'aproximado (rateio em pedidos com vários itens)',
  }));
}

async function topProducts(deps, period, channel, limit = 3) {
  const rows = await deps.pgQuery(productSql(period, channel, { limit }));
  return mapProductRows(rows, channel);
}

// Busca produto(s) por trecho do nome num canal (ex.: "madrid", "aviador").
async function productSales(deps, period, channel, termo, limit = 5) {
  if (!termo || String(termo).trim().length < 2) throw new Error('informe parte do nome do produto');
  const rows = await deps.pgQuery(productSql(period, channel, { limit, termo: String(termo).trim() }));
  return mapProductRows(rows, channel);
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

module.exports = { shopeeSummary, channelSummary, overview, topProducts, productSales, productSql, PAID_CLAUSE };
