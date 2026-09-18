// Integração da Shopee no painel de canais (Visão Geral + aba Shopee com sub-abas).
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

  // ---------- cores / helpers ----------
  const SHOPEE = '#ee4d2d', GREEN = '#16a34a', AMBER = '#f59e0b', RED = '#ef4444', BLUE = '#3b82f6';
  const PAY_COLORS = { 'Credit Card': '#6366f1', 'Pix': '#06b6d4', 'SParcelado': '#8b5cf6', 'Boleto Bancário': '#f59e0b', 'Combined Payment': '#64748b', 'Google Pay': '#22c55e', 'Maree Balance': '#ec4899', '?': '#64748b' };
  const SHIP_COLORS = { 'Shopee Xpress': '#ee4d2d', 'Full': '#3b82f6', 'Entrega Direta': '#22c55e', 'Retirada pelo Comprador': '#a855f7', 'Turbo': '#f59e0b', '?': '#64748b' };
  const PALETTE = ['#ee4d2d', '#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#64748b'];
  const STATUS = {
    COMPLETED: ['Concluído', GREEN], TO_CONFIRM_RECEIVE: ['A caminho', BLUE], SHIPPED: ['Enviado', BLUE],
    PROCESSED: ['Processado', BLUE], READY_TO_SHIP: ['Pronto p/ envio', BLUE], RETRY_SHIP: ['Reenvio', BLUE],
    UNPAID: ['Não pago', '#94a3b8'], IN_CANCEL: ['Em cancelamento', '#f97316'], CANCELLED: ['Cancelado', RED], TO_RETURN: ['Devolução', '#a855f7'],
  };
  const PAYST = { paid: ['Pago', GREEN], pending: ['Pendente', AMBER], cancelled: ['Cancelado', RED] };
  const n = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const svgEl = (tag, attrs = {}, text) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; };
  const brl = c => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(c) || 0) / 100);
  const kShort = c => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format((Number(c) || 0) / 100);
  const num = v => new Intl.NumberFormat('pt-BR').format(Number(v) || 0);
  const colorFor = (label, map, i) => map[label] || PALETTE[i % PALETTE.length];
  const statusInfo = s => STATUS[s] || [s === '?' ? '—' : s, '#94a3b8'];
  const badge = (text, color) => { const e = n('span', 'shp-badge', text); e.style.color = color; e.style.background = color + '22'; return e; };

  function ensureStyle() {
    if (document.getElementById('shp-style')) return;
    const css = `
    .shp-wrap{display:flex;flex-direction:column;gap:16px}
    .shp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
    .shp-kpi{position:relative;background:var(--panel,#fff);border:1px solid var(--line,#e6dff0);border-radius:14px;padding:13px 15px 13px 17px;overflow:hidden;color:var(--text,#241635)}
    .shp-kpi::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--accent,#ee4d2d)}
    .shp-kpi .k-lbl{font-size:.76rem;color:var(--muted,#756582);font-weight:500}
    .shp-kpi .k-val{font-size:1.35rem;font-weight:800;letter-spacing:-.02em;margin-top:5px;color:var(--accent,inherit)}
    .shp-kpi .k-sub{font-size:.7rem;color:var(--muted,#756582);margin-top:3px}
    .shp-panel{background:var(--panel,#fff);border:1px solid var(--line,#e6dff0);border-radius:16px;padding:18px 20px;color:var(--text,#241635)}
    .shp-panel h3{font-size:.98rem;font-weight:700;margin:0 0 4px;display:flex;align-items:center;gap:8px}
    .shp-panel .cap{font-size:.78rem;color:var(--muted,#756582);margin:0 0 12px}
    .shp-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    @media(max-width:760px){.shp-cols{grid-template-columns:1fr}}
    .shp-donut{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
    .shp-legend{display:flex;flex-direction:column;gap:7px;flex:1;min-width:150px}
    .shp-legrow{display:flex;align-items:center;gap:8px;font-size:.84rem}
    .shp-legrow .dot{width:10px;height:10px;border-radius:3px;flex:none}
    .shp-legrow .lg-n{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums}
    .shp-hbar{margin:9px 0;font-size:.84rem}
    .shp-hbar .hb-top{display:flex;justify-content:space-between;margin-bottom:4px}
    .shp-hbar .hb-track{height:10px;background:rgba(128,128,128,.18);border-radius:999px;overflow:hidden}
    .shp-hbar .hb-fill{height:100%;border-radius:999px}
    .shp-prod{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line,#e6dff0)}
    .shp-prod:last-child{border-bottom:0}
    .shp-prod .rk{width:22px;text-align:center;font-weight:800;color:var(--muted,#756582);flex:none}
    .shp-prod img{width:46px;height:46px;border-radius:10px;object-fit:cover;background:rgba(128,128,128,.15);flex:none}
    .shp-prod .ph{width:46px;height:46px;border-radius:10px;background:rgba(128,128,128,.15);display:flex;align-items:center;justify-content:center;color:var(--muted,#999);flex:none}
    .shp-prod .pn{flex:1;min-width:0}
    .shp-prod .pn b{display:block;font-size:.86rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .shp-prod .pn .u{font-size:.76rem;color:var(--muted,#756582)}
    .shp-prod .pv{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
    .shp-src{font-size:.74rem;color:var(--muted,#756582)}
    .shp-chart text{fill:var(--muted,#756582);font-size:9px}
    .shp-tabs{display:flex;gap:14px;background:var(--panel,#fff);border:1px solid var(--line,#e6dff0);border-radius:12px;padding:0 12px;overflow:auto}
    .shp-tab{white-space:nowrap;background:transparent;border:0;border-bottom:3px solid transparent;padding:16px 12px;font-size:.9rem;font-weight:500;color:var(--muted,#756582);cursor:pointer}
    .shp-tab:hover{color:var(--text,#241635)}
    .shp-tab.on{color:var(--shopee,#ee4d2d);border-bottom-color:var(--shopee,#ee4d2d);font-weight:600}
    .shp-tbl{width:100%;border-collapse:collapse;font-size:.82rem}
    .shp-tbl th{text-align:left;padding:8px;color:var(--muted,#756582);font-weight:600;font-size:.74rem;border-bottom:1px solid var(--line,#e6dff0);white-space:nowrap}
    .shp-tbl td{padding:8px;border-bottom:1px solid var(--line,#e6dff0);white-space:nowrap}
    .shp-tbl td.r,.shp-tbl th.r{text-align:right;font-variant-numeric:tabular-nums}
    .shp-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:600;white-space:nowrap}
    .shp-scroll{overflow-x:auto}`;
    document.head.append(Object.assign(document.createElement('style'), { id: 'shp-style', textContent: css }));
  }

  function kpi(label, value, sub, accent) {
    const e = n('div', 'shp-kpi'); e.style.setProperty('--accent', accent || SHOPEE);
    e.append(n('div', 'k-lbl', label), n('div', 'k-val', value)); if (sub) e.append(n('div', 'k-sub', sub));
    return e;
  }
  function panel(title, cap) { const e = n('section', 'shp-panel'); e.append(n('h3', '', title)); if (cap) e.append(n('p', 'cap', cap)); return e; }

  function salesChart(byDay) {
    const keys = Object.keys(byDay || {}).sort();
    if (!keys.length) return n('p', 'cap', 'Sem vendas no período.');
    const first = keys[0], last = keys[keys.length - 1];
    const dates = []; for (let d = new Date(first); d <= new Date(last); d.setDate(d.getDate() + 1)) dates.push(d.toISOString().slice(0, 10));
    const vals = dates.map(d => byDay[d] || 0);
    const w = 680, h = 168, l = 56, r = 14, t = 10, b = 20, max = Math.max(100, ...vals);
    const x = i => l + (dates.length < 2 ? 0 : i / (dates.length - 1) * (w - l - r));
    const y = v => h - b - v / max * (h - t - b);
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'shp-chart', style: 'width:100%;height:auto;max-height:190px;display:block' });
    const grad = svgEl('linearGradient', { id: 'shpGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(svgEl('stop', { offset: '0%', 'stop-color': SHOPEE, 'stop-opacity': .35 }), svgEl('stop', { offset: '100%', 'stop-color': SHOPEE, 'stop-opacity': 0 }));
    svg.append(svgEl('defs', {}), grad);
    for (let i = 0; i <= 3; i++) { const gy = t + (h - t - b) * i / 3; svg.append(svgEl('line', { x1: l, y1: gy, x2: w - r, y2: gy, stroke: 'var(--line,#e6dff0)', 'stroke-width': .5 }), svgEl('text', { x: l - 8, y: gy + 3, 'text-anchor': 'end' }, kShort(max * (1 - i / 3)))); }
    const line = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    svg.append(svgEl('polygon', { points: `${l},${h - b} ${line} ${x(dates.length - 1)},${h - b}`, fill: 'url(#shpGrad)' }));
    svg.append(svgEl('polyline', { points: line, fill: 'none', stroke: SHOPEE, 'stroke-width': 2 }));
    const idx = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])];
    for (const i of idx) svg.append(svgEl('text', { x: x(i), y: h - 6, 'text-anchor': i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle' }, dates[i].slice(5).split('-').reverse().join('/')));
    return svg;
  }
  function donut(entries) {
    const total = entries.reduce((s, e) => s + e.value, 0) || 1;
    const svg = svgEl('svg', { viewBox: '0 0 120 120', width: 128, height: 128 });
    svg.append(svgEl('circle', { cx: 60, cy: 60, r: 46, fill: 'none', stroke: 'rgba(128,128,128,.18)', 'stroke-width': 16 }));
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
  function productRow(p, i, maxV) {
    const row = n('div', 'shp-prod'); row.append(n('span', 'rk', String(i + 1)));
    if (p.image) { const img = n('img'); img.src = p.image; img.loading = 'lazy'; img.alt = ''; img.onerror = () => { const ph = n('span', 'ph'); ph.append(n('i', 'ph ph-image')); img.replaceWith(ph); }; row.append(img); }
    else { const ph = n('span', 'ph'); ph.append(n('i', 'ph ph-image')); row.append(ph); }
    const info = n('div', 'pn'); const b = n('b', '', p.title); b.title = p.title; info.append(b, n('span', 'u', num(p.units) + ' un · ' + Math.round(p.value / maxV * 100) + '% do top'));
    row.append(info, n('span', 'pv', brl(p.value))); return row;
  }
  function table(headers, rows) {
    const scroll = n('div', 'shp-scroll'), tbl = n('table', 'shp-tbl'), thead = n('thead'), tr = n('tr');
    for (const h of headers) tr.append(n('th', h.r ? 'r' : '', h.t)); thead.append(tr); tbl.append(thead);
    const body = n('tbody');
    for (const r of rows) { const trr = n('tr'); for (const c of r) { const td = n('td', c && c.r ? 'r' : ''); if (c && c.node) td.append(c.node); else td.textContent = (c && c.t !== undefined) ? c.t : (c == null ? '—' : c); trr.append(td); } body.append(trr); }
    tbl.append(body); scroll.append(tbl); return scroll;
  }

  // ---------- seções ----------
  function secVisao(data) {
    const box = n('div', 'shp-wrap');
    const taxaPct = data.revenue > 0 ? (data.fees / data.revenue * 100).toFixed(1) : '0';
    const liqPct = data.revenue > 0 ? (data.liquido / data.revenue * 100).toFixed(0) : '0';
    const kpis = n('div', 'shp-kpis');
    kpis.append(
      kpi('Faturamento bruto', brl(data.revenue), 'pago pelos clientes', SHOPEE),
      kpi('Repasse líquido', brl(data.liquido), liqPct + '% do bruto', GREEN),
      kpi('Taxas Shopee', brl(data.fees), taxaPct + '% do bruto', AMBER),
      kpi('Pedidos pagos', num(data.paid), num(data.cancelled) + ' cancelados', BLUE),
      kpi('Ticket médio', brl(data.ticket), 'por pedido pago', '#06b6d4'),
      kpi('Reembolsado', brl(data.devolucoes?.valor), num(data.devolucoes?.n) + ' devoluções', RED),
    );
    box.append(kpis);
    const chart = panel('Evolução das vendas', 'Vendas confirmadas por dia no período (R$).'); chart.append(salesChart(data.byDay)); box.append(chart);
    const cols = n('div', 'shp-cols');
    const pay = panel('Forma de pagamento', 'Pedidos pagos por método.');
    if (data.pagamento?.length) pay.append(donut(data.pagamento.map((p, i) => ({ label: p.metodo, value: p.n, color: colorFor(p.metodo, PAY_COLORS, i) })))); else pay.append(n('p', 'cap', 'Sem dados.'));
    const ship = panel('Envio', 'Full = Shopee entrega. Xpress = transportadora Shopee.');
    if (data.envio?.length) ship.append(hbars(data.envio.map((s, i) => ({ label: s.tipo, value: s.n, color: colorFor(s.tipo, SHIP_COLORS, i) })))); else ship.append(n('p', 'cap', 'Sem dados.'));
    cols.append(pay, ship); box.append(cols);
    const top = panel('Top produtos', 'Os 5 mais vendidos no período.');
    const mx = Math.max(1, ...(data.ranking || []).map(p => p.value));
    (data.ranking || []).slice(0, 5).forEach((p, i) => top.append(productRow(p, i, mx)));
    if (!(data.ranking || []).length) top.append(n('p', 'cap', 'Nenhum item no período.'));
    box.append(top);
    return box;
  }
  function secPedidos(data) {
    const box = n('div', 'shp-wrap');
    const st = panel('Status dos pedidos', 'Distribuição dos pedidos do período por situação.');
    if (data.porStatus?.length) st.append(hbars(data.porStatus.map(s => ({ label: statusInfo(s.status)[0], value: s.n, color: statusInfo(s.status)[1] })))); else st.append(n('p', 'cap', 'Sem dados.'));
    box.append(st);
    const rec = panel('Pedidos recentes', 'Últimos 40 pedidos do período.');
    const rows = (data.recentes || []).map(o => {
      const [sl, sc] = statusInfo(o.status); const [pl, pc] = PAYST[o.pay_status] || [o.pay_status, '#94a3b8'];
      return [o.id, o.dt, { node: badge(sl, sc) }, { node: badge(pl, pc) }, o.pay, { r: true, t: brl(o.total) }];
    });
    rec.append(table([{ t: 'Pedido' }, { t: 'Data' }, { t: 'Status' }, { t: 'Pagamento' }, { t: 'Método' }, { t: 'Valor', r: true }], rows));
    if (!rows.length) rec.append(n('p', 'cap', 'Nenhum pedido no período.'));
    box.append(rec);
    return box;
  }
  function secProdutos(data) {
    const box = n('div', 'shp-wrap');
    const top = panel('Top produtos', 'Itens de pedidos pagos no período, por valor vendido.');
    const mx = Math.max(1, ...(data.ranking || []).map(p => p.value));
    (data.ranking || []).forEach((p, i) => top.append(productRow(p, i, mx)));
    if (!(data.ranking || []).length) top.append(n('p', 'cap', 'Nenhum item no período.'));
    box.append(top); return box;
  }
  function secDevolucoes(data) {
    const box = n('div', 'shp-wrap');
    const kp = n('div', 'shp-kpis'); kp.append(kpi('Devoluções', num(data.devolucoes?.n), 'no período', RED), kpi('Reembolsado', brl(data.devolucoes?.valor), 'valor devolvido', RED)); box.append(kp);
    const lst = panel('Devoluções recentes', 'Últimas 30 devoluções do período.');
    const rows = (data.devList || []).map(d => { const [sl, sc] = statusInfo(d.status); return [d.return_sn, d.order_sn, { node: badge(sl, sc) }, d.reason, d.dt, { r: true, t: brl(d.refund) }]; });
    lst.append(table([{ t: 'Devolução' }, { t: 'Pedido' }, { t: 'Status' }, { t: 'Motivo' }, { t: 'Data' }, { t: 'Reembolso', r: true }], rows));
    if (!rows.length) lst.append(n('p', 'cap', 'Nenhuma devolução no período.'));
    box.append(lst); return box;
  }

  const TABS = [['Resumo', secVisao], ['Pedidos', secPedidos], ['Produtos', secProdutos], ['Devoluções', secDevolucoes]];

  function render(target, data, state) {
    ensureStyle();
    target.replaceChildren(); target.hidden = false; document.body.dataset.marketplace = 'shopee';
    const wrap = n('div', 'shp-wrap');
    if (!data) { const p = panel('Shopee'); p.append(n('p', 'cap', state || 'Carregando dados da Shopee…')); wrap.append(p); target.append(wrap); return; }

    // menu (mesmo estilo das outras abas) no topo
    const tabsEl = n('div', 'shp-tabs'), content = n('div');
    let active = (root.__shopeeTab && TABS.some(t => t[0] === root.__shopeeTab)) ? root.__shopeeTab : 'Resumo';
    const paint = () => {
      [...tabsEl.children].forEach(btn => btn.classList.toggle('on', btn.textContent === active));
      const sec = TABS.find(t => t[0] === active)[1];
      content.replaceChildren(sec(data));
    };
    for (const [label] of TABS) { const btn = n('button', 'shp-tab', label); btn.type = 'button'; btn.onclick = () => { active = label; root.__shopeeTab = label; paint(); }; tabsEl.append(btn); }
    wrap.append(tabsEl, content);
    paint();
    target.append(wrap);
  }

  root.CacifeShopee = { overview, render };
})(window);
