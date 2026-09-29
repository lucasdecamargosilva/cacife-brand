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
  // vendas por produto (com vendas por dia e variação mais vendida) — aba Produtos
  const productsCache = new Map();
  function products(start, end) {
    const key = start + ':' + end;
    if (!productsCache.has(key)) productsCache.set(key, (async () => {
      const { data: { session } } = await sb().auth.getSession();
      if (!session) return null;
      const r = await fetch(BASE + '/api/shopee/products?' + new URLSearchParams({ start, end }), { headers: { Authorization: 'Bearer ' + session.access_token } });
      return r.ok ? r.json() : null;
    })().catch(() => null));
    return productsCache.get(key);
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
      tip.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:#0e1116;color:#fff;border:1px solid #2a2e37;border-radius:8px;padding:7px 10px;font:600 12px "DM Sans",sans-serif;box-shadow:0 8px 24px #0006;display:none;white-space:nowrap';
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
  // ===== Design "Clássico Shopee" (opção 1) — estilos só dentro de .shp-v2 (o TikTok usa as classes shp-*) =====
  let prevData = null;
  const curDates = () => [(document.getElementById('metrics-start') || {}).value, (document.getElementById('metrics-end') || {}).value];
  function prevRange() { const [a, b] = curDates(); if (!a || !b) return null; const d0 = new Date(a + 'T12:00:00Z'), d1 = new Date(b + 'T12:00:00Z'); const len = Math.round((d1 - d0) / 864e5) + 1; const pe = new Date(d0 - 864e5), ps = new Date(pe - (len - 1) * 864e5); return [ps.toISOString().slice(0, 10), pe.toISOString().slice(0, 10)]; }
  function compare(cur, old, inverse) { if (old === undefined) return { text: 'Consultando período anterior…', cls: '' }; if (!old) return { text: 'Sem base anterior', cls: '' }; const pct = (cur / old - 1) * 100, up = pct >= 0; return { text: (up ? '▲ ' : '▼ ') + Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%', cls: (up !== !!inverse) ? 'up' : 'down' }; }
  const prevVal = f => prevData === null ? undefined : (prevData ? f(prevData) : 0);
  function kpiCard(title, icon, value, cmp) { const c = n('div', 'v2-kpi'); const h = n('div', 'v2-kpi-head'), ic = n('span', 'v2-kpi-icon'); ic.append(n('i', 'ph ' + icon)); h.append(ic, n('span', '', title), n('i', 'v2-kpi-bar')); const d = n('div', 'v2-kpi-delta'); d.append(n('span', cmp.cls, cmp.text)); if (cmp.cls) d.append(n('small', '', ' vs. anterior')); c.append(h, n('strong', '', value), d); return c; }
  const byCount = arr => (arr || []).slice().sort((a, b) => (b.n || 0) - (a.n || 0));
  function ensureV2Style() {
    if (document.getElementById('shp-v2-style')) return;
    const css = `.shp-v2{font-feature-settings:"tnum" 1}
    .shp-v2 .shp-band{background:#ee4d2d;border-radius:16px;padding:18px 20px 14px;margin-bottom:18px;color:#fff}
    .shp-v2 .shp-band-top{display:flex;align-items:center;gap:12px;margin-bottom:14px}
    .shp-v2 .shp-band-top .logo{width:38px;height:38px;border-radius:10px;background:#fff;display:grid;place-items:center;flex:none}
    .shp-v2 .shp-band-top .logo img{width:26px;height:26px;object-fit:contain}
    .shp-v2 .shp-band-top b{font-size:22px;font-weight:800;letter-spacing:-.02em}
    .shp-v2 .shp-band-top small{display:block;font-size:12px;opacity:.85;font-weight:500}
    .shp-v2 .shp-tabs{display:flex;gap:4px;flex-wrap:wrap;background:transparent!important;border:0!important;padding:0!important;margin:0!important;box-shadow:none!important}
    .shp-v2 .shp-tab{background:transparent!important;border:0!important;color:#ffe3dc!important;border-radius:10px!important;padding:9px 14px!important;font-weight:600!important;box-shadow:none!important}
    .shp-v2 .shp-tab:hover{background:#ffffff1f!important;color:#fff!important}
    .shp-v2 .shp-tab.on{background:#fff!important;color:#d0011b!important}
    .shp-v2 .shp-panel{border-radius:16px;border-color:#eceef2;box-shadow:0 1px 2px #1118270a}
    .shp-v2 .shp-panel h3{font-size:15px;font-weight:700;color:#111827}
    .shp-v2 .v2-block{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.15fr);gap:14px;padding:16px;background:#fff;border:1px solid #eceef2;border-radius:16px;margin-bottom:18px}
    .shp-v2 .v2-four{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .shp-v2 .v2-strip{display:grid;gap:14px;padding:16px;background:#fff;border:1px solid #eceef2;border-radius:16px;margin-bottom:18px}
    .shp-v2 .v2-kpi{border:1px solid #eceef2;border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;justify-content:center;min-width:0;background:#fff}
    .shp-v2 .v2-kpi-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-size:13px;color:#6b7280;font-weight:500}
    .shp-v2 .v2-kpi-icon{flex:0 0 28px;width:28px;height:28px;border-radius:8px;background:#fff1ec;color:#ee4d2d;display:grid;place-items:center;font-size:16px}
    .shp-v2 .v2-kpi-bar{margin-left:auto;flex:0 0 28px;height:4px;border-radius:9px;background:#ee4d2d}
    .shp-v2 .v2-kpi>strong{font-size:clamp(20px,1.8vw,26px);font-weight:700;letter-spacing:-.02em;line-height:1.15;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .shp-v2 .v2-kpi-delta{margin-top:10px;font-size:12.5px;color:#6b7280}.shp-v2 .v2-kpi-delta .up{color:#16a34a;font-weight:600}.shp-v2 .v2-kpi-delta .down{color:#dc2626;font-weight:600}.shp-v2 .v2-kpi-delta small{font-size:12px}
    .shp-v2 .v2-dark{background:#111827;color:#fff;border-radius:14px;padding:26px;display:flex;flex-direction:column;justify-content:center;gap:18px;min-width:0}
    .shp-v2 .v2-dark-head{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px}.shp-v2 .v2-dark-head .logo{width:30px;height:30px;border-radius:8px;background:#fff;display:grid;place-items:center}.shp-v2 .v2-dark-head .logo img{width:20px;height:20px}
    .shp-v2 .v2-dark small{display:block;font-size:13px;color:#ffffffa6}
    .shp-v2 .v2-dark-main strong{display:block;font-size:clamp(26px,2.6vw,36px);font-weight:700;letter-spacing:-.03em;margin:8px 0;white-space:nowrap}
    .shp-v2 .v2-dark-delta{font-weight:600;font-size:13px;color:#ffffffa6}.shp-v2 .v2-dark-delta.up{color:#4ade80}.shp-v2 .v2-dark-delta.down{color:#fca5a5}
    .shp-v2 .v2-dark-foot{border-top:1px solid #ffffff22;padding-top:16px}.shp-v2 .v2-dark-foot strong{font-size:22px;font-weight:700}
    .shp-v2 .v2-row{display:grid;gap:16px;margin-bottom:16px;align-items:stretch}
    .shp-v2 .v2-row>.shp-panel{margin:0;display:flex;flex-direction:column}
    .shp-v2 .v2-row>.shp-panel>svg:last-child,.shp-v2 .v2-row>.shp-panel>.shp-donut{margin-top:auto;margin-bottom:auto}
    .shp-v2 .shp-prod b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
    .shp-v2 .v2-link{background:none!important;border:0!important;padding:0;margin-top:10px;color:#d0011b!important;font:inherit;font-weight:600;cursor:pointer;text-align:left}
    body[data-marketplace=shopee][data-metrics-view=channel] .market-content{padding-top:0!important}
    @media(min-width:721px){body[data-marketplace=shopee][data-metrics-view=channel] .market-content{padding-left:28px!important;padding-right:28px!important}}
    @media(max-width:720px){body[data-marketplace=shopee][data-metrics-view=channel] .market-content{padding-left:14px!important;padding-right:14px!important}}
    body[data-marketplace=shopee][data-metrics-view=channel] .market-header{background:#ee4d2d!important;margin:0 -28px!important;padding:15px 28px 15px!important;min-height:0;align-items:center}
    @media(max-width:720px){body[data-marketplace=shopee][data-metrics-view=channel] .market-header{margin:0 -14px!important;padding:16px 14px 10px!important}}
    body[data-marketplace=shopee][data-metrics-view=channel] .market-header h1{color:#fff!important}
    body[data-marketplace=shopee][data-metrics-view=channel] .market-header p{display:none!important}
    body[data-marketplace=shopee][data-metrics-view=channel] .market-header h1{display:flex;align-items:center;gap:12px;margin:0}
    body[data-marketplace=shopee][data-metrics-view=channel] .market-header h1::before{content:'';width:40px;height:40px;flex:0 0 40px;border-radius:10px;background:#fff url(shopee-logo.png) center/26px no-repeat}
    body[data-marketplace=shopee][data-metrics-view=channel] .market-header .period-presets button{border-color:#ffffff33!important}
    body[data-marketplace=shopee][data-metrics-view=channel] .market-header .period-presets button[aria-pressed=true]{background:#111827!important;border-color:#111827!important;color:#fff!important}
    body[data-marketplace=shopee][data-metrics-view=channel] #metrics-notice:empty{display:none}
    body[data-marketplace=shopee][data-metrics-view=channel] .shp-v2 .shp-band{border-radius:0;margin:0 -28px 18px;padding:0 28px 14px}
    body[data-marketplace=shopee][data-metrics-view=channel] .shp-v2 .shp-tab{font-size:14px!important;padding:10px 14px!important;line-height:18px}
    body[data-marketplace=shopee][data-metrics-view=channel] .market-header .period-presets button{padding:8px 11px!important;font-size:12.5px!important;line-height:18px}
    @media(max-width:720px){body[data-marketplace=shopee][data-metrics-view=channel] .shp-v2 .shp-band{margin:0 -14px 18px;padding:0 14px 12px}}
    body[data-marketplace=shopee][data-metrics-view=channel] .shp-v2 .shp-band-top{display:none}
    @media(max-width:1100px){.shp-v2 .v2-block{grid-template-columns:1fr}.shp-v2 .v2-dark{order:-1}.shp-v2 .v2-row{grid-template-columns:1fr!important}}
    @media(max-width:560px){.shp-v2 .v2-four{grid-template-columns:1fr}.shp-v2 .v2-strip{grid-template-columns:1fr!important}}`;
    document.head.append(Object.assign(document.createElement('style'), { id: 'shp-v2-style', textContent: css }));
  }
  const shopeeLogo = () => { const l = n('span', 'logo'); const im = n('img'); im.src = 'shopee-logo.png'; im.alt = ''; l.append(im); return l; };

  function secVisao(data) {
    const box = n('div', 'shp-wrap');
    const block = n('section', 'v2-block'), four = n('div', 'v2-four');
    four.append(
      kpiCard('Faturamento bruto', 'ph-currency-circle-dollar', brl(data.revenue), compare(data.revenue, prevVal(p => p.revenue))),
      kpiCard('Taxas Shopee', 'ph-percent', brl(data.fees), compare(data.fees, prevVal(p => p.fees), true)),
      kpiCard('Pedidos pagos', 'ph-bag-simple', num(data.paid), compare(data.paid, prevVal(p => p.paid))),
      kpiCard('Reembolsado', 'ph-arrow-u-up-left', brl(data.devolucoes?.valor), compare(data.devolucoes?.valor || 0, prevVal(p => p.devolucoes?.valor || 0), true)));
    const dark = n('div', 'v2-dark'), dh = n('div', 'v2-dark-head'); dh.append(shopeeLogo(), n('span', '', 'Repasse líquido'));
    const rc = compare(data.liquido, prevVal(p => p.liquido)); const main = n('div', 'v2-dark-main'); main.append(n('small', '', 'O que sobra depois das taxas da Shopee'), n('strong', '', brl(data.liquido)), n('span', 'v2-dark-delta ' + rc.cls, rc.text + (rc.cls ? ' vs. período anterior' : '')));
    const foot = n('div', 'v2-dark-foot'); foot.append(n('small', '', 'do valor bruto'), n('strong', '', data.revenue > 0 ? (data.liquido / data.revenue * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—'));
    dark.append(dh, main, foot); block.append(four, dark); box.append(block);
    const r1 = n('div', 'v2-row'); r1.style.gridTemplateColumns = 'minmax(0,2fr) minmax(0,1fr)';
    const chart = panel('Evolução das vendas', 'Vendas confirmadas por dia (R$) · ticket médio ' + brl(data.ticket)); chart.append(salesChart(data.byDay));
    const pay = panel('Forma de pagamento', 'Pedidos pagos por método.');
    const pg = byCount(data.pagamento); if (pg.length) pay.append(donut(pg.map((p, i) => ({ label: p.metodo, value: p.n, color: colorFor(p.metodo, PAY_COLORS, i) })))); else pay.append(n('p', 'cap', 'Sem dados.'));
    r1.append(chart, pay); box.append(r1);
    const r2 = n('div', 'v2-row'); r2.style.gridTemplateColumns = 'minmax(0,1fr) minmax(0,2fr)';
    const ship = panel('Envio', 'Pedidos pagos por opção de entrega.');
    const en = byCount(data.envio); if (en.length) ship.append(hbars(en.map((x, i) => ({ label: x.tipo, value: x.n, color: colorFor(x.tipo, SHIP_COLORS, i) })))); else ship.append(n('p', 'cap', 'Sem dados.'));
    const top = panel('Top produtos', 'Os 5 mais vendidos no período.');
    const mx = Math.max(1, ...(data.ranking || []).map(p => p.value));
    (data.ranking || []).slice(0, 5).forEach((p, i) => { const row = productRow(p, i, mx); row.title = p.title || ''; top.append(row); });
    if (!(data.ranking || []).length) top.append(n('p', 'cap', 'Nenhum item no período.'));
    r2.append(ship, top); box.append(r2);
    return box;
  }
  function secVisaoAntigo(data) {
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
    if (data.porStatus?.length) st.append(hbars(byCount(data.porStatus).map(s => ({ label: statusInfo(s.status)[0], value: s.n, color: statusInfo(s.status)[1] })))); else st.append(n('p', 'cap', 'Sem dados.'));
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
  // Produtos e Devoluções: mesmo desenho do TikTok Shop (window.ChannelKit), nas cores da Shopee
  const KIT = { accent: SHOPEE, accent2: '#26aa99' };
  function secProdutos() {
    const box = n('div', 'shp-wrap');
    const K = root.ChannelKit;
    if (!K) { box.append(n('p', 'cap', 'Não consegui carregar os produtos.')); return box; }
    K.message(box, 'Carregando produtos…', KIT);
    const [s, e] = curDates(), pr = prevRange();
    Promise.all([products(s, e), pr ? products(pr[0], pr[1]) : Promise.resolve(null)]).then(([d, old]) => {
      box.replaceChildren();
      if (!d) { K.message(box, 'Não consegui carregar os produtos. Tente Atualizar.', KIT); return; }
      K.productsView(box, { ...KIT, products: d.produtos || [], prevProducts: old ? old.produtos || [] : null, start: s, end: e });
    });
    return box;
  }
  // status das devoluções da Shopee → [rótulo, tom, em andamento?]
  const RST = {
    REQUESTED: ['Solicitada', 'am', 1], PROCESSING: ['Em análise', 'am', 1], JUDGING: ['Em disputa', 'am', 1], SELLER_DISPUTE: ['Em disputa', 'am', 1],
    ACCEPTED: ['Aceita', 'g', 0], REFUND_PAID: ['Reembolsado', 'g', 0], CLOSED: ['Encerrada', 'gy', 0], CANCELLED: ['Cancelada', 'gy', 0],
  };
  const rst = s => RST[s] || [s && s !== '?' ? String(s).replace(/_/g, ' ').toLowerCase() : '—', 'gy', 0];
  const MOTIVOS = {
    CHANGE_MIND: 'Mudou de ideia', WRONG_ITEM: 'Item errado', NOT_RECEIPT: 'Não recebeu', DAMAGED_OTHERS: 'Chegou danificado', ITEM_MISSING: 'Faltando itens',
    FUNCTIONAL_DMG: 'Defeito de funcionamento', ITEM_FAKE: 'Suspeita de falsificação', SUSPICIOUS_PARCEL: 'Pacote suspeito', BROKEN_PRODUCTS: 'Produto quebrado',
    OUTER_DAMAGED_PACKAGE: 'Embalagem danificada', ITEM_NOT_FIT: 'Não serviu', DIFFERENT_DESCRIPTION: 'Diferente do anúncio', ITEM_WRONGDAMAGED: 'Item errado ou danificado',
    PHYSICAL_DMG: 'Dano físico', EXPIRED_PRODUCT: 'Produto vencido', NO_REASON: 'Sem motivo', NONE: 'Sem motivo',
  };
  const motivo = r => { const s = String(r || '').trim(); if (!s || s === '-') return 'Sem motivo'; if (MOTIVOS[s]) return MOTIVOS[s]; return /^[A-Z0-9_]+$/.test(s) ? s.charAt(0) + s.slice(1).replace(/_/g, ' ').toLowerCase() : s; };
  function secDevolucoes(data) {
    const box = n('div', 'shp-wrap');
    const K = root.ChannelKit;
    if (!K) { box.append(n('p', 'cap', 'Não consegui carregar as devoluções.')); return box; }
    const dv = data.devolucoes || {};
    // prevData: null = consultando, false = sem base
    const prev = prevData === null ? undefined : (prevData ? { n: prevData.devolucoes?.n || 0, valor: prevData.devolucoes?.valor || 0, paid: prevData.paid || 0 } : null);
    // motivos/status agregados no servidor; se vier só a lista (servidor antigo), agrega a lista
    const list = data.devList || [];
    const reasons = (data.devMotivos || list.map(d => ({ reason: d.reason, n: 1 }))).map(m => ({ label: motivo(m.reason), n: m.n }));
    const statuses = (data.devStatus || list.map(d => ({ status: d.status, n: 1 }))).map(x => { const [label, tone, open] = rst(x.status); return { label, tone, open, n: x.n }; });
    K.returnsView(box, {
      ...KIT, n: dv.n || 0, valor: dv.valor || 0, paid: data.paid || 0, prev, reasons, statuses,
      list: list.map(d => { const [l, t] = rst(d.status); return { product: d.produto || 'Produto', image: d.img, variation: d.variacao, date: d.dt, orderId: d.order_sn, reason: motivo(d.reason), reasonTitle: d.reason, refund: d.refund, statusLabel: l, statusTone: t }; }),
      listCaption: 'Últimas ' + num(list.length) + ' solicitações do período',
    });
    return box;
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
    ensureV2Style();
    const wrap = n('div', 'shp-wrap shp-v2');
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
    const band = n('div', 'shp-band'), bt = n('div', 'shp-band-top'), tt = n('div'); tt.append(n('b', '', 'Shopee'), n('small', '', 'Loja Cacife na Shopee'));
    bt.append(shopeeLogo(), tt); band.append(bt, tabsEl);
    wrap.append(band, content);
    prevData = null; const pr = prevRange();
    if (pr) overview(pr[0], pr[1]).then(p => { prevData = p || false; if (wrap.isConnected && active !== 'Chat') paint(); }); else prevData = false;
    paint();
    target.append(wrap);
  }

  root.CacifeShopee = { overview, render, ensureStyle };
})(window);
