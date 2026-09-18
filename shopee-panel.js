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
  const iconFor = t => /repasse|l[ií]quido/i.test(t) ? 'ph-coins' : /comiss|taxa/i.test(t) ? 'ph-percent' : /desconto|cupom/i.test(t) ? 'ph-tag' : /cancel/i.test(t) ? 'ph-x-circle' : /reembol|devolu/i.test(t) ? 'ph-arrow-u-up-left' : /pedidos/i.test(t) ? 'ph-bag-simple' : /unidade/i.test(t) ? 'ph-package' : /ticket/i.test(t) ? 'ph-receipt' : /vendas|faturamento|bruto/i.test(t) ? 'ph-currency-circle-dollar' : 'ph-chart-line';
  const statusInfo = s => STATUS[s] || [s === '?' ? '—' : s, '#94a3b8'];
  const badge = (text, color) => { const e = n('span', 'shp-badge', text); e.style.color = color; e.style.background = color + '22'; return e; };

  function ensureStyle() {
    if (document.getElementById('shp-style')) return;
    const css = `
    .shp-wrap{display:flex;flex-direction:column;gap:16px}
    .shp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
    .shp-kpi{position:relative;background:var(--panel,#fff);border:1px solid var(--line,#e6dff0);border-radius:14px;padding:13px 15px 13px 17px;overflow:hidden;color:var(--text,#241635)}
    .shp-kpi::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--accent,#ee4d2d)}
    .shp-kpi .k-lbl{font-size:.76rem;color:var(--muted,#756582);font-weight:500;display:flex;align-items:center;gap:7px}
    .shp-kpi .k-ico{width:24px;height:24px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;flex:none}
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
    .shp-scroll{overflow-x:auto}
    .shp-chat{display:grid;grid-template-columns:300px 1fr;border:1px solid var(--line,#e6dff0);border-radius:12px;overflow:hidden;min-height:440px}
    @media(max-width:760px){.shp-chat{grid-template-columns:1fr}}
    .shp-chat-list{border-right:1px solid var(--line,#e6dff0);max-height:540px;overflow:auto}
    .shp-conv{display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--line,#e6dff0);padding:10px 12px;cursor:pointer;color:var(--text,#241635)}
    .shp-conv:hover,.shp-conv.on{background:rgba(128,128,128,.1)}
    .shp-conv img{width:38px;height:38px;border-radius:50%;object-fit:cover;flex:none;background:rgba(128,128,128,.15)}
    .shp-conv-info{flex:1;min-width:0}
    .shp-conv-name{display:flex;align-items:center;gap:6px}
    .shp-conv-name b{font-size:.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .shp-unread{background:#ee4d2d;color:#fff;font-size:.66rem;font-weight:700;border-radius:999px;padding:0 6px;min-width:16px;text-align:center}
    .shp-conv-prev{font-size:.76rem;color:var(--muted,#756582);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .shp-chat-thread{display:flex;flex-direction:column;min-width:0}
    .shp-thread-head{padding:12px 16px;border-bottom:1px solid var(--line,#e6dff0);font-size:.9rem}
    .shp-msgs{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px;max-height:500px}
    .shp-msg{max-width:75%;padding:8px 11px;border-radius:12px;font-size:.84rem;line-height:1.35;word-break:break-word}
    .shp-msg.them{align-self:flex-start;background:rgba(128,128,128,.14)}
    .shp-msg.me{align-self:flex-end;background:#ee4d2d;color:#fff}
    .shp-msg-time{font-size:.66rem;opacity:.7;margin-top:3px}
    .shp-chat-empty{padding:26px;color:var(--muted,#756582);font-size:.84rem}
    .shp-composer{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line,#e6dff0)}
    .shp-composer textarea{flex:1;resize:none;border:1px solid var(--line,#e6dff0);border-radius:10px;padding:9px 11px;background:transparent;color:var(--text,#241635);font:inherit;font-size:.85rem;max-height:110px}
    .shp-send{background:#ee4d2d;color:#fff;border:0;border-radius:10px;padding:0 18px;font-weight:700;cursor:pointer;white-space:nowrap}
    .shp-send:disabled{opacity:.5;cursor:wait}
    .shp-send-err{color:#f87171;font-size:.76rem;padding:0 12px 8px}`;
    document.head.append(Object.assign(document.createElement('style'), { id: 'shp-style', textContent: css }));
  }

  function kpi(label, value, sub, accent) {
    const c = accent || SHOPEE;
    const e = n('div', 'shp-kpi'); e.style.setProperty('--accent', c);
    const lbl = n('div', 'k-lbl'); const ib = n('span', 'k-ico'); ib.style.background = c + '22'; ib.style.color = c; ib.append(n('i', 'ph ' + iconFor(label))); lbl.append(ib, n('span', '', label));
    e.append(lbl, n('div', 'k-val', value)); if (sub) e.append(n('div', 'k-sub', sub));
    return e;
  }
  function panel(title, cap) { const e = n('section', 'shp-panel'); e.append(n('h3', '', title)); if (cap) e.append(n('p', 'cap', cap)); return e; }

  function tooltipEl() {
    let tip = document.getElementById('shp-tip');
    if (!tip) {
      tip = n('div'); tip.id = 'shp-tip';
      tip.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:#0e1116;color:#fff;border:1px solid #2a2e37;border-radius:8px;padding:7px 10px;font:600 12px Outfit,sans-serif;box-shadow:0 8px 24px #0006;display:none;white-space:nowrap';
      document.body.append(tip);
    }
    return tip;
  }
  function salesChart(byDay) {
    const keys = Object.keys(byDay || {}).sort();
    if (!keys.length) return n('p', 'cap', 'Sem vendas no período.');
    const first = keys[0], last = keys[keys.length - 1];
    const dates = []; for (let d = new Date(first); d <= new Date(last); d.setDate(d.getDate() + 1)) dates.push(d.toISOString().slice(0, 10));
    const vals = dates.map(d => byDay[d] || 0);
    const w = 760, h = 220, l = 58, r = 16, t = 12, b = 26, max = Math.max(100, ...vals);
    const x = i => l + (dates.length < 2 ? 0 : i / (dates.length - 1) * (w - l - r));
    const y = v => h - b - v / max * (h - t - b);
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'shp-chart', style: 'width:100%;height:auto;display:block' });
    const grad = svgEl('linearGradient', { id: 'shpGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(svgEl('stop', { offset: '0%', 'stop-color': SHOPEE, 'stop-opacity': .35 }), svgEl('stop', { offset: '100%', 'stop-color': SHOPEE, 'stop-opacity': 0 }));
    svg.append(svgEl('defs', {}), grad);
    for (let i = 0; i <= 3; i++) { const gy = t + (h - t - b) * i / 3; svg.append(svgEl('line', { x1: l, y1: gy, x2: w - r, y2: gy, stroke: 'var(--line,#e6dff0)', 'stroke-width': .5 }), svgEl('text', { x: l - 8, y: gy + 3, 'text-anchor': 'end' }, kShort(max * (1 - i / 3)))); }
    const line = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    svg.append(svgEl('polygon', { points: `${l},${h - b} ${line} ${x(dates.length - 1)},${h - b}`, fill: 'url(#shpGrad)' }));
    svg.append(svgEl('polyline', { points: line, fill: 'none', stroke: SHOPEE, 'stroke-width': 2 }));
    for (let i = 0; i < dates.length; i++) svg.append(svgEl('circle', { cx: x(i), cy: y(vals[i]), r: dates.length > 60 ? 1.6 : 2.6, fill: SHOPEE }));
    const idx = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])];
    for (const i of idx) svg.append(svgEl('text', { x: x(i), y: h - 7, 'text-anchor': i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle' }, dates[i].slice(5).split('-').reverse().join('/')));
    // hover: mostra o detalhe do dia
    const tip = tooltipEl();
    const guide = svgEl('line', { y1: t, y2: h - b, stroke: SHOPEE, 'stroke-width': .8, 'stroke-dasharray': '3 3', opacity: 0 }); svg.append(guide);
    for (let i = 0; i < dates.length; i++) {
      const left = i === 0 ? l : (x(i - 1) + x(i)) / 2, right = i === dates.length - 1 ? w - r : (x(i) + x(i + 1)) / 2;
      const zone = svgEl('rect', { x: left, y: t, width: Math.max(1, right - left), height: h - t - b, fill: 'transparent', style: 'cursor:crosshair' });
      const show = ev => { guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', 1); const val = n('span'); val.style.color = '#ff8a68'; val.textContent = brl(vals[i]); tip.replaceChildren(document.createTextNode(dates[i].slice(5).split('-').reverse().join('/')), document.createElement('br'), val); tip.style.display = 'block'; tip.style.left = Math.min(innerWidth - tip.offsetWidth - 12, ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY - 10) + 'px'; };
      zone.addEventListener('pointermove', show); zone.addEventListener('pointerenter', show);
      zone.addEventListener('pointerleave', () => { tip.style.display = 'none'; guide.setAttribute('opacity', 0); });
      svg.append(zone);
    }
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
    // Linha 1: gráfico | forma de pagamento
    const cols1 = n('div', 'shp-cols');
    const chart = panel('Evolução das vendas', 'Vendas confirmadas por dia (R$).'); chart.append(salesChart(data.byDay));
    const pay = panel('Forma de pagamento', 'Pedidos pagos por método.');
    if (data.pagamento?.length) pay.append(donut(data.pagamento.map((p, i) => ({ label: p.metodo, value: p.n, color: colorFor(p.metodo, PAY_COLORS, i) })))); else pay.append(n('p', 'cap', 'Sem dados.'));
    cols1.append(chart, pay); box.append(cols1);
    // Linha 2: envio | top produtos
    const cols2 = n('div', 'shp-cols');
    const ship = panel('Envio', 'Full = Shopee entrega. Xpress = transportadora Shopee.');
    if (data.envio?.length) ship.append(hbars(data.envio.map((s, i) => ({ label: s.tipo, value: s.n, color: colorFor(s.tipo, SHIP_COLORS, i) })))); else ship.append(n('p', 'cap', 'Sem dados.'));
    const top = panel('Top produtos', 'Os 5 mais vendidos no período.');
    const mx = Math.max(1, ...(data.ranking || []).map(p => p.value));
    (data.ranking || []).slice(0, 5).forEach((p, i) => top.append(productRow(p, i, mx)));
    if (!(data.ranking || []).length) top.append(n('p', 'cap', 'Nenhum item no período.'));
    cols2.append(ship, top); box.append(cols2);
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

  // ---- Chat ----
  async function chatFetch(path) {
    const { data: { session } } = await sb().auth.getSession();
    if (!session) return null;
    const r = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + session.access_token } });
    if (!r.ok) return null;
    return r.json();
  }
  async function chatSendReq(toId, text) {
    const { data: { session } } = await sb().auth.getSession();
    if (!session) return false;
    const r = await fetch(BASE + '/api/shopee/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ to_id: toId, text }) });
    return r.ok;
  }
  function fmtTime(ts) {
    const t = Number(ts) || 0; const ms = t > 1e15 ? t / 1e6 : t > 1e12 ? t : t * 1000;
    if (!ms) return ''; try { return new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  }
  const TYPE_LABEL = { image: '📷 Imagem', item: '🛍️ Produto', order: '🧾 Pedido', sticker: '😊 Figurinha', image_with_text: '📷 Imagem', video: '🎬 Vídeo', v_code: 'Código', voucher: '🎟️ Cupom' };
  function msgText(m) {
    if (m.message_type === 'text') return (m.content && (m.content.text || m.content)) || '';
    return TYPE_LABEL[m.message_type] || ('[' + (m.message_type || 'mensagem') + ']');
  }
  function convPreview(c) {
    if (c.latest_message_type === 'text' && c.latest_message_content) return c.latest_message_content.text || '';
    return TYPE_LABEL[c.latest_message_type] || '';
  }
  function secChat() {
    const box = n('div', 'shp-wrap');
    const pnl = panel('Conversas da Shopee', 'Converse com os clientes da sua loja Shopee — leia e responda.');
    const chat = n('div', 'shp-chat'), list = n('div', 'shp-chat-list'), thread = n('div', 'shp-chat-thread');
    thread.append(n('div', 'shp-chat-empty', 'Selecione uma conversa à esquerda.'));
    chat.append(list, thread); pnl.append(chat); box.append(pnl);
    list.append(n('div', 'shp-chat-empty', 'Carregando conversas…'));
    chatFetch('/api/shopee/chat/conversations?page_size=25').then(d => {
      list.replaceChildren();
      const convs = (d && d.conversations) || [];
      if (!convs.length) { list.append(n('div', 'shp-chat-empty', 'Nenhuma conversa.')); return; }
      for (const c of convs) {
        const row = n('button', 'shp-conv'); row.type = 'button';
        if (c.to_avatar) { const av = n('img'); av.src = c.to_avatar; av.alt = ''; av.onerror = () => av.remove(); row.append(av); }
        const info = n('div', 'shp-conv-info'), nameRow = n('div', 'shp-conv-name'); nameRow.append(n('b', '', c.to_name || 'Cliente'));
        if (c.unread_count > 0) nameRow.append(n('span', 'shp-unread', String(c.unread_count)));
        info.append(nameRow, n('div', 'shp-conv-prev', convPreview(c))); row.append(info);
        row.onclick = () => { [...list.querySelectorAll('.shp-conv')].forEach(b => b.classList.remove('on')); row.classList.add('on'); loadThread(c); };
        list.append(row);
      }
    }).catch(() => list.replaceChildren(n('div', 'shp-chat-empty', 'Não consegui carregar as conversas.')));
    function loadThread(c) {
      thread.replaceChildren(n('div', 'shp-chat-empty', 'Carregando mensagens…'));
      chatFetch('/api/shopee/chat/messages?conversation_id=' + encodeURIComponent(c.conversation_id) + '&page_size=40').then(d => {
        thread.replaceChildren(n('div', 'shp-thread-head', c.to_name || 'Cliente'));
        const msgs = (d && d.messages) || [];
        // ordena por data (mais antiga em cima); timestamps são enormes, então compara como número por tamanho+texto
        const tkey = m => String(m.created_timestamp || '0');
        msgs.sort((a, b) => { const x = tkey(a), y = tkey(b); return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0); });
        const scroll = n('div', 'shp-msgs');
        if (!msgs.length) scroll.append(n('div', 'shp-chat-empty', 'Sem mensagens.'));
        for (const m of msgs) {
          // "minha" (loja) = mensagem que NÃO veio do comprador (c.to_id)
          const mine = String(m.from_id) !== String(c.to_id);
          const bub = n('div', 'shp-msg ' + (mine ? 'me' : 'them'));
          bub.append(n('div', 'shp-msg-body', msgText(m)), n('div', 'shp-msg-time', fmtTime(m.created_timestamp)));
          scroll.append(bub);
        }
        thread.append(scroll); scroll.scrollTop = scroll.scrollHeight;
        // compositor (responder o cliente)
        const composer = n('div', 'shp-composer'), inp = n('textarea'), btn = n('button', 'shp-send', 'Enviar'), err = n('div', 'shp-send-err');
        inp.placeholder = 'Escreva uma resposta…'; inp.rows = 1; btn.type = 'button';
        const send = async () => {
          const text = inp.value.trim(); if (!text) return; btn.disabled = true; err.textContent = '';
          try {
            const ok = await chatSendReq(c.to_id, text);
            if (!ok) { err.textContent = 'Não consegui enviar. Tente de novo.'; }
            else { inp.value = ''; const bub = n('div', 'shp-msg me'); bub.append(n('div', 'shp-msg-body', text), n('div', 'shp-msg-time', 'agora')); scroll.append(bub); scroll.scrollTop = scroll.scrollHeight; }
          } catch { err.textContent = 'Não consegui enviar. Tente de novo.'; }
          btn.disabled = false;
        };
        btn.onclick = send;
        inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
        composer.append(inp, btn); thread.append(composer, err);
      }).catch(() => thread.replaceChildren(n('div', 'shp-chat-empty', 'Não consegui carregar as mensagens.')));
    }
    return box;
  }

  const TABS = [['Resumo', secVisao], ['Pedidos', secPedidos], ['Produtos', secProdutos], ['Devoluções', secDevolucoes], ['Chat', secChat]];

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
