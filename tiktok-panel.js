// Aba TikTok Shop no painel de canais (mesma estrutura da aba Shopee, sem chat).
// Busca os dados por período no servidor de produção (/api/tiktok/overview) usando a sessão do usuário.
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
      const r = await fetch(BASE + '/api/tiktok/overview?' + new URLSearchParams({ start, end }), { headers: { Authorization: 'Bearer ' + session.access_token } });
      if (!r.ok) return null;
      return r.json();
    })().catch(() => null);
    cache.set(key, promise);
    return promise;
  }
  async function authGet(path) {
    const { data: { session } } = await sb().auth.getSession();
    if (!session) return null;
    const r = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + session.access_token } });
    return r.ok ? r.json() : null;
  }
  const insightsCache = new Map();
  function insights(start, end) {
    const k = start + ':' + end;
    if (!insightsCache.has(k)) insightsCache.set(k, authGet('/api/tiktok/insights?' + new URLSearchParams({ start, end })).catch(() => null));
    return insightsCache.get(k);
  }
  async function chatSendReq(conversationId, text) {
    const { data: { session } } = await sb().auth.getSession();
    if (!session) return false;
    const r = await fetch(BASE + '/api/tiktok/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ conversation_id: conversationId, text }) });
    return r.ok;
  }
  async function sync() {
    const { data: { session } } = await sb().auth.getSession();
    if (!session) return null;
    const r = await fetch(BASE + '/api/tiktok/sync', { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token } });
    cache.clear();
    return r.ok ? r.json() : null;
  }

  // ---------- cores / helpers ----------
  const TT = '#fe2c55', TT2 = '#25f4ee', GREEN = '#16a34a', AMBER = '#f59e0b', RED = '#ef4444', BLUE = '#3b82f6';
  const PALETTE = ['#fe2c55', '#25f4ee', '#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b'];
  const STATUS = {
    COMPLETED: ['Concluído', GREEN], DELIVERED: ['Entregue', GREEN], IN_TRANSIT: ['A caminho', BLUE], AWAITING_COLLECTION: ['Aguardando coleta', BLUE],
    PARTIALLY_SHIPPING: ['Envio parcial', BLUE], AWAITING_SHIPMENT: ['Aguardando envio', AMBER], ON_HOLD: ['Em espera', '#f97316'],
    UNPAID: ['Não pago', '#94a3b8'], CANCELLED: ['Cancelado', RED],
    RETURN_OR_REFUND_REQUEST_PENDING: ['Solicitação pendente', AMBER], REFUND_OR_RETURN_REQUEST_SUCCESS: ['Aprovada', GREEN], REFUND_OR_RETURN_REQUEST_REJECT: ['Recusada', RED], REFUND_OR_RETURN_REQUEST_CANCEL: ['Cancelada', '#94a3b8'], AWAITING_BUYER_SHIP: ['Aguardando envio do cliente', BLUE], BUYER_SHIPPED_ITEM: ['Cliente enviou', BLUE], RETURN_OR_REFUND_REQUEST_COMPLETE: ['Concluída', GREEN],
  };
  const PAYST = { paid: ['Pago', GREEN], pending: ['Pendente', AMBER], cancelled: ['Cancelado', RED] };
  const n = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const svgEl = (tag, attrs = {}, text) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; };
  const brl = c => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(c) || 0) / 100);
  const kShort = c => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format((Number(c) || 0) / 100);
  const num = v => new Intl.NumberFormat('pt-BR').format(Number(v) || 0);
  const colorFor = (label, i) => PALETTE[i % PALETTE.length];
  const iconFor = t => /repasse|l[ií]quido/i.test(t) ? 'ph-coins' : /comiss|taxa/i.test(t) ? 'ph-percent' : /cancel/i.test(t) ? 'ph-x-circle' : /reembol|devolu/i.test(t) ? 'ph-arrow-u-up-left' : /pedidos/i.test(t) ? 'ph-bag-simple' : /unidade/i.test(t) ? 'ph-package' : /ticket/i.test(t) ? 'ph-receipt' : /vendas|faturamento|bruto/i.test(t) ? 'ph-currency-circle-dollar' : 'ph-chart-line';
  const statusInfo = s => STATUS[s] || [s === '?' ? '—' : String(s).replace(/_/g, ' ').toLowerCase(), '#94a3b8'];
  const badge = (text, color) => { const e = n('span', 'shp-badge', text); e.style.color = color; e.style.background = color + '22'; return e; };

  function ensureStyle() {
    if (root.CacifeShopee && root.CacifeShopee.ensureStyle) root.CacifeShopee.ensureStyle();
    if (document.getElementById('ttk-style')) return;
    // Reaproveita o CSS da Shopee (classes shp-*) e só troca a cor de destaque das abas.
    const css = `.ttk .shp-tab.on{color:${TT};border-bottom-color:${TT}} .ttk .shp-kpi{--accent:${TT}} .ttk-sync{margin-left:auto;background:${TT};color:#fff;border:0;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer;font-size:.8rem} .ttk-sync:disabled{opacity:.5;cursor:wait} .ttk-note{font-size:.78rem;color:var(--muted,#756582);padding:6px 2px}
    .ttk-src{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .ttk-srcc{border:1px solid var(--line,#e6dff0);border-radius:14px;padding:14px;background:var(--panel,#fff)}
    .ttk-srcc .h{display:flex;align-items:center;gap:8px;font-weight:700;font-size:.9rem}.ttk-srcc .ic{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px}
    .ttk-srcc .big{font-size:1.45rem;font-weight:800;margin:8px 0 2px}.ttk-srcc .sm{font-size:.76rem;color:var(--muted,#756582)}
    .ttk-bar{height:8px;border-radius:999px;background:rgba(128,128,128,.18);overflow:hidden;margin-top:10px}.ttk-bar i{display:block;height:100%}
    .ttk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
    .ttk-card{border:1px solid var(--line,#e6dff0);border-radius:14px;overflow:hidden;background:var(--panel,#fff);display:flex;flex-direction:column;text-decoration:none;color:inherit;transition:transform .15s,box-shadow .15s}
    .ttk-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(20,10,40,.10)}
    .ttk-thumb{position:relative;aspect-ratio:1/1;background:linear-gradient(135deg,#fe2c5522,#25f4ee22);overflow:hidden}
    .ttk-thumb img{width:100%;height:100%;object-fit:cover;display:block}
    .ttk-rank{position:absolute;top:8px;left:8px;background:#000c;color:#fff;font-weight:800;font-size:.78rem;border-radius:8px;padding:3px 8px}
    .ttk-play{position:absolute;inset:auto 8px 8px auto;background:#fe2c55;color:#fff;font-weight:700;font-size:.72rem;border-radius:999px;padding:4px 10px}
    .ttk-views{position:absolute;left:8px;bottom:8px;background:#000b;color:#fff;font-size:.72rem;font-weight:600;border-radius:999px;padding:3px 9px}
    .ttk-body{padding:11px 12px;display:flex;flex-direction:column;gap:4px}
    .ttk-body b{font-size:.84rem;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.1em}
    .ttk-body .u{font-size:.74rem;color:var(--muted,#756582);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ttk-body .g{font-size:1.05rem;font-weight:800;color:#fe2c55}
    .ttk-chips{display:flex;gap:6px;flex-wrap:wrap}.ttk-chip{font-size:.68rem;font-weight:600;border-radius:999px;padding:2px 8px;background:rgba(128,128,128,.12)}
    .ttk-crt{display:flex;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid var(--line,#e6dff0)}.ttk-crt:last-child{border-bottom:0}
    .ttk-av{width:44px;height:44px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;background:linear-gradient(135deg,#fe2c55,#25f4ee);font-size:.9rem;text-transform:uppercase}
    .ttk-crt .pi{width:44px;height:44px;border-radius:10px;object-fit:cover;flex:none;background:rgba(128,128,128,.15)}
    .ttk-crt .nm{flex:1;min-width:0}.ttk-crt .nm a{font-weight:700;font-size:.88rem;color:inherit;text-decoration:none}.ttk-crt .nm .u{font-size:.74rem;color:var(--muted,#756582);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ttk-crt .vv{text-align:right;font-variant-numeric:tabular-nums}.ttk-crt .vv b{display:block;color:#fe2c55}.ttk-crt .vv span{font-size:.72rem;color:var(--muted,#756582)}
    .ttk-msgimg{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none;background:rgba(128,128,128,.15)}
    @media(max-width:760px){.ttk-src{grid-template-columns:1fr}}`;
    document.head.append(Object.assign(document.createElement('style'), { id: 'ttk-style', textContent: css }));
  }
  function kpi(label, value, sub, accent) {
    const c = accent || TT;
    const e = n('div', 'shp-kpi'); e.style.setProperty('--accent', c);
    const lbl = n('div', 'k-lbl'); const ib = n('span', 'k-ico'); ib.style.background = c + '22'; ib.style.color = c; ib.append(n('i', 'ph ' + iconFor(label))); lbl.append(ib, n('span', '', label));
    e.append(lbl, n('div', 'k-val', value)); if (sub) e.append(n('div', 'k-sub', sub));
    return e;
  }
  function panel(title, cap) { const e = n('section', 'shp-panel'); e.append(n('h3', '', title)); if (cap) e.append(n('p', 'cap', cap)); return e; }
  function tooltipEl() {
    let tip = document.getElementById('shp-tip');
    if (!tip) { tip = n('div'); tip.id = 'shp-tip'; tip.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:#0e1116;color:#fff;border:1px solid #2a2e37;border-radius:8px;padding:7px 10px;font:600 12px Outfit,sans-serif;box-shadow:0 8px 24px #0006;display:none;white-space:nowrap'; document.body.append(tip); }
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
    const grad = svgEl('linearGradient', { id: 'ttkGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(svgEl('stop', { offset: '0%', 'stop-color': TT, 'stop-opacity': .35 }), svgEl('stop', { offset: '100%', 'stop-color': TT, 'stop-opacity': 0 }));
    svg.append(svgEl('defs', {}), grad);
    for (let i = 0; i <= 3; i++) { const gy = t + (h - t - b) * i / 3; svg.append(svgEl('line', { x1: l, y1: gy, x2: w - r, y2: gy, stroke: 'var(--line,#e6dff0)', 'stroke-width': .5 }), svgEl('text', { x: l - 8, y: gy + 3, 'text-anchor': 'end' }, kShort(max * (1 - i / 3)))); }
    const line = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    svg.append(svgEl('polygon', { points: `${l},${h - b} ${line} ${x(dates.length - 1)},${h - b}`, fill: 'url(#ttkGrad)' }));
    svg.append(svgEl('polyline', { points: line, fill: 'none', stroke: TT, 'stroke-width': 2 }));
    for (let i = 0; i < dates.length; i++) svg.append(svgEl('circle', { cx: x(i), cy: y(vals[i]), r: dates.length > 60 ? 1.6 : 2.6, fill: TT }));
    const idx = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])];
    for (const i of idx) svg.append(svgEl('text', { x: x(i), y: h - 7, 'text-anchor': i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle' }, dates[i].slice(5).split('-').reverse().join('/')));
    const tip = tooltipEl();
    const guide = svgEl('line', { y1: t, y2: h - b, stroke: TT, 'stroke-width': .8, 'stroke-dasharray': '3 3', opacity: 0 }); svg.append(guide);
    for (let i = 0; i < dates.length; i++) {
      const left = i === 0 ? l : (x(i - 1) + x(i)) / 2, right = i === dates.length - 1 ? w - r : (x(i) + x(i + 1)) / 2;
      const zone = svgEl('rect', { x: left, y: t, width: Math.max(1, right - left), height: h - t - b, fill: 'transparent', style: 'cursor:crosshair' });
      const show = ev => { guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', 1); const val = n('span'); val.style.color = TT2; val.textContent = brl(vals[i]); tip.replaceChildren(document.createTextNode(dates[i].slice(5).split('-').reverse().join('/')), document.createElement('br'), val); tip.style.display = 'block'; tip.style.left = Math.min(innerWidth - tip.offsetWidth - 12, ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY - 10) + 'px'; };
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
    const liqPct = data.revenue > 0 && data.liquido > 0 ? (data.liquido / data.revenue * 100).toFixed(0) + '% do bruto' : 'repasse ainda não liquidado';
    const kpis = n('div', 'shp-kpis');
    kpis.append(
      kpi('Faturamento bruto', brl(data.revenue), 'pago pelos clientes', TT),
      kpi('Repasse líquido', brl(data.liquido), liqPct, GREEN),
      kpi('Taxas TikTok', brl(data.fees), data.revenue > 0 ? (data.fees / data.revenue * 100).toFixed(1) + '% do bruto' : '—', AMBER),
      kpi('Pedidos pagos', num(data.paid), num(data.cancelled) + ' cancelados', BLUE),
      kpi('Ticket médio', brl(data.ticket), 'por pedido pago', '#06b6d4'),
      kpi('Reembolsado', brl(data.devolucoes && data.devolucoes.valor), num(data.devolucoes && data.devolucoes.n) + ' devoluções', RED),
    );
    box.append(kpis);
    const cols1 = n('div', 'shp-cols');
    const chart = panel('Evolução das vendas', 'Vendas confirmadas por dia (R$).'); chart.append(salesChart(data.byDay));
    const pay = panel('Forma de pagamento', 'Pedidos pagos por método.');
    if (data.pagamento && data.pagamento.length) pay.append(donut(data.pagamento.map((p, i) => ({ label: p.metodo, value: p.n, color: colorFor(p.metodo, i) })))); else pay.append(n('p', 'cap', 'Sem dados.'));
    cols1.append(chart, pay); box.append(cols1);
    const cols2 = n('div', 'shp-cols');
    const ship = panel('Envio', 'Pedidos pagos por opção de entrega.');
    if (data.envio && data.envio.length) ship.append(hbars(data.envio.map((s, i) => ({ label: s.tipo, value: s.n, color: colorFor(s.tipo, i) })))); else ship.append(n('p', 'cap', 'Sem dados.'));
    const top = panel('Top produtos', 'Os 5 mais vendidos no período.');
    const mx = Math.max(1, ...(data.ranking || []).map(p => p.value));
    (data.ranking || []).slice(0, 5).forEach((p, i) => top.append(productRow(p, i, mx)));
    if (!(data.ranking || []).length) top.append(n('p', 'cap', 'Nenhum item no período.'));
    cols2.append(ship, top); box.append(cols2);
    return box;
  }
  function secPedidos(data) {
    const box = n('div', 'shp-wrap');
    const st = panel('Status dos pedidos', 'Distribuição dos pedidos do período por situação (atualizada por webhook do TikTok Shop).');
    if (data.porStatus && data.porStatus.length) st.append(hbars(data.porStatus.map(s => ({ label: statusInfo(s.status)[0], value: s.n, color: statusInfo(s.status)[1] })))); else st.append(n('p', 'cap', 'Sem dados.'));
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
    const kp = n('div', 'shp-kpis'); kp.append(kpi('Devoluções', num(data.devolucoes && data.devolucoes.n), 'no período', RED), kpi('Reembolsado', brl(data.devolucoes && data.devolucoes.valor), 'valor devolvido', RED)); box.append(kp);
    const lst = panel('Devoluções recentes', 'Últimas 30 devoluções do período.');
    const rows = (data.devList || []).map(d => { const [sl, sc] = statusInfo(d.status); return [d.return_id, d.order_id, { node: badge(sl, sc) }, d.reason, d.dt, { r: true, t: brl(d.refund) }]; });
    lst.append(table([{ t: 'Devolução' }, { t: 'Pedido' }, { t: 'Status' }, { t: 'Motivo' }, { t: 'Data' }, { t: 'Reembolso', r: true }], rows));
    if (!rows.length) lst.append(n('p', 'cap', 'Nenhuma devolução no período.'));
    box.append(lst); return box;
  }

  function secFinanceiro(data) {
    const box = n('div', 'shp-wrap'); const f = data.financeiro;
    if (!f) { box.append(n('p', 'cap', 'Sem dados financeiros.')); return box; }
    const e = f.aReceberEstimado || {};
    const kp = n('div', 'shp-kpis');
    kp.append(
      kpi('Caiu na conta', brl(f.recebido), num(f.depositos) + ' depósitos no período', GREEN),
      kpi('Repasse do período', brl(f.extratos.repasse), 'extratos do TikTok', '#06b6d4'),
      kpi('Taxas do período', brl(f.extratos.taxas), f.extratos.bruto > 0 ? (f.extratos.taxas / f.extratos.bruto * 100).toFixed(1) + '% do bruto' : '—', AMBER),
      kpi('A receber (estimado)', brl(e.total), 'pedidos pagos ainda não liquidados', TT),
      kpi('Taxa de repasse', (f.taxaRepasse || 0).toLocaleString('pt-BR') + '%', 'quanto sobra do bruto (30 dias)', BLUE),
    );
    box.append(kp);
    const cols = n('div', 'shp-cols');
    const quando = panel('Quando vai cair', 'O TikTok paga todo dia. O repasse sai depois que o pedido é entregue.');
    const linhas = [
      ['Pedidos entregues', 'cai nos próximos dias', e.entregue, GREEN],
      ['Pedidos em trânsito', 'cai depois da entrega', e.transito, BLUE],
      ['Aguardando envio', 'cai depois de enviar e entregar', e.aguardando, AMBER],
    ];
    for (const [lbl, sub, g, cor] of linhas) {
      const row = n('div', 'shp-hbar'); const top = n('div', 'hb-top');
      const left = n('span'); left.append(n('b', '', lbl + ' '), n('span', 'cap', '· ' + num(g && g.n) + ' pedidos · ' + sub));
      top.append(left, n('strong', '', brl(g && g.v)));
      const tr = n('div', 'hb-track'); const fl = n('div', 'hb-fill'); fl.style.width = (e.total > 0 ? (g && g.v || 0) / e.total * 100 : 0) + '%'; fl.style.background = cor; tr.append(fl);
      row.append(top, tr); quando.append(row);
    }
    if (f.aReceberConfirmado && f.aReceberConfirmado.v > 0) quando.append(n('p', 'cap', 'Já confirmado pelo TikTok (extratos ainda não pagos): ' + brl(f.aReceberConfirmado.v) + ' desde ' + (f.aReceberConfirmado.desde || '—') + '.'));
    quando.append(n('p', 'cap', 'Estimativa = valor dos pedidos × taxa média de repasse dos últimos 30 dias (' + (f.taxaRepasse || 0).toLocaleString('pt-BR') + '%).'));
    const dep = panel('Últimos depósitos', 'Pagamentos do TikTok para a conta da loja.');
    dep.append(table([{ t: 'Data' }, { t: 'Status' }, { t: 'Valor', r: true }], (f.ultimosDepositos || []).map((d) => [d.dt || '—', { node: badge(d.status === 'PAID' ? 'Pago' : (d.status || '—'), d.status === 'PAID' ? GREEN : AMBER) }, { r: true, t: brl(d.v) }])));
    cols.append(quando, dep); box.append(cols);
    const ch = panel('Depósitos por dia', 'Valor que caiu na conta em cada dia do período (R$).'); ch.append(salesChart(f.recebidoPorDia || {})); box.append(ch);
    return box;
  }
  function secEstoque(data) {
    const box = n('div', 'shp-wrap'); const s = data.estoque;
    if (!s) { box.append(n('p', 'cap', 'Sem dados de estoque.')); return box; }
    const kp = n('div', 'shp-kpis');
    kp.append(
      kpi('Variações ativas', num(s.skus), 'produtos × cores/modelos', BLUE),
      kpi('Esgotados que vendem', num(s.nEsgotadosVendendo), 'sem estoque e com venda em 30 dias', RED),
      kpi('Acabando (até 10 dias)', num(s.nCriticos), 'no ritmo atual de vendas', AMBER),
      kpi('Sem estoque (total)', num(s.semEstoque), 'variações zeradas', '#94a3b8'),
    );
    box.append(kp);
    const lista = (rows, titulo, cap, esgot) => {
      const p = panel(titulo, cap);
      const body = rows.map((x) => [
        { node: (() => { const d = n('div'); const b = n('b', '', x.title || 'Produto'); b.style.cssText = 'display:block;max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; b.title = x.title || ''; d.append(b, n('span', 'cap', x.seller_sku || '')); return d; })() },
        { r: true, t: num(x.qty) }, { r: true, t: num(x.u30) },
        { node: badge(esgot ? 'Esgotado' : (x.dias <= 3 ? 'Acaba em ' + x.dias + ' d' : 'Acaba em ' + x.dias + ' d'), esgot || x.dias <= 3 ? RED : AMBER) },
      ]);
      p.append(table([{ t: 'Produto / SKU' }, { t: 'Estoque', r: true }, { t: 'Vendas 30d', r: true }, { t: 'Situação' }], body));
      if (!rows.length) p.append(n('p', 'cap', esgot ? 'Nenhum produto esgotado com venda recente. 🎉' : 'Nenhum produto acabando nos próximos 10 dias.'));
      return p;
    };
    box.append(lista(s.esgotados || [], 'Esgotados que estão vendendo', 'Repor com prioridade: venderam nos últimos 30 dias e estão zerados.', true));
    box.append(lista(s.criticos || [], 'Acabando em breve', 'Dias restantes = estoque ÷ média diária de vendas dos últimos 30 dias.', false));
    return box;
  }

  const cur = () => [(document.getElementById('metrics-start') || document.getElementById('start'))?.value, (document.getElementById('metrics-end') || document.getElementById('end'))?.value];
  function asyncSection(build) {
    const box = n('div', 'shp-wrap'); const [s, e] = cur();
    box.append(n('p', 'cap', 'Carregando dados do TikTok Shop…'));
    insights(s, e).then((d) => { box.replaceChildren(); if (!d) { box.append(n('p', 'cap', 'Não consegui carregar agora. Tente Atualizar.')); return; } build(box, d); });
    return box;
  }
  const imgOr = (url, cls) => { if (url) { const im = n('img', cls); im.src = url; im.loading = 'lazy'; im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = () => im.remove(); return im; } return null; };
  function secDesempenho() {
    return asyncSection((box, d) => {
      const s = d.shop;
      if (!s) { box.append(n('p', 'cap', 'Analytics indisponível para o período.' + (d.erro ? ' (' + d.erro + ')' : ''))); return; }
      const kp = n('div', 'shp-kpis');
      kp.append(
        kpi('Vendas (Analytics)', brl(s.gmv), num(s.orders) + ' pedidos', TT),
        kpi('Visitantes no produto', num(s.visitors), 'média por dia nas páginas', BLUE),
        kpi('Visualizações', num(s.pageViews), num(s.impressions) + ' exibições', '#8b5cf6'),
        kpi('Conversão', (s.conversao || 0).toLocaleString('pt-BR') + '%', 'pedidos ÷ visualizações', GREEN),
        kpi('Ticket médio', brl(s.ticket), num(s.units) + ' unidades', '#06b6d4'),
        kpi('Reembolsado', brl(s.refunds), num(s.cancellations) + ' cancel./devoluções', RED),
      );
      box.append(kp);
      const src = panel('De onde vêm as vendas', 'Quanto cada formato do TikTok gerou no período.');
      const grid = n('div', 'ttk-src'), tot = Math.max(1, (s.gmvPor.VIDEO || 0) + (s.gmvPor.LIVE || 0) + (s.gmvPor.PRODUCT_CARD || 0));
      for (const [k, lbl, ic, cor] of [['VIDEO', 'Vídeos', '🎬', TT], ['PRODUCT_CARD', 'Vitrine / cartão do produto', '🛍️', BLUE], ['LIVE', 'LIVE', '🔴', '#8b5cf6']]) {
        const c = n('div', 'ttk-srcc'); const h = n('div', 'h'); const i = n('span', 'ic', ic); i.style.background = cor + '22'; h.append(i, n('span', '', lbl));
        const pct = Math.round((s.gmvPor[k] || 0) / tot * 100);
        const bar = n('div', 'ttk-bar'); const f = n('i'); f.style.width = pct + '%'; f.style.background = cor; bar.append(f);
        c.append(h, n('div', 'big', brl(s.gmvPor[k])), n('div', 'sm', pct + '% das vendas · ' + num(s.viewsPor[k]) + ' visualizações · ' + num(s.imprPor[k]) + ' exibições'), bar); grid.append(c);
      }
      src.append(grid); box.append(src);
      const ch = panel('Vendas por dia (Analytics)', 'Dados do TikTok disponíveis até ' + (d.disponivelAte ? d.disponivelAte.split('-').reverse().join('/') : '—') + '.'); ch.append(salesChart(d.porDia)); box.append(ch);
      const pp = panel('Produtos campeões', 'Top 10 por vendas no período, com taxa de clique (CTR).');
      const g = n('div', 'ttk-grid');
      d.produtos.forEach((p, i) => {
        const card = n('div', 'ttk-card'); const th = n('div', 'ttk-thumb'); const im = imgOr(p.img); if (im) th.append(im); th.append(n('span', 'ttk-rank', '#' + (i + 1)));
        const b = n('div', 'ttk-body'); const tt = n('b', '', p.title); tt.title = p.title;
        const chips = n('div', 'ttk-chips'); chips.append(n('span', 'ttk-chip', num(p.units) + ' un'), n('span', 'ttk-chip', num(p.orders) + ' pedidos'), n('span', 'ttk-chip', 'CTR ' + p.ctr.toLocaleString('pt-BR') + '%'));
        b.append(tt, n('span', 'g', brl(p.gmv)), chips); card.append(th, b); g.append(card);
      });
      if (!d.produtos.length) pp.append(n('p', 'cap', 'Sem produtos no período.')); pp.append(g); box.append(pp);
    });
  }
  function secVideos() {
    return asyncSection((box, d) => {
      const a = d.afiliados && d.afiliados.total;
      const kp = n('div', 'shp-kpis');
      kp.append(
        kpi('Vendas por vídeos', brl(d.shop && d.shop.gmvPor.VIDEO), num(d.totalVideos) + ' vídeos com venda', TT),
        kpi('Vendas via criadores', brl(a && a.gmv), num(a && a.pedidos) + ' pedidos de afiliados', '#8b5cf6'),
        kpi('Comissão de afiliados', brl(a && a.comissao), a && a.gmv ? (a.comissao / a.gmv * 100).toFixed(1) + '% das vendas deles' : '—', AMBER),
        kpi('Criadores que venderam', num(a && a.criadores), 'no período', BLUE),
      );
      box.append(kp);
      const vp = panel('Vídeos que mais vendem', 'Top 8 por vendas. Clique para ver o vídeo no TikTok.');
      const g = n('div', 'ttk-grid');
      d.videos.forEach((v, i) => {
        const card = n('a', 'ttk-card'); card.href = v.url; card.target = '_blank'; card.rel = 'noopener noreferrer';
        const th = n('div', 'ttk-thumb'); const im = imgOr(v.img); if (im) th.append(im);
        th.append(n('span', 'ttk-rank', '#' + (i + 1)), n('span', 'ttk-views', '▶ ' + num(v.views) + ' views'), n('span', 'ttk-play', 'Ver vídeo'));
        const b = n('div', 'ttk-body'); const tt = n('b', '', v.title || v.produto || 'Vídeo'); tt.title = v.title || '';
        const chips = n('div', 'ttk-chips'); chips.append(n('span', 'ttk-chip', num(v.units) + ' un'), n('span', 'ttk-chip', 'CTR ' + v.ctr.toLocaleString('pt-BR') + '%'));
        b.append(tt, n('span', 'u', '@' + v.user), n('span', 'g', brl(v.gmv)), chips); card.append(th, b); g.append(card);
      });
      if (!d.videos.length) vp.append(n('p', 'cap', 'Sem vídeos com venda no período.')); vp.append(g); box.append(vp);
      const cp = panel('Criadores que mais vendem', 'Afiliados por vendas geradas no período, com a comissão paga e o produto que mais vendem.');
      (d.afiliados.criadores || []).forEach((c, i) => {
        const row = n('div', 'ttk-crt'); row.append(n('span', 'rk', String(i + 1)), n('span', 'ttk-av', (c.user || '?').slice(0, 2)));
        const nm = n('div', 'nm'); const a2 = n('a', '', '@' + c.user); a2.href = c.url; a2.target = '_blank'; a2.rel = 'noopener noreferrer';
        nm.append(a2, n('div', 'u', num(c.pedidos) + ' pedidos · ' + num(c.unidades) + ' un · ' + (c.tipo === 'LIVE' ? 'LIVE' : 'vídeo') + (c.produto ? ' · ' + c.produto : '')));
        const pi = imgOr(c.img, 'pi'); row.append(nm); if (pi) row.append(pi);
        const vv = n('div', 'vv'); vv.append(n('b', '', brl(c.gmv)), n('span', '', 'comissão ' + brl(c.comissao))); row.append(vv); cp.append(row);
      });
      if (!(d.afiliados.criadores || []).length) cp.append(n('p', 'cap', 'Sem vendas de afiliados no período (a importação pode estar em andamento).'));
      box.append(cp);
    });
  }
  function msgParse(m) { try { return JSON.parse(m.content || '{}') || {}; } catch (e) { return { content: String(m.content || '') }; } }
  const TYPE_LABEL = { PRODUCT_CARD: '🛍️ Produto enviado', ORDER_CARD: '🧾 Pedido enviado', VIDEO: '🎬 Vídeo', EMOTICONS: '😊 Figurinha', COUPON_CARD: '🎟️ Cupom', LOGISTICS_CARD: '🚚 Rastreio', RETURN_REFUND_CARD: '↩️ Devolução/Reembolso', ALLOCATED_SERVICE: 'Atendimento transferido', NOTIFICATION: 'Aviso' };
  function msgText(m) { const c = msgParse(m); if (m.type === 'TEXT' || c.content) return c.content || c.text || ''; if (m.type === 'IMAGE') return '📷 Foto'; return TYPE_LABEL[m.type] || ''; }
  // Monta o conteúdo da bolha: texto, foto (IMAGE) ou cartão com ícone.
  function msgNode(m) {
    const c = msgParse(m);
    if (m.type === 'IMAGE' && (c.url || c.image_url)) { const im = n('img'); im.src = c.url || c.image_url; im.alt = 'foto'; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; im.style.cssText = 'max-width:220px;max-height:260px;border-radius:10px;display:block'; return im; }
    const txt = msgText(m); return txt ? n('div', 'shp-msg-body', txt) : null;
  }
  function secAtendimento() {
    const box = n('div', 'shp-wrap');
    const pnl = panel('Atendimento TikTok Shop', 'Converse com os clientes da loja — leia e responda por aqui.');
    const chat = n('div', 'shp-chat'), list = n('div', 'shp-chat-list'), thread = n('div', 'shp-chat-thread');
    thread.append(n('div', 'shp-chat-empty', 'Selecione uma conversa à esquerda.')); chat.append(list, thread); pnl.append(chat); box.append(pnl);
    list.append(n('div', 'shp-chat-empty', 'Carregando conversas…'));
    authGet('/api/tiktok/chat/conversations').then((d) => {
      list.replaceChildren();
      const convs = (d && d.conversations) || [];
      if (!convs.length) { list.append(n('div', 'shp-chat-empty', 'Nenhuma conversa.')); return; }
      for (const c of convs) {
        const buyer = (c.participants || []).find((p) => p.role !== 'SHOP') || {};
        const row = n('button', 'shp-conv'); row.type = 'button';
        const av = imgOr(buyer.avatar, 'ttk-msgimg'); if (av) row.append(av); else row.append(n('span', 'ttk-av', (buyer.nickname || '?').slice(0, 2)));
        const info = n('div', 'shp-conv-info'), nr = n('div', 'shp-conv-name'); nr.append(n('b', '', buyer.nickname || 'Cliente'));
        if (c.unread_count > 0) nr.append(n('span', 'shp-unread', String(c.unread_count)));
        info.append(nr, n('div', 'shp-conv-prev', c.latest_message ? msgText(c.latest_message) : '')); row.append(info);
        row.onclick = () => { [...list.querySelectorAll('.shp-conv')].forEach((b) => b.classList.remove('on')); row.classList.add('on'); load(c, buyer); };
        list.append(row);
      }
    });
    function load(c, buyer) {
      thread.replaceChildren(n('div', 'shp-chat-empty', 'Carregando mensagens…'));
      authGet('/api/tiktok/chat/messages?conversation_id=' + encodeURIComponent(c.id)).then((d) => {
        thread.replaceChildren(n('div', 'shp-thread-head', buyer.nickname || 'Cliente'));
        const msgs = ((d && d.messages) || []).slice().sort((a, b) => (Number(a.create_time) || 0) - (Number(b.create_time) || 0));
        const scroll = n('div', 'shp-msgs');
        if (!msgs.length) scroll.append(n('div', 'shp-chat-empty', 'Sem mensagens.'));
        const when = (t) => t ? new Date(Number(t) * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        let shown = 0;
        for (const m of msgs) {
          const role = (m.sender && m.sender.role) || '';
          const body = msgNode(m);
          if (role === 'SYSTEM') { if (body) { const note = n('div', 'shp-chat-empty', (body.textContent || '') + ' · ' + when(m.create_time)); note.style.cssText = 'text-align:center;font-size:.72rem;padding:4px'; scroll.append(note); shown++; } continue; }
          if (!body) continue; // cartões internos sem conteúdo
          const mine = role === 'SHOP' || role === 'ROBOT' || role === 'CUSTOMER_SERVICE';
          const bub = n('div', 'shp-msg ' + (mine ? 'me' : 'them'));
          if (mine) bub.style.background = role === 'ROBOT' ? '#94a3b8' : TT;
          bub.append(body, n('div', 'shp-msg-time', (role === 'ROBOT' ? '🤖 resposta automática · ' : '') + when(m.create_time)));
          scroll.append(bub); shown++;
        }
        if (!shown && msgs.length) scroll.append(n('div', 'shp-chat-empty', 'Só há avisos automáticos do TikTok nesta conversa. Abra no Seller Center para ver cartões especiais.'));
        thread.append(scroll); scroll.scrollTop = scroll.scrollHeight;
        if (c.can_send_message === false) { thread.append(n('div', 'shp-chat-empty', 'Esta conversa não aceita resposta.')); return; }
        const comp = n('div', 'shp-composer'), inp = n('textarea'), btn = n('button', 'shp-send', 'Enviar'), err = n('div', 'shp-send-err');
        btn.style.background = TT; inp.placeholder = 'Escreva uma resposta…'; inp.rows = 1; btn.type = 'button';
        const send = async () => { const text = inp.value.trim(); if (!text) return; btn.disabled = true; err.textContent = '';
          try { if (!(await chatSendReq(c.id, text))) err.textContent = 'Não consegui enviar. Tente de novo.'; else { inp.value = ''; const bub = n('div', 'shp-msg me'); bub.style.background = TT; bub.append(n('div', 'shp-msg-body', text), n('div', 'shp-msg-time', 'agora')); scroll.append(bub); scroll.scrollTop = scroll.scrollHeight; } }
          catch (e) { err.textContent = 'Não consegui enviar. Tente de novo.'; } btn.disabled = false; };
        btn.onclick = send; inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
        comp.append(inp, btn); thread.append(comp, err);
      });
    }
    return box;
  }

  const TABS = [['Resumo', secVisao], ['Pedidos', secPedidos], ['Produtos', secProdutos], ['Devoluções', secDevolucoes], ['Financeiro', secFinanceiro], ['Estoque', secEstoque], ['Desempenho', secDesempenho], ['Vídeos & Criadores', secVideos], ['Atendimento', secAtendimento]];

  function render(target, data, state, onSync) {
    ensureStyle();
    target.replaceChildren(); target.hidden = false; document.body.dataset.marketplace = 'tiktokshop';
    const wrap = n('div', 'shp-wrap ttk');
    if (!data) { const p = panel('TikTok Shop'); p.append(n('p', 'cap', state || 'Carregando dados do TikTok Shop…')); wrap.append(p); target.append(wrap); return; }
    const tabsEl = n('div', 'shp-tabs'), content = n('div');
    let active = (root.__tiktokTab && TABS.some(t => t[0] === root.__tiktokTab)) ? root.__tiktokTab : 'Resumo';
    const paint = () => {
      [...tabsEl.querySelectorAll('.shp-tab')].forEach(btn => btn.classList.toggle('on', btn.textContent === active));
      const sec = TABS.find(t => t[0] === active)[1];
      content.replaceChildren(sec(data));
    };
    for (const [label] of TABS) { const btn = n('button', 'shp-tab', label); btn.type = 'button'; btn.onclick = () => { active = label; root.__tiktokTab = label; paint(); }; tabsEl.append(btn); }
    const syncBtn = n('button', 'ttk-sync', 'Atualizar'); syncBtn.type = 'button';
    syncBtn.onclick = async () => { insightsCache.clear(); syncBtn.disabled = true; syncBtn.textContent = 'Sincronizando…'; try { await sync(); if (onSync) onSync(); } finally { syncBtn.disabled = false; syncBtn.textContent = 'Atualizar'; } };
    tabsEl.append(syncBtn);
    wrap.append(tabsEl, content);
    if (data.lastSync) wrap.append(n('div', 'ttk-note', 'Loja: ' + (data.shop || 'TikTok Shop') + ' · última sincronização ' + data.lastSync + ' · pedidos também são atualizados por webhook do TikTok Shop.'));
    paint();
    target.append(wrap);
  }

  root.CacifeTikTok = { overview, sync, render };
})(window);
