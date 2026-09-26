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
    if (document.getElementById('ttk-style')) return;
    // Reaproveita o CSS da Shopee (classes shp-*) e só troca a cor de destaque das abas.
    const css = `.ttk .shp-tab.on{color:${TT};border-bottom-color:${TT}} .ttk .shp-kpi{--accent:${TT}} .ttk-sync{margin-left:auto;background:${TT};color:#fff;border:0;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer;font-size:.8rem} .ttk-sync:disabled{opacity:.5;cursor:wait} .ttk-note{font-size:.78rem;color:var(--muted,#756582);padding:6px 2px}`;
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

  const TABS = [['Resumo', secVisao], ['Pedidos', secPedidos], ['Produtos', secProdutos], ['Devoluções', secDevolucoes]];

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
    syncBtn.onclick = async () => { syncBtn.disabled = true; syncBtn.textContent = 'Sincronizando…'; try { await sync(); if (onSync) onSync(); } finally { syncBtn.disabled = false; syncBtn.textContent = 'Atualizar'; } };
    tabsEl.append(syncBtn);
    wrap.append(tabsEl, content);
    if (data.lastSync) wrap.append(n('div', 'ttk-note', 'Loja: ' + (data.shop || 'TikTok Shop') + ' · última sincronização ' + data.lastSync + ' · pedidos também são atualizados por webhook do TikTok Shop.'));
    paint();
    target.append(wrap);
  }

  root.CacifeTikTok = { overview, sync, render };
})(window);
