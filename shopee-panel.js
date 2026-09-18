// Integração da Shopee no painel de canais (Visão Geral + aba Shopee).
// Busca os dados por período no servidor de produção (/api/shopee/overview) usando a sessão do usuário.
(function (root) {
  'use strict';
  const BASE = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
    ? 'https://cacife.quanticsolutions.com.br' : '';
  let client;
  function sb() { if (!client) client = root.supabase.createClient(root.SUPABASE_CONFIG.URL, root.SUPABASE_CONFIG.KEY); return client; }
  const cache = new Map();
  async function overview(start, end) {
    const key = start + ':' + end;
    if (cache.has(key)) return cache.get(key);
    const promise = (async () => {
      const { data: { session } } = await sb().auth.getSession();
      if (!session) return null;
      const r = await fetch(BASE + '/api/shopee/overview?' + new URLSearchParams({ start, end }), { headers: { Authorization: 'Bearer ' + session.access_token } });
      if (!r.ok) return null;
      return r.json();
    })().catch(() => null);
    cache.set(key, promise);
    return promise;
  }

  // ---------- helpers ----------
  const SHOPEE = '#ee4d2d', GREEN = '#16a34a', AMBER = '#f59e0b', RED = '#ef4444';
  const PAY_COLORS = { 'Credit Card': '#6366f1', 'Pix': '#06b6d4', 'SParcelado': '#8b5cf6', 'Boleto Bancário': '#f59e0b', 'Combined Payment': '#64748b', 'Google Pay': '#22c55e', 'Maree Balance': '#ec4899', '?': '#64748b' };
  const SHIP_COLORS = { 'Shopee Xpress': '#ee4d2d', 'Full': '#3b82f6', 'Entrega Direta': '#22c55e', 'Retirada pelo Comprador': '#a855f7', 'Turbo': '#f59e0b', '?': '#64748b' };
  const PALETTE = ['#ee4d2d', '#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#64748b'];
  const n = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const svgEl = (tag, attrs = {}, text) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; };
  const brl = c => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(c) || 0) / 100);
  const brlShort = c => 'R$ ' + new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format((Number(c) || 0) / 100);
  const num = v => new Intl.NumberFormat('pt-BR').format(Number(v) || 0);
  const colorFor = (label, map, i) => map[label] || PALETTE[i % PALETTE.length];

  function ensureStyle() {
    if (document.getElementById('shp-style')) return;
    const css = `
    .shp-wrap{display:flex;flex-direction:column;gap:16px}
    .shp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px}
    .shp-kpi{position:relative;background:var(--panel-bg,#17191f);border:1px solid var(--panel-border,#2a2e37);border-radius:14px;padding:14px 16px 14px 18px;overflow:hidden}
    .shp-kpi::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--accent,#ee4d2d)}
    .shp-kpi .k-lbl{font-size:.78rem;color:var(--muted,#9aa0ab);font-weight:500}
    .shp-kpi .k-val{font-size:1.5rem;font-weight:800;letter-spacing:-.02em;margin-top:6px;color:var(--accent,inherit)}
    .shp-kpi .k-sub{font-size:.74rem;color:var(--muted,#9aa0ab);margin-top:3px}
    .shp-panel{background:var(--panel-bg,#17191f);border:1px solid var(--panel-border,#2a2e37);border-radius:16px;padding:18px 20px}
    .shp-panel h3{font-size:.98rem;font-weight:700;margin:0 0 4px;display:flex;align-items:center;gap:8px}
    .shp-panel .cap{font-size:.78rem;color:var(--muted,#9aa0ab);margin:0 0 12px}
    .shp-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    @media(max-width:760px){.shp-cols{grid-template-columns:1fr}}
    .shp-donut{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
    .shp-legend{display:flex;flex-direction:column;gap:7px;flex:1;min-width:150px}
    .shp-legrow{display:flex;align-items:center;gap:8px;font-size:.84rem}
    .shp-legrow .dot{width:10px;height:10px;border-radius:3px;flex:none}
    .shp-legrow .lg-n{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums}
    .shp-hbar{margin:9px 0;font-size:.84rem}
    .shp-hbar .hb-top{display:flex;justify-content:space-between;margin-bottom:4px}
    .shp-hbar .hb-track{height:10px;background:var(--track,#23262e);border-radius:999px;overflow:hidden}
    .shp-hbar .hb-fill{height:100%;border-radius:999px}
    .shp-prod{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--panel-border,#2a2e37)}
    .shp-prod:last-child{border-bottom:0}
    .shp-prod .rk{width:22px;text-align:center;font-weight:800;color:var(--muted,#9aa0ab);flex:none}
    .shp-prod img{width:46px;height:46px;border-radius:10px;object-fit:cover;background:#23262e;flex:none}
    .shp-prod .ph{width:46px;height:46px;border-radius:10px;background:#23262e;display:flex;align-items:center;justify-content:center;color:#556;flex:none}
    .shp-prod .pn{flex:1;min-width:0}
    .shp-prod .pn b{display:block;font-size:.86rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .shp-prod .pn .u{font-size:.76rem;color:var(--muted,#9aa0ab)}
    .shp-prod .pv{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
    .shp-src{font-size:.74rem;color:var(--muted,#9aa0ab)}
    .shp-chart text{fill:var(--muted,#9aa0ab);font-size:9px}`;
    document.head.append(Object.assign(document.createElement('style'), { id: 'shp-style', textContent: css }));
  }

  function kpi(label, value, sub, accent) {
    const e = n('div', 'shp-kpi'); e.style.setProperty('--accent', accent || SHOPEE);
    e.append(n('div', 'k-lbl', label), n('div', 'k-val', value)); if (sub) e.append(n('div', 'k-sub', sub));
    return e;
  }

  // gráfico de área + linha das vendas diárias
  function salesChart(byDay) {
    const keys = Object.keys(byDay || {}).sort();
    if (!keys.length) return n('p', 'shp-src', 'Sem vendas no período.');
    const first = keys[0], last = keys[keys.length - 1];
    const dates = []; for (let d = new Date(first); d <= new Date(last); d.setDate(d.getDate() + 1)) dates.push(d.toISOString().slice(0, 10));
    const vals = dates.map(d => byDay[d] || 0);
    const w = 640, h = 170, l = 42, r = 12, t = 12, b = 22, max = Math.max(100, ...vals);
    const x = i => l + (dates.length < 2 ? 0 : i / (dates.length - 1) * (w - l - r));
    const y = v => h - b - v / max * (h - t - b);
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'shp-chart', preserveAspectRatio: 'none', style: 'width:100%;height:180px' });
    const grad = svgEl('linearGradient', { id: 'shpGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(svgEl('stop', { offset: '0%', 'stop-color': SHOPEE, 'stop-opacity': .35 }), svgEl('stop', { offset: '100%', 'stop-color': SHOPEE, 'stop-opacity': 0 }));
    svg.append(svgEl('defs', {}), grad);
    for (let i = 0; i <= 3; i++) { const gy = t + (h - t - b) * i / 3; svg.append(svgEl('line', { x1: l, y1: gy, x2: w - r, y2: gy, stroke: 'var(--panel-border,#2a2e37)', 'stroke-width': .5 }), svgEl('text', { x: l - 6, y: gy + 3, 'text-anchor': 'end' }, brlShort(max * (1 - i / 3)))); }
    const line = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    svg.append(svgEl('polygon', { points: `${l},${h - b} ${line} ${x(dates.length - 1)},${h - b}`, fill: 'url(#shpGrad)' }));
    svg.append(svgEl('polyline', { points: line, fill: 'none', stroke: SHOPEE, 'stroke-width': 2 }));
    const idx = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])];
    for (const i of idx) svg.append(svgEl('text', { x: x(i), y: h - 6, 'text-anchor': i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle' }, dates[i].slice(5).split('-').reverse().join('/')));
    return svg;
  }

  function donut(entries) {
    const total = entries.reduce((s, e) => s + e.value, 0) || 1;
    const svg = svgEl('svg', { viewBox: '0 0 120 120', width: 132, height: 132 });
    svg.append(svgEl('circle', { cx: 60, cy: 60, r: 46, fill: 'none', stroke: 'var(--track,#23262e)', 'stroke-width': 16 }));
    let off = 0;
    for (const e of entries) { const frac = e.value / total * 100; if (frac <= 0) continue; svg.append(svgEl('circle', { cx: 60, cy: 60, r: 46, pathLength: 100, fill: 'none', stroke: e.color, 'stroke-width': 16, 'stroke-dasharray': `${frac} ${100 - frac}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 60 60)' })); off += frac; }
    const box = n('div', 'shp-donut'); box.append(svg);
    const leg = n('div', 'shp-legend');
    for (const e of entries) { const row = n('div', 'shp-legrow'); const dot = n('span', 'dot'); dot.style.background = e.color; row.append(dot, n('span', '', e.label), n('span', 'lg-n', num(e.value))); leg.append(row); }
    box.append(leg); return box;
  }

  function hbars(entries) {
    const wrap = n('div'); const max = Math.max(1, ...entries.map(e => e.value));
    for (const e of entries) { const row = n('div', 'shp-hbar'); const top = n('div', 'hb-top'); top.append(n('span', '', e.label), n('strong', '', num(e.value))); const tr = n('div', 'hb-track'); const fl = n('div', 'hb-fill'); fl.style.width = (e.value / max * 100) + '%'; fl.style.background = e.color; tr.append(fl); row.append(top, tr); wrap.append(row); }
    return wrap;
  }

  function panel(title, cap) { const e = n('section', 'shp-panel'); e.append(n('h3', '', title)); if (cap) e.append(n('p', 'cap', cap)); return e; }

  function render(target, data, state) {
    ensureStyle();
    target.replaceChildren(); target.hidden = false; document.body.dataset.marketplace = 'shopee';
    const wrap = n('div', 'shp-wrap');
    const hero = n('div', 'marketplace-hero');
    hero.append(n('span', 'marketplace-eyebrow', 'CANAL SHOPEE'), n('h2', '', 'Repasse, taxas e desempenho'), n('p', '', 'Vendas confirmadas, valor líquido de repasse e detalhes da operação Shopee no período selecionado.'));
    wrap.append(hero);
    if (!data) { const p = panel('Shopee'); p.append(n('p', 'cap', state || 'Carregando dados da Shopee…')); wrap.append(p); target.append(wrap); return; }

    const taxaPct = data.revenue > 0 ? (data.fees / data.revenue * 100).toFixed(1) : '0';
    const liqPct = data.revenue > 0 ? (data.liquido / data.revenue * 100).toFixed(0) : '0';

    const kpis = n('div', 'shp-kpis');
    kpis.append(
      kpi('Faturamento bruto', brl(data.revenue), 'pago pelos clientes', SHOPEE),
      kpi('Repasse líquido', brl(data.liquido), liqPct + '% do bruto', GREEN),
      kpi('Taxas Shopee', brl(data.fees), taxaPct + '% do bruto', AMBER),
      kpi('Pedidos pagos', num(data.paid), num(data.cancelled) + ' cancelados', '#3b82f6'),
      kpi('Desconto do lojista', brl(data.discounts), 'cupons que você bancou', '#8b5cf6'),
      kpi('Ticket médio', brl(data.ticket), 'por pedido pago', '#06b6d4'),
    );
    wrap.append(kpis);

    const chart = panel('Evolução das vendas', 'Vendas confirmadas por dia no período.');
    chart.append(salesChart(data.byDay)); wrap.append(chart);

    const cols = n('div', 'shp-cols');
    const pay = panel('Forma de pagamento', 'Pedidos pagos por método.');
    if (data.pagamento?.length) pay.append(donut(data.pagamento.map((p, i) => ({ label: p.metodo, value: p.n, color: colorFor(p.metodo, PAY_COLORS, i) }))));
    else pay.append(n('p', 'cap', 'Sem dados.'));
    const ship = panel('Envio', 'Full = Shopee entrega. Xpress = transportadora Shopee.');
    if (data.envio?.length) ship.append(hbars(data.envio.map((s, i) => ({ label: s.tipo, value: s.n, color: colorFor(s.tipo, SHIP_COLORS, i) }))));
    else ship.append(n('p', 'cap', 'Sem dados.'));
    cols.append(pay, ship); wrap.append(cols);

    const top = panel('Top produtos', 'Itens de pedidos pagos no período.');
    const maxV = Math.max(1, ...(data.ranking || []).map(p => p.value));
    (data.ranking || []).forEach((p, i) => {
      const row = n('div', 'shp-prod'); row.append(n('span', 'rk', String(i + 1)));
      if (p.image) { const img = n('img'); img.src = p.image; img.loading = 'lazy'; img.alt = ''; img.onerror = () => { const ph = n('span', 'ph'); ph.append(n('i', 'ph ph-image')); img.replaceWith(ph); }; row.append(img); }
      else { const ph = n('span', 'ph'); ph.append(n('i', 'ph ph-image')); row.append(ph); }
      const info = n('div', 'pn'); const b = n('b', '', p.title); b.title = p.title; info.append(b, n('span', 'u', num(p.units) + ' un · ' + Math.round(p.value / maxV * 100) + '% do top'));
      row.append(info, n('span', 'pv', brl(p.value))); top.append(row);
    });
    if (!(data.ranking || []).length) top.append(n('p', 'cap', 'Nenhum item no período.'));
    wrap.append(top);

    const ret = panel('Devoluções', 'Pedidos devolvidos no período.');
    const rk = n('div', 'shp-kpis');
    rk.append(kpi('Devoluções', num(data.devolucoes?.n), 'no período', RED), kpi('Reembolsado', brl(data.devolucoes?.valor), 'valor devolvido', RED));
    ret.append(rk); wrap.append(ret);

    wrap.append(n('p', 'shp-src', 'API Shopee · loja Cacife Brand · repasse via escrow · consulta em ' + new Date().toLocaleString('pt-BR')));
    target.append(wrap);
  }

  root.CacifeShopee = { overview, render };
})(window);
