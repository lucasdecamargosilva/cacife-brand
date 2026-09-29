// Aba TikTok Shop no painel de canais — design "Clássico TikTok" (opção 1): faixa preta de ponta a ponta,
// 9 sub-abas e só dados reais do servidor de produção (/api/tiktok/*) usando a sessão do usuário.
// Todos os estilos novos ficam dentro de .ttk-v2 e body[data-marketplace=tiktokshop] (não afetam a Shopee).
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
  const productsCache = new Map();
  function products(start, end) {
    const k = start + ':' + end;
    if (!productsCache.has(k)) productsCache.set(k, authGet('/api/tiktok/products?' + new URLSearchParams({ start, end })).catch(() => null));
    return productsCache.get(k);
  }
  let convCache = null;
  function conversations(force) {
    if (force || !convCache || Date.now() - convCache.t > 60000) convCache = { t: Date.now(), p: authGet('/api/tiktok/chat/conversations').catch(() => null) };
    return convCache.p;
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
    cache.clear(); productsCache.clear(); convCache = null;
    return r.ok ? r.json() : null;
  }

  // ---------- cores / helpers ----------
  const P = '#fe2c55', CY = '#25f4ee', CD = '#00a8b8', K = '#161823', GREEN = '#16a34a', AMBER = '#d97706', RED = '#dc2626', GRAY = '#9ca3af';
  // status do pedido → [rótulo, classe da pílula, cor, grupo]
  const OST = {
    DELIVERED: ['Entregue', 'g', GREEN, 'entregue'], COMPLETED: ['Entregue', 'g', GREEN, 'entregue'],
    IN_TRANSIT: ['Em trânsito', 'cy', CD, 'transito'], AWAITING_COLLECTION: ['Aguardando coleta', 'cy', CD, 'transito'], PARTIALLY_SHIPPING: ['Envio parcial', 'cy', CD, 'transito'],
    AWAITING_SHIPMENT: ['Aguardando envio', 'am', AMBER, 'aguardando'], ON_HOLD: ['Em espera', 'am', AMBER, 'aguardando'],
    CANCELLED: ['Cancelado', 'rd', RED, 'cancelado'], UNPAID: ['Não pago', 'gy', GRAY, 'naopago'],
  };
  const GRUPOS = [['', 'Todos', P, 'todos'], ['aguardando', 'Aguardando envio', AMBER], ['transito', 'Em trânsito', CD], ['entregue', 'Entregues', GREEN], ['cancelado', 'Cancelados', RED], ['naopago', 'Não pagos', GRAY]];
  const ost = s => OST[s] || [s ? String(s).replace(/_/g, ' ').toLowerCase() : '—', 'gy', GRAY, ''];
  // status da devolução → [rótulo, classe, cor, em andamento?]
  const DST = {
    AWAITING_BUYER_SHIP: ['Aguardando cliente enviar', 'am', AMBER, 1], BUYER_SHIPPED_ITEM: ['Cliente enviou', 'cy', CD, 1], RETURN_OR_REFUND_REQUEST_PENDING: ['Em análise', 'am', '#f59e0b', 1],
    REFUND_OR_RETURN_REQUEST_SUCCESS: ['Aprovada', 'g', '#22c55e', 1], RETURN_OR_REFUND_REQUEST_COMPLETE: ['Reembolsado', 'g', GREEN, 0],
    REFUND_OR_RETURN_REQUEST_REJECT: ['Recusado', 'rd', RED, 0], RETURN_OR_REFUND_REQUEST_CANCEL: ['Cancelada', 'gy', GRAY, 0],
  };
  const dst = s => DST[s] || [s ? String(s).replace(/_/g, ' ').toLowerCase() : '—', 'gy', GRAY, 0];
  const MOTIVOS = [
    [/^item doesn'?t fit/i, 'Não serviu'], [/^package wasn'?t received/i, 'Pacote não recebido'], [/^no longer needed/i, 'Não precisa mais'],
    [/^color or pattern not as expected/i, 'Cor ou modelo diferente'], [/^item doesn'?t match description/i, 'Diferente do anúncio'], [/^defective item/i, 'Produto com defeito'],
    [/^wrong item was sent/i, 'Item errado'], [/^damaged item/i, 'Chegou danificado'], [/^item arrived damaged/i, 'Chegou danificado'], [/^package arrived damaged/i, 'Pacote chegou danificado'],
    [/^package received but missing item/i, 'Faltou item no pacote'], [/^fabric, material or style not as expected/i, 'Material ou estilo diferente'], [/refundable sample criteria/i, 'Reembolso de amostra'],
  ];
  const motivo = r => { const s = String(r || '').trim(); if (!s) return 'Sem motivo'; const m = MOTIVOS.find(([re]) => re.test(s)); return m ? m[1] : s; };

  const n = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
  const brl = c => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(c) || 0) / 100);
  const num = v => new Intl.NumberFormat('pt-BR').format(Number(v) || 0);
  const pct = (v, d = 1) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
  const compactBrl = c => 'R$ ' + new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format((Number(c) || 0) / 100);
  const compactNum = v => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v) || 0);
  const ddmm = iso => iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : '—';
  const noYear = s => String(s || '').replace(/^(\d{2}\/\d{2})\/\d{4}/, '$1');
  const tile = s => { const t = String(s || '').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t; };
  // Nome curto do produto: tira "Óculos de Sol" do começo e fica com as 4 primeiras palavras.
  function shortName(t) {
    const full = String(t || '').replace(/\s+/g, ' ').trim(); if (!full) return 'Produto';
    let s = full.replace(/^(kit\s+\d+\s+)?[óo]culos\s+(de\s+sol\s+)?/i, (m, kit) => kit ? tile(kit) : '');
    if (!s) s = full;
    const w = s.split(' ').filter(x => !/^[-–|·+]$/.test(x)).slice(0, 4);
    while (w.length > 1 && /^(e|de|da|do|das|dos|com|para|em|a|o|\+)$/i.test(w[w.length - 1])) w.pop();
    return tile(w.join(' ').replace(/[,;:\-–]+$/, ''));
  }
  const dayList = (s, e) => { const out = []; if (!s || !e) return out; for (let d = new Date(s + 'T12:00:00Z'), end = new Date(e + 'T12:00:00Z'); d <= end && out.length < 400; d = new Date(+d + 864e5)) out.push(d.toISOString().slice(0, 10)); return out; };
  const cur = () => [(document.getElementById('metrics-start') || document.getElementById('start') || {}).value, (document.getElementById('metrics-end') || document.getElementById('end') || {}).value];
  function prevRange() { const [a, b] = cur(); if (!a || !b) return null; const d0 = new Date(a + 'T12:00:00Z'), d1 = new Date(b + 'T12:00:00Z'); const len = Math.round((d1 - d0) / 864e5) + 1; const pe = new Date(d0 - 864e5), ps = new Date(pe - (len - 1) * 864e5); return [ps.toISOString().slice(0, 10), pe.toISOString().slice(0, 10)]; }
  function seriesOf(map) { const [s, e] = cur(); let dates = dayList(s, e); if (!dates.length) dates = Object.keys(map || {}).sort(); return { dates, vals: dates.map(d => Number((map || {})[d]) || 0) }; }
  const byN = arr => (arr || []).slice().sort((a, b) => (b.n || 0) - (a.n || 0));

  // comparação com o período anterior (inverse = subir é ruim)
  function delta(curV, old, inverse, short) {
    if (old === undefined) return '<span class="tk-mut">Consultando período anterior…</span>';
    if (!old) return '<span class="tk-mut">Sem base anterior</span>';
    const p = ((Number(curV) || 0) / old - 1) * 100, up = p >= 0, good = inverse ? !up : up;
    if (Math.abs(p) < 0.05) return '<span class="tk-mut" style="font-weight:600">= 0%</span>' + (short ? '' : ' <span class="tk-mut tk-vs">vs. anterior</span>');
    return `<span class="${good ? 'tk-up' : 'tk-down'}">${up ? '▲' : '▼'} ${Math.abs(p).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>${short ? '' : ' <span class="tk-mut tk-vs">vs. anterior</span>'}`;
  }
  const muted = t => `<span class="tk-mut">${esc(t)}</span>`;
  const foto = (url, cls = '', title = '') => { const u = safeUrl(url); return u ? `<img class="tk-foto ${cls}" src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer"${title ? ` title="${esc(title)}"` : ''}>` : `<span class="tk-foto ${cls}"><i class="ph ph-image"></i></span>`; };
  const pname = (full, max, sub) => `<span class="tk-pn-tx"><b title="${esc(full)}"${max ? ` style="max-width:${max}px"` : ''}>${esc(shortName(full))}</b>${sub != null ? `<span>${sub}</span>` : ''}</span>`;
  const pill = (t, c) => `<span class="tk-pill ${c}">${esc(t)}</span>`;
  const chead = (t, c, right = '') => `<div class="tk-chead"><div class="tk-min0"><h3>${t}</h3>${c ? `<p class="tk-cap">${c}</p>` : ''}</div>${right}</div>`;
  const link = (t, go) => `<button type="button" class="tk-link" data-go="${esc(go)}">${t}</button>`;
  const kc = (label, icon, value, sub, o = {}) => `<div class="tk-card tk-kc${o.dark ? ' dark' : ''}"><div class="tk-kc-h"><span class="tk-ico${o.cy ? ' c' : ''}"><i class="ph ${icon}"></i></span><span class="tk-lbl">${esc(label)}</span>${o.bar ? `<i class="tk-kc-bar" style="background:${o.bar}"></i>` : ''}</div><div class="tk-kc-v tk-one${o.money ? ' tk-money' : ''}" title="${esc(o.title || String(value).replace(/<[^>]+>/g, ''))}">${value}</div><div class="tk-kc-d">${sub}</div></div>`;
  const legendDot = c => `<i class="tk-dot" style="background:${c}"></i>`;
  function stackBar(items) { const tot = items.reduce((s, x) => s + x[1], 0) || 1; return `<div class="tk-stackbar">${items.filter(x => x[1] > 0).map(([l, v, c]) => `<i data-tip="${esc(l)}|${num(v)} · ${pct(v / tot * 100)}" style="flex:${v};background:${c}"></i>`).join('')}</div>`; }
  function hbars(items, w = 160, fmt = num) { const max = Math.max(1, ...items.map(x => x[1])); return items.map(([l, v, c]) => `<div class="tk-hbar" style="grid-template-columns:${w}px minmax(0,1fr) 48px"><span title="${esc(l)}">${esc(l)}</span><span class="tk-tr"><i style="width:${v / max * 100}%;background:${c}"></i></span><b>${fmt(v)}</b></div>`).join(''); }
  function donut(items, label, size = 140) {
    const tot = items.reduce((s, x) => s + x[1], 0) || 1; let off = 0, g = '<circle cx="60" cy="60" r="46" fill="none" stroke="#f3f4f6" stroke-width="16"/>';
    for (const [l, v, c] of items) { const f = v / tot * 100; if (f <= 0) continue; g += `<circle class="hv" data-tip="${esc(l)}|${num(v)} · ${pct(f)}" cx="60" cy="60" r="46" pathLength="100" fill="none" stroke="${c}" stroke-width="16" stroke-dasharray="${Math.max(0.1, f - .6)} ${100 - f + .6}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`; off += f; }
    return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" style="flex:none">${g}<text x="60" y="57" text-anchor="middle" style="font-size:9px">${esc(label)}</text><text x="60" y="72" text-anchor="middle" style="font-size:14px;fill:#111827;font-weight:700">${num(tot)}</text></svg>`;
  }
  const legend = items => { const tot = items.reduce((s, x) => s + x[1], 0) || 1; return items.map(([l, v, c]) => `<div class="tk-kv"><span class="tk-min0" style="display:flex;gap:8px;align-items:center">${legendDot(c)}<span class="tk-one">${esc(l)}</span></span><b>${num(v)} <span class="tk-mut" style="font-weight:500">· ${pct(v / tot * 100)}</span></b></div>`).join(''); };

  // ---------- gráficos SVG (tooltip data · valor via [data-tip]) ----------
  const fmtAx = (v, kind) => kind === 'brl' ? compactBrl(v) : compactNum(Math.round(v));
  const fmtV = (v, kind) => kind === 'brl' ? brl(v) : num(v);
  function axis(w, h, l, r, t, b, max, X, dates, kind, right) {
    let g = '';
    for (let i = 0; i <= 4; i++) { const y = t + (h - t - b) * i / 4; g += `<line x1="${l}" x2="${w - r}" y1="${y}" y2="${y}" stroke="#f0f1f4"/><text x="${l - 8}" y="${y + 4}" text-anchor="end">${fmtAx(max * (1 - i / 4), kind)}</text>`; if (right) g += `<text x="${w - r + 8}" y="${y + 4}" text-anchor="start">${fmtAx(right.max * (1 - i / 4), right.kind)}</text>`; }
    const L = dates.length, idx = L <= 1 ? [0] : [...new Set([0, 1, 2, 3, 4].map(k => Math.round(k * (L - 1) / 4)))];
    idx.forEach(i => { if (dates[i]) g += `<text x="${X(i)}" y="${h - 7}" text-anchor="${i === 0 && L > 1 ? 'start' : i === L - 1 && L > 1 ? 'end' : 'middle'}">${ddmm(dates[i])}</text>`; });
    return g;
  }
  const svgWrap = (w, h, g) => `<svg class="tk-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
  function lineChart(dates, vals, { w = 900, h = 240, color = P, kind = 'brl', name = 'Vendas' } = {}) {
    if (!dates.length) return '<p class="tk-cap">Sem dados no período.</p>';
    const l = 64, r = 14, t = 10, b = 26, max = Math.max(1, ...vals) * 1.12, st = dates.length > 1 ? (w - l - r) / (dates.length - 1) : 0, X = i => l + i * st, Y = v => h - b - v / max * (h - t - b);
    let g = axis(w, h, l, r, t, b, max, X, dates, kind);
    const pts = vals.map((v, i) => X(i) + ',' + Y(v)).join(' ');
    g += `<polygon points="${pts} ${X(vals.length - 1)},${h - b} ${X(0)},${h - b}" fill="${color}" opacity=".09"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>`;
    const zw = st || (w - l - r);
    vals.forEach((v, i) => { g += `<g class="hv" data-tip="${ddmm(dates[i])}|${esc(name)}: ${fmtV(v, kind)}"><rect x="${X(i) - zw / 2}" y="${t}" width="${zw}" height="${h - t - b}" fill="transparent"/><line class="gl" x1="${X(i)}" x2="${X(i)}" y1="${t}" y2="${h - b}" stroke="#d1d5db" stroke-dasharray="3 3"/><circle class="dot" cx="${X(i)}" cy="${Y(v)}" r="4.5" fill="#fff" stroke="${color}" stroke-width="2.4"/></g>`; });
    return svgWrap(w, h, g);
  }
  function barChart(dates, vals, { w = 900, h = 220, color = CD, kind = 'brl', name = 'Depósito', empty = 'Sem depósito' } = {}) {
    if (!dates.length) return '<p class="tk-cap">Sem dados no período.</p>';
    const l = 64, r = 14, t = 10, b = 26, max = Math.max(1, ...vals) * 1.12, st = (w - l - r) / dates.length, X = i => l + (i + .5) * st, Y = v => h - b - v / max * (h - t - b), bw = st * .6;
    let g = axis(w, h, l, r, t, b, max, X, dates, kind);
    vals.forEach((v, i) => { g += `<g class="hv" data-tip="${ddmm(dates[i])}|${v ? esc(name) + ': ' + fmtV(v, kind) : esc(empty)}"><rect x="${X(i) - st / 2}" y="${t}" width="${st}" height="${h - t - b}" fill="transparent"/><rect class="bb" x="${X(i) - bw / 2}" y="${Y(v)}" width="${bw}" height="${Math.max(0, h - b - Y(v))}" rx="3" fill="${color}" opacity=".85"/></g>`; });
    return svgWrap(w, h, g);
  }
  function comboChart(dates, a, b2, { w = 900, h = 250 } = {}) {
    if (!dates.length) return '<p class="tk-cap">Sem dados no período.</p>';
    const l = 64, r = 52, t = 10, bt = 26, maxA = Math.max(1, ...a) * 1.12, maxB = Math.max(1, ...b2) * 1.12, st = (w - l - r) / a.length, X = i => l + (i + .5) * st, YA = v => h - bt - v / maxA * (h - t - bt), YB = v => h - bt - v / maxB * (h - t - bt), bw = st * .58;
    let g = axis(w, h, l, r, t, bt, maxA, X, dates, 'n', { max: maxB, kind: 'n' });
    a.forEach((v, i) => { g += `<rect x="${X(i) - bw / 2}" y="${YA(v)}" width="${bw}" height="${Math.max(0, h - bt - YA(v))}" rx="3" fill="${CY}" opacity=".75"/>`; });
    g += `<polyline points="${b2.map((v, i) => X(i) + ',' + YB(v)).join(' ')}" fill="none" stroke="${P}" stroke-width="2.4" stroke-linejoin="round"/>`;
    a.forEach((v, i) => { g += `<g class="hv" data-tip="${ddmm(dates[i])}|Visitantes: ${num(v)}|Pedidos: ${num(b2[i])}"><rect x="${X(i) - st / 2}" y="${t}" width="${st}" height="${h - t - bt}" fill="transparent"/><line class="gl" x1="${X(i)}" x2="${X(i)}" y1="${t}" y2="${h - bt}" stroke="#d1d5db" stroke-dasharray="3 3"/><circle class="dot" cx="${X(i)}" cy="${YB(b2[i])}" r="4.5" fill="#fff" stroke="${P}" stroke-width="2.4"/></g>`; });
    return svgWrap(w, h, g);
  }
  function spark(dates, vals, { w = 200, h = 34, color = P } = {}) {
    if (vals.length < 2) return '';
    const max = Math.max(1, ...vals) * 1.1, st = w / (vals.length - 1), X = i => i * st, Y = v => h - 2 - v / max * (h - 4);
    let g = `<polyline points="${vals.map((v, i) => X(i) + ',' + Y(v)).join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>`;
    vals.forEach((v, i) => { g += `<g class="hv" data-tip="${ddmm(dates[i])}|Vendas: ${brl(v)}"><rect x="${X(i) - st / 2}" y="0" width="${st}" height="${h}" fill="transparent"/><circle class="dot" cx="${X(i)}" cy="${Y(v)}" r="2.8" fill="${color}"/></g>`; });
    return `<svg class="tk-spark" viewBox="-3 0 ${w + 6} ${h}" preserveAspectRatio="none" style="height:${h}px">${g}</svg>`;
  }
  function waterfall(steps, { w = 900, h = 300 } = {}) {
    const l = 64, r = 14, t = 24, b = 30, first = steps[0][1], max = Math.max(1, first, ...steps.map(s => s[1])) * 1.08, st = (w - l - r) / steps.length, bw = st * .56, Y = v => h - b - v / max * (h - t - b);
    let g = ''; for (let i = 0; i <= 4; i++) { const y = t + (h - t - b) * i / 4; g += `<line x1="${l}" x2="${w - r}" y1="${y}" y2="${y}" stroke="#f0f1f4"/><text x="${l - 8}" y="${y + 4}" text-anchor="end">${fmtAx(max * (1 - i / 4), 'brl')}</text>`; }
    let run = 0;
    steps.forEach(([nm, v, tp], i) => {
      const x = l + i * st + (st - bw) / 2; let y0, y1, c;
      if (tp) { y0 = 0; y1 = v; run = v; c = i ? GREEN : K; } else { y0 = run + v; y1 = run; run += v; c = v < 0 ? P : GREEN; }
      const top = Y(Math.max(y0, y1)), hh = Math.max(2, Math.abs(Y(y0) - Y(y1)));
      const lab = tp ? fmtAx(v, 'brl') : (v < 0 ? '−' : '+') + fmtAx(Math.abs(v), 'brl').replace('R$ ', '');
      g += `<g class="hv" data-tip="${esc(nm)}|${tp ? '' : v < 0 ? '− ' : '+ '}${brl(Math.abs(v))}"><rect x="${l + i * st}" y="${t}" width="${st}" height="${h - t - b}" fill="transparent"/><rect class="bb" x="${x}" y="${top}" width="${bw}" height="${hh}" rx="4" fill="${c}" opacity=".92"/><text x="${x + bw / 2}" y="${top - 6}" text-anchor="middle" style="font-size:10.5px;fill:#374151;font-weight:600">${lab}</text><text x="${x + bw / 2}" y="${h - 10}" text-anchor="middle">${esc(nm)}</text></g>`;
      if (i < steps.length - 1) g += `<line x1="${x + bw}" x2="${x + st}" y1="${Y(run)}" y2="${Y(run)}" stroke="#cbd5e1" stroke-dasharray="3 3"/>`;
    });
    return svgWrap(w, h, g);
  }

  // ---------- CSV ----------
  const csvMoney = c => ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');
  function downloadCsv(name, rows) {
    const csv = rows.map(r => r.map(v => { const s = String(v == null ? '' : v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = name;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // ---------- estilos ----------
  function ensureStyle() {
    if (root.CacifeShopee && root.CacifeShopee.ensureStyle) root.CacifeShopee.ensureStyle(); // classes shp-* usadas no ranking de criadores
    if (document.getElementById('ttk-v2-style')) return;
    const B = 'body[data-marketplace=tiktokshop][data-metrics-view=channel]';
    const css = `
    ${B} .market-content{padding-top:0!important}
    @media(min-width:721px){${B} .market-content{padding-left:28px!important;padding-right:28px!important}}
    @media(max-width:720px){${B} .market-content{padding-left:14px!important;padding-right:14px!important}}
    ${B} .market-header{background:${K}!important;margin:0 -28px!important;padding:15px 28px 15px!important;min-height:0;align-items:center;border-bottom:0!important;box-shadow:none!important}
    @media(max-width:720px){${B} .market-header{margin:0 -14px!important;padding:16px 14px 10px!important}}
    ${B} .market-header h1{color:#fff!important;display:flex;align-items:center;gap:12px;margin:0;white-space:nowrap}
    ${B} .market-header p{display:none!important}
    ${B} .market-header h1::before{content:'';width:40px;height:40px;flex:0 0 40px;border-radius:10px;background:#fff url(tiktokshop-logo.ico) center/26px no-repeat}
    ${B} .market-header .period-presets button{background:#ffffff12!important;border:1px solid #ffffff26!important;color:#e5e7eb!important;padding:8px 11px!important;font-size:12.5px!important;line-height:18px}
    ${B} .market-header .period-presets button:hover{background:#ffffff26!important;color:#fff!important}
    ${B} .market-header .period-presets button[aria-pressed=true]{background:${P}!important;border-color:${P}!important;color:#fff!important}
    ${B} .market-header .date-menu>summary{background:#ffffff14!important;border-color:#ffffff33!important;color:#fff!important}
    ${B} .market-header .account-avatar{background:#ffffff1a!important;color:#fff!important}
    ${B} #metrics-notice:empty{display:none}
    ${B} .ttk-v2 .ttk-band{margin:0 -28px 18px;padding:0 28px 14px}
    @media(max-width:720px){${B} .ttk-v2 .ttk-band{margin:0 -14px 16px;padding:0 14px 12px}}
    .ttk-v2{--p:${P};--p2:#fff0f3;--p3:#e0103a;--c:${CY};--c2:${CD};--c3:#e6fbfb;--k:${K};--ink:#111827;--mut:#6b7280;--ln:#eceef2;--brand:${P};--success:${GREEN};font-family:"DM Sans",system-ui,sans-serif;font-size:14px;color:var(--ink);font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;min-width:0}
    .ttk-v2 *{box-sizing:border-box}
    .ttk-v2 .ttk-band{background:var(--k);position:relative;border-radius:14px;padding:14px}
    .ttk-v2 .ttk-band::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,var(--c) 0%,var(--c) 30%,var(--p) 70%,var(--p) 100%)}
    ${B} .ttk-v2 .ttk-band{border-radius:0}
    .ttk-v2 .ttk-tabs{display:flex;gap:4px;flex-wrap:wrap}
    .ttk-v2 .ttk-tab{border:0;background:transparent;font:600 14px/18px "DM Sans",system-ui,sans-serif;color:#c9ccd4;padding:10px 14px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
    .ttk-v2 .ttk-tab:not(.on):hover{color:#fff;background:#ffffff14}
    .ttk-v2 .ttk-tab.on{background:#fff;color:var(--k)}
    .ttk-v2 .ttk-tab .cnt{font-size:11px;line-height:16px;background:var(--p);color:#fff;border-radius:999px;padding:0 7px;font-weight:700}
    .ttk-v2 .ttk-meta{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:-4px 0 14px;font-size:12.5px;color:var(--mut)}
    .ttk-v2 .tk-card{background:#fff;border:1px solid var(--ln);border-radius:16px;padding:18px;min-width:0;display:flex;flex-direction:column;box-shadow:0 1px 2px #1118270a}
    .ttk-v2 .tk-card h3{margin:0 0 2px;font-size:15px;font-weight:700;letter-spacing:-.01em;color:var(--ink);line-height:1.3}
    .ttk-v2 .tk-cap{margin:0 0 14px;color:var(--mut);font-size:12.5px;line-height:1.4}
    .ttk-v2 .tk-chead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .ttk-v2 .tk-min0{min-width:0}
    .ttk-v2 .tk-grid{display:grid;gap:16px;align-items:stretch}
    .ttk-v2 .tk-mt{margin-top:16px}
    .ttk-v2 .tk-stack{display:flex;flex-direction:column;gap:16px;min-width:0}.ttk-v2 .tk-stack>.tk-card{flex:1}
    .ttk-v2 .tk-push{margin-top:auto}
    .ttk-v2 .tk-fill{flex:1;display:flex;flex-direction:column;justify-content:space-between;min-width:0}
    .ttk-v2 .tk-fill.top{justify-content:flex-start}
    .ttk-v2 .tk-lbl{font-size:12.5px;color:var(--mut);font-weight:500}
    .ttk-v2 .tk-mut{color:var(--mut)}
    .ttk-v2 .tk-up{color:#16a34a;font-weight:600;font-size:12.5px}.ttk-v2 .tk-down{color:#dc2626;font-weight:600;font-size:12.5px}.ttk-v2 .tk-vs{font-size:12px}
    .ttk-v2 .tk-money{color:#16a34a!important;font-weight:700;white-space:nowrap}
    .ttk-v2 .tk-red{color:#dc2626!important}
    .ttk-v2 .tk-one{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
    .ttk-v2 .tk-scroll{overflow-x:auto;min-width:0}
    .ttk-v2 .tk-stretch{flex:1;display:flex;flex-direction:column}.ttk-v2 .tk-stretch>table{flex:1;height:100%}
    .ttk-v2 table.tk-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
    .ttk-v2 .tk-tbl th{border-top:0;font-size:12px;color:var(--mut);font-weight:600;text-align:left;padding:9px 10px;border-bottom:1px solid var(--ln);white-space:nowrap;background:transparent}
    .ttk-v2 .tk-tbl td{padding:11px 10px;border:0;border-bottom:1px solid #f3f4f6;vertical-align:middle;text-align:left;font-weight:400;line-height:1.35}
    .ttk-v2 .tk-tbl th.r,.ttk-v2 .tk-tbl td.r{text-align:right;white-space:nowrap}
    .ttk-v2 .tk-tbl td.nw{white-space:nowrap}
    .ttk-v2 .tk-tbl td small,.ttk-v2 .tk-sm{display:block;font-size:12px;color:var(--mut);white-space:nowrap}
    .ttk-v2 .tk-tbl tr:last-child td{border-bottom:0}
    .ttk-v2 .tk-pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;border-radius:999px;padding:3px 10px;white-space:nowrap;line-height:1.4}
    .ttk-v2 .tk-pill.g{background:#e7f7ee;color:#15803d}.ttk-v2 .tk-pill.cy{background:var(--c3);color:#00808c}.ttk-v2 .tk-pill.am{background:#fff4d6;color:#8a5a00}.ttk-v2 .tk-pill.rd{background:#fdecec;color:#b42318}.ttk-v2 .tk-pill.gy{background:#f3f4f6;color:#4b5563}.ttk-v2 .tk-pill.pk{background:var(--p2);color:var(--p3)}.ttk-v2 .tk-pill.pp{background:var(--p);color:#fff}
    .ttk-v2 .tk-foto{width:40px;height:40px;border-radius:10px;background:#f3f4f6;display:grid;place-items:center;font-size:18px;color:#c4c8d0;flex:none;object-fit:cover}
    .ttk-v2 .tk-foto.big{width:100%;height:150px;border-radius:12px;font-size:34px}
    .ttk-v2 .tk-foto.md{width:54px;height:54px}
    .ttk-v2 .tk-pn{display:flex;align-items:center;gap:12px;min-width:0}
    .ttk-v2 .tk-pn-tx{min-width:0;display:block;flex:1}
    .ttk-v2 .tk-pn-tx b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
    .ttk-v2 .tk-pn-tx>span{display:block;font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ttk-v2 .tk-btn{border:0;border-radius:10px;padding:10px 16px;font:700 13px "DM Sans",system-ui,sans-serif;cursor:pointer;background:var(--p);color:#fff;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
    .ttk-v2 .tk-btn.ghost{background:#fff;color:#374151;border:1px solid var(--ln)}
    .ttk-v2 .tk-btn.sm{padding:7px 12px;font-size:12.5px}
    .ttk-v2 .tk-btn:disabled{opacity:.55;cursor:wait}
    .ttk-v2 .tk-chips{display:flex;gap:6px;flex-wrap:wrap}
    .ttk-v2 .tk-chip{border:1px solid var(--ln);background:#fff;border-radius:9px;padding:6px 11px;font:600 12.5px "DM Sans",system-ui,sans-serif;color:#4b5563;white-space:nowrap;cursor:pointer}
    .ttk-v2 .tk-chip.on{background:var(--p);border-color:var(--p);color:#fff}
    .ttk-v2 .tk-search{display:flex;align-items:center;gap:8px;border:1px solid var(--ln);border-radius:10px;padding:0 12px;background:#fff;color:var(--mut);min-width:240px;height:36px}
    .ttk-v2 .tk-search input{border:0;outline:0;background:transparent;font:inherit;font-size:13px;color:var(--ink);flex:1;min-width:0;height:100%;padding:0}
    .ttk-v2 .tk-select{border:1px solid var(--ln);border-radius:10px;height:36px;padding:0 10px;font:inherit;font-size:13px;background:#fff;color:var(--ink)}
    .ttk-v2 .tk-link{background:none!important;border:0;padding:0;color:var(--p3);font:600 13px "DM Sans",system-ui,sans-serif;cursor:pointer;white-space:nowrap;text-decoration:none}
    .ttk-v2 .tk-link:hover{background:none!important;text-decoration:underline}
    .ttk-v2 .tk-kv{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #f3f4f6;font-size:13.5px;align-items:center}.ttk-v2 .tk-kv:last-child{border-bottom:0}.ttk-v2 .tk-kv>b{white-space:nowrap}
    .ttk-v2 .tk-note{display:flex;gap:8px;align-items:center;background:#fafafa;border:1px solid var(--ln);border-radius:10px;padding:9px 12px;font-size:12.5px;color:#4b5563}
    .ttk-v2 .tk-hbar{display:grid;gap:10px;align-items:center;padding:7px 0;font-size:13px}.ttk-v2 .tk-hbar .tk-tr{height:10px;background:#f3f4f6;border-radius:9px;overflow:hidden}.ttk-v2 .tk-hbar .tk-tr i{display:block;height:100%;border-radius:9px}.ttk-v2 .tk-hbar>span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ttk-v2 .tk-hbar>b{text-align:right}
    .ttk-v2 .tk-prog{height:8px;background:#f3f4f6;border-radius:9px;overflow:hidden;display:block}.ttk-v2 .tk-prog i{display:block;height:100%;border-radius:9px}
    .ttk-v2 .tk-dot{width:10px;height:10px;border-radius:3px;flex:none;display:inline-block}
    .ttk-v2 .tk-stackbar{display:flex;height:12px;border-radius:99px;overflow:hidden;margin:4px 0 10px;gap:2px}.ttk-v2 .tk-stackbar i{display:block;cursor:crosshair}
    .ttk-v2 .tk-ico{flex:0 0 28px;width:28px;height:28px;border-radius:8px;background:var(--p2);color:var(--p);display:grid;place-items:center;font-size:15px}
    .ttk-v2 .tk-ico.c{background:var(--c3);color:var(--c2)}
    .ttk-v2 .tk-kc{padding:16px 18px;justify-content:center}
    .ttk-v2 .tk-kc-h{display:flex;align-items:center;gap:10px;margin-bottom:14px}.ttk-v2 .tk-kc-h .tk-lbl{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ttk-v2 .tk-kc-bar{margin-left:auto;flex:none;width:28px;height:4px;border-radius:9px}
    .ttk-v2 .tk-kc-v{font-size:23px;font-weight:700;letter-spacing:-.02em;line-height:1.15}
    .ttk-v2 .tk-kc-d{margin-top:10px;font-size:12.5px;min-height:18px}
    .ttk-v2 .tk-kc.dark{background:#111827;border-color:#111827;color:#fff;position:relative;overflow:hidden}.ttk-v2 .tk-kc.dark .tk-lbl{color:#cbd5e1}.ttk-v2 .tk-kc.dark .tk-mut{color:#9ca3af}.ttk-v2 .tk-kc.dark .tk-money{color:#4ade80!important}
    .ttk-v2 .tk-dark{background:#111827;color:#fff;border-radius:14px;padding:26px;display:flex;flex-direction:column;justify-content:center;gap:18px;min-width:0;position:relative;overflow:hidden}
    .ttk-v2 .tk-dark .tk-acc{position:absolute;top:0;left:26px;width:46px;height:4px;border-radius:0 0 6px 6px;background:linear-gradient(90deg,var(--c),var(--p))}
    .ttk-v2 .tk-dark-h{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px}
    .ttk-v2 .tk-logo{width:30px;height:30px;flex:0 0 30px;border-radius:8px;background:#fff url(tiktokshop-logo.ico) center/20px no-repeat}
    .ttk-v2 .tk-dark-v{font-size:clamp(26px,2.6vw,36px);font-weight:700;letter-spacing:-.03em;margin:8px 0;white-space:nowrap;color:#4ade80;overflow:hidden;text-overflow:ellipsis}
    .ttk-v2 .tk-dark .tk-up{color:#4ade80}.ttk-v2 .tk-dark .tk-down{color:#fca5a5}.ttk-v2 .tk-dark .tk-mut{color:#ffffffa6}
    .ttk-v2 .tk-dark-f{border-top:1px solid #ffffff22;padding-top:16px;display:flex;justify-content:space-between;gap:12px;align-items:flex-end}
    .ttk-v2 .tk-chipd{font-size:12px;background:#ffffff1a;border-radius:999px;padding:4px 10px;white-space:nowrap}
    .ttk-v2 .tk-fin{grid-template-columns:minmax(0,1.3fr) repeat(3,minmax(0,1fr))}
    .ttk-v2 .tk-block{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.15fr);gap:14px}
    .ttk-v2 .tk-block .tk-mini{border:1px solid var(--ln);border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;justify-content:center;min-width:0}
    .ttk-v2 .tk-block .tk-mini .v{font-size:24px;font-weight:700;letter-spacing:-.02em;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ttk-v2 .tk-stt{border:1px solid var(--ln);background:#fff;border-radius:12px;padding:12px 14px;min-width:0;cursor:pointer;text-align:left;font:inherit;color:inherit}
    .ttk-v2 .tk-stt .tk-lbl{display:flex;align-items:center;gap:6px}.ttk-v2 .tk-stt .tk-lbl i{width:8px;height:8px;border-radius:3px;flex:none}
    .ttk-v2 .tk-stt b{display:block;font-size:21px;margin-top:6px}
    .ttk-v2 .tk-stt:hover{border-color:#d1d5db}
    .ttk-v2 .tk-stt.on{background:var(--k);border-color:var(--k)}.ttk-v2 .tk-stt.on .tk-lbl{color:#cbd5e1}.ttk-v2 .tk-stt.on b{color:#fff!important}
    .ttk-v2 .tk-pag{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;font-size:12.5px;color:var(--mut);flex-wrap:wrap}
    .ttk-v2 .tk-pg{display:flex;gap:4px;flex-wrap:wrap}.ttk-v2 .tk-pg button{min-width:30px;height:30px;border:1px solid var(--ln);border-radius:8px;display:grid;place-items:center;font:600 12.5px "DM Sans",system-ui,sans-serif;color:#374151;background:#fff;padding:0 6px;cursor:pointer}.ttk-v2 .tk-pg button.on{background:var(--k);color:#fff;border-color:var(--k)}.ttk-v2 .tk-pg button:disabled{opacity:.45;cursor:default}.ttk-v2 .tk-pg span{min-width:20px;height:30px;display:grid;place-items:center}
    .ttk-v2 .tk-tag{font-size:10.5px;font-weight:800;letter-spacing:.04em;border-radius:6px;padding:2px 7px;white-space:nowrap}
    .ttk-v2 .tk-av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px;flex:0 0 38px;color:#fff;background:linear-gradient(135deg,var(--p),var(--c));object-fit:cover;text-transform:uppercase}
    .ttk-v2 .tk-empty{padding:26px;color:var(--mut);font-size:13px;text-align:center}
    .ttk-v2 .tk-funnel{display:flex;flex-direction:column;gap:14px}
    .ttk-v2 .tk-funnel .bar{height:36px;border-radius:9px;display:flex;align-items:center;padding:0 10px;color:#fff;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden}
    .ttk-v2 .tk-mgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
    .ttk-v2 .tk-mgrid>div{padding:12px 14px;min-width:0}
    .ttk-v2 .tk-mgrid>div:nth-child(n+4){border-top:1px solid #f3f4f6}.ttk-v2 .tk-mgrid>div:not(:nth-child(3n+1)){border-left:1px solid #f3f4f6}
    .ttk-v2 .tk-mgrid .v{font-size:20px;font-weight:700;margin:6px 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ttk-v2 .tk-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
    .ttk-v2 .tk-svg{width:100%;height:auto;display:block}
    .ttk-v2 .tk-spark{width:100%;display:block;overflow:visible}
    .ttk-v2 svg text{font-family:"DM Sans",system-ui,sans-serif;fill:#9ca3af;font-size:11px}
    .ttk-v2 .hv{cursor:crosshair}.ttk-v2 .hv .gl,.ttk-v2 .hv .dot{opacity:0}.ttk-v2 .hv:hover .gl,.ttk-v2 .hv:hover .dot{opacity:1}.ttk-v2 .hv:hover .bb{opacity:1!important}
    .ttk-v2 .tk-legend{display:flex;gap:14px;font-size:12.5px;white-space:nowrap;flex-wrap:wrap}.ttk-v2 .tk-legend span{display:flex;gap:6px;align-items:center}
    .ttk-v2 .tk-wait{padding:30px;text-align:center;color:var(--mut);font-size:13px}
    /* atendimento: 3 colunas */
    .ttk-v2 .tk-chat{display:grid;grid-template-columns:290px minmax(0,1fr) 300px;height:680px;padding:0;overflow:hidden}
    .ttk-v2 .tk-clist{border-right:1px solid var(--ln);display:flex;flex-direction:column;min-width:0;min-height:0}
    .ttk-v2 .tk-clist .hd{padding:14px;border-bottom:1px solid var(--ln)}
    .ttk-v2 .tk-clist .items{overflow-y:auto;flex:1;min-height:0}
    .ttk-v2 .tk-ci{display:flex;gap:10px;padding:12px 14px;border:0;border-bottom:1px solid #f5f5f5;cursor:pointer;min-width:0;width:100%;background:transparent;text-align:left;font:inherit;color:inherit}
    .ttk-v2 .tk-ci:hover{background:#fafafa}.ttk-v2 .tk-ci.on{background:var(--p2)}
    .ttk-v2 .tk-ci .tx{flex:1;min-width:0}.ttk-v2 .tk-ci .top{display:flex;justify-content:space-between;gap:8px}.ttk-v2 .tk-ci .top b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13.5px}.ttk-v2 .tk-ci .top small{color:var(--mut);white-space:nowrap;font-size:11.5px}
    .ttk-v2 .tk-ci .pv{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:3px}.ttk-v2 .tk-ci .pv span{font-size:12.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ttk-v2 .tk-badge{background:var(--p);color:#fff;font-size:11px;font-weight:700;border-radius:999px;min-width:19px;height:19px;padding:0 6px;display:grid;place-items:center;flex:none}
    .ttk-v2 .tk-thread{display:flex;flex-direction:column;min-width:0;min-height:0}
    .ttk-v2 .tk-thread .hd{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--ln);min-height:59px}
    .ttk-v2 .tk-msgs{flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px;background:#fafafa;min-height:0}
    .ttk-v2 .tk-bub{max-width:66%;padding:9px 13px;font-size:13.5px;line-height:1.4;word-break:break-word;white-space:pre-wrap}
    .ttk-v2 .tk-bub.c{background:#eef0f3;color:#111827;align-self:flex-start;border-radius:14px 14px 14px 4px}
    .ttk-v2 .tk-bub.s{background:var(--p);color:#fff;align-self:flex-end;border-radius:14px 14px 4px 14px}
    .ttk-v2 .tk-bub.bot{background:#e5e7eb;color:#374151;align-self:flex-end;border-radius:14px 14px 4px 14px}
    .ttk-v2 .tk-bub em{display:block;font-style:normal;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:2px;white-space:normal}
    .ttk-v2 .tk-bub small{display:block;font-size:10.5px;opacity:.65;margin-top:3px;text-align:right;white-space:normal}
    .ttk-v2 .tk-bub img{max-width:220px;max-height:260px;border-radius:10px;display:block}
    .ttk-v2 .tk-sysn{align-self:center;font-size:11.5px;color:var(--mut);background:#fff;border:1px solid var(--ln);border-radius:999px;padding:3px 12px;text-align:center;max-width:90%}
    .ttk-v2 .tk-comp{display:flex;gap:10px;align-items:flex-end;padding:12px 16px;border-top:1px solid var(--ln);background:#fff}
    .ttk-v2 .tk-comp textarea{flex:1;border:1px solid var(--ln);border-radius:10px;padding:10px 12px;min-width:0;resize:none;font:inherit;font-size:13.5px;color:var(--ink);max-height:110px;background:#fff}
    .ttk-v2 .tk-senderr{color:#dc2626;font-size:12px;padding:0 16px 8px;background:#fff}
    .ttk-v2 .tk-cpanel{border-left:1px solid var(--ln);overflow-y:auto;padding:16px;min-width:0}
    .ttk-v2 .tk-cpanel .tk-kv{font-size:13px;padding:8px 0}
    .ttk-v2 .tk-cpanel h4{margin:16px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
    .ttk-v2 .tk-ocard{border:1px solid var(--ln);border-radius:12px;padding:10px}
    /* vídeos & criadores: ranking + gaveta do criador */
    .ttk-v2 .ttk-rk2{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:18px;align-items:start}
    .ttk-v2 .ttk-tbl{border:1px solid var(--ln);border-radius:14px;overflow:hidden;background:#fff}
    .ttk-v2 .ttk-tr{display:grid;gap:8px;align-items:center;border-bottom:1px solid #f3f4f6;font-variant-numeric:tabular-nums}
    .ttk-v2 .ttk-tr:last-child{border-bottom:0}.ttk-v2 .ttk-tr.th{font-weight:600;padding-top:12px;padding-bottom:12px}
    .ttk-v2 .ttk-tr.rw{cursor:pointer;transition:background .15s}
    .ttk-v2 .ttk-tr .pos{font-weight:800;display:flex;align-items:center;gap:4px}
    .ttk-v2 .ttk-tr .who{display:flex;align-items:center;gap:10px;min-width:0}.ttk-v2 .ttk-tr .who b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ttk-v2 .ttk-tr .who div span{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
    .ttk-v2 .ttk-tr .num{text-align:right;font-size:13px}.ttk-v2 .ttk-tr .money{text-align:right;font-weight:700}.ttk-v2 .ttk-tr .go{color:var(--mut);text-align:right}
    .ttk-v2 .ttk-av2{width:38px;height:38px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:.82rem;text-transform:uppercase}
    .ttk-v2 img.ttk-av2{object-fit:cover;padding:0;background:#f3f4f6}
    .ttk-v2 .ttk-det{border:1px solid var(--ln);background:#fff;padding:18px;position:sticky;top:12px;min-width:0}
    .ttk-v2 .ttk-det .back{background:none;border:0;color:var(--mut);font:inherit;font-size:12.5px;cursor:pointer;padding:0;margin-bottom:12px;display:none}
    .ttk-v2 .ttk-det .pf{display:flex;align-items:center;gap:14px;margin-bottom:14px;min-width:0}
    .ttk-v2 .ttk-det .pf .avw{position:relative;flex:none}.ttk-v2 .ttk-det .pf .avw .ttk-av2{width:64px;height:64px;font-size:1.3rem}
    .ttk-v2 .ttk-det .pf .crown{position:absolute;right:-4px;bottom:-4px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px #0002}
    .ttk-v2 .ttk-det .pf h4{margin:0 0 2px;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ttk-v2 .ttk-det .pf a{font-size:12.5px;font-weight:600;text-decoration:none}
    .ttk-v2 .ttk-det .st{display:grid;margin-bottom:14px}.ttk-v2 .ttk-det .st span{display:block;font-size:11.5px;color:var(--mut);margin-bottom:3px}
    .ttk-v2 .ttk-det .vh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}.ttk-v2 .ttk-det .vh h5{margin:0;font-size:14px}.ttk-v2 .ttk-det .vh span{font-size:12px;color:var(--mut)}
    .ttk-v2 .ttk-vl{display:flex;flex-direction:column;max-height:560px;overflow:auto;padding-right:4px}
    .ttk-v2 .ttk-vr{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:10px;align-items:center;text-decoration:none;color:inherit;padding:10px 4px;border-bottom:1px solid #f3f4f6;border-radius:0}
    .ttk-v2 .ttk-vr:last-child{border-bottom:0}
    .ttk-v2 .ttk-vr .th{width:46px;height:46px;border-radius:10px;overflow:hidden;position:relative}
    .ttk-v2 .ttk-vr .th img{width:100%;height:100%;object-fit:cover}.ttk-v2 .ttk-vr .th i{position:absolute;left:2px;top:2px;font-style:normal;font-size:8.5px;font-weight:800;letter-spacing:.03em;border-radius:4px;padding:1px 4px}
    .ttk-v2 .ttk-vr .tx{min-width:0}.ttk-v2 .ttk-vr .tx b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ttk-v2 .ttk-vr .tx span{font-size:11.5px;color:var(--mut)}
    .ttk-v2 .ttk-vr .bx{border-radius:10px;padding:6px 10px;font-size:12.5px;min-width:130px}
    .ttk-v2 .ttk-vr .bx div{display:flex;gap:8px;align-items:center;justify-content:space-between}.ttk-v2 .ttk-vr .bx .g{font-weight:700}
    @media(max-width:980px){.ttk-v2 .ttk-rk2{grid-template-columns:minmax(0,1fr)}.ttk-v2 .ttk-det{position:static}.ttk-v2 .ttk-det .back{display:inline-block}}
    @media(max-width:620px){.ttk-v2 .ttk-tr .hide-sm{display:none}}
    @media(max-width:1180px) and (min-width:981px){.ttk-v2 .ttk-tr .hide-lg{display:none}}
    /* vídeos & criadores (reaproveita ttk-*; troca o roxo pelo rosa do TikTok) */
    .ttk-v2 .shp-panel{background:#fff;border:1px solid var(--ln);border-radius:16px;padding:18px;box-shadow:0 1px 2px #1118270a;color:var(--ink)}
    .ttk-v2 .ttk-tbl{border-radius:14px;border-color:var(--ln)}
    .ttk-v2 .ttk-tr{grid-template-columns:48px minmax(0,1fr) 78px 70px 124px 14px;padding:11px 14px;border-color:#f3f4f6}.ttk-v2 .ttk-tr .hide-lg{display:none}
    .ttk-v2 .ttk-tr.th{font-size:12px;color:var(--mut);border-bottom-color:var(--ln)}
    .ttk-v2 .ttk-tr.rw:hover{background:#fafafa}.ttk-v2 .ttk-tr.sel{background:var(--p2);box-shadow:inset 3px 0 0 var(--p)}
    .ttk-v2 .ttk-tr .pos{color:#9ca3af}.ttk-v2 .ttk-tr .pos.top{color:var(--ink)}.ttk-v2 .ttk-tr .pos i{font-size:16px}
    .ttk-v2 .ttk-tr .money,.ttk-v2 .ttk-det .st .gv b,.ttk-v2 .ttk-vr .bx .g{color:#16a34a}
    .ttk-v2 .ttk-av2{background:linear-gradient(135deg,var(--p),var(--c))}
    .ttk-v2 .ttk-det{border-color:var(--ln);border-radius:16px}.ttk-v2 .ttk-det .pf a{color:var(--p3)}.ttk-v2 .ttk-det .pf a:hover{background:none;text-decoration:underline}
    .ttk-v2 .ttk-det .pf .crown{background:#fff;color:#f5b301;font-size:15px}
    .ttk-v2 .ttk-det .st{border:0;gap:8px;grid-template-columns:repeat(3,minmax(0,1fr))}.ttk-v2 .ttk-det .st div{background:#f7f7f9;border-radius:10px;padding:9px 10px;min-width:0}.ttk-v2 .ttk-det .st div+div{border-left:0}
    .ttk-v2 .ttk-det .st b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ttk-v2 .ttk-vr:hover{background:#fafafa}.ttk-v2 .ttk-vr .th{background:#f3f4f6}.ttk-v2 .ttk-vr .bx{border:0;background:#f7f7f9}
    @media(max-width:620px){.ttk-v2 .ttk-tr{grid-template-columns:40px minmax(0,1fr) 110px 20px}}
    @media(max-width:1100px){
      .ttk-v2 .tk-cols{grid-template-columns:minmax(0,1fr)!important}
      .ttk-v2 .tk-block{grid-template-columns:repeat(2,minmax(0,1fr))}.ttk-v2 .tk-block>.tk-dark{grid-column:1/-1!important;grid-row:auto!important;order:-1}.ttk-v2 .tk-block .tk-mini{grid-column:auto!important;grid-row:auto!important}
      .ttk-v2 .tk-k4{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .ttk-v2 .tk-fin{grid-template-columns:repeat(3,minmax(0,1fr))}.ttk-v2 .tk-fin>.tk-dark{grid-column:1/-1}
      .ttk-v2 .tk-tiles{grid-template-columns:repeat(3,minmax(0,1fr))!important}
      .ttk-v2 .tk-r5{grid-template-columns:repeat(3,minmax(0,1fr))!important}
      .ttk-v2 .tk-chat{grid-template-columns:minmax(0,1fr);height:auto}.ttk-v2 .tk-clist{border-right:0;border-bottom:1px solid var(--ln);max-height:320px}.ttk-v2 .tk-thread{height:520px}.ttk-v2 .tk-cpanel{border-left:0;border-top:1px solid var(--ln)}
      .ttk-v2 .tk-search{min-width:0;flex:1}
    }
    @media(max-width:620px){.ttk-v2 .tk-fin,.ttk-v2 .tk-block,.ttk-v2 .tk-k4,.ttk-v2 .tk-k3{grid-template-columns:minmax(0,1fr)!important}.ttk-v2 .tk-tiles,.ttk-v2 .tk-r5{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ttk-v2 .tk-mgrid{grid-template-columns:repeat(2,minmax(0,1fr))}.ttk-v2 .tk-mgrid>div{border-left:0!important;border-top:1px solid #f3f4f6}}`;
    document.head.append(Object.assign(document.createElement('style'), { id: 'ttk-v2-style', textContent: css }));
    // tooltip único dos gráficos ([data-tip] = "título|linha|linha")
    const tip = n('div'); tip.id = 'ttk-tip';
    tip.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:#161823;color:#fff;border-radius:10px;padding:8px 11px;font:500 12.5px/1.45 "DM Sans",system-ui,sans-serif;box-shadow:0 8px 24px #0003;display:none;white-space:nowrap';
    document.body.append(tip);
    document.addEventListener('mousemove', (e) => {
      const t = e.target && e.target.closest && e.target.closest('.ttk-v2 [data-tip]');
      if (!t) { tip.style.display = 'none'; return; }
      const [a, ...r] = t.getAttribute('data-tip').split('|');
      const b = n('b', '', a); b.style.cssText = 'display:block;color:' + CY + ';font-size:11.5px;font-weight:700';
      tip.replaceChildren(b); r.forEach((x, i) => { if (i) tip.append(document.createElement('br')); tip.append(document.createTextNode(x)); });
      tip.style.display = 'block';
      const w = tip.offsetWidth, h = tip.offsetHeight; let x = e.clientX + 14, y = e.clientY - h - 12;
      if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y < 8) y = e.clientY + 16;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }, { passive: true });
  }
  // imagens que falharem viram o fundo cinza do quadro
  function fixImgs(el) { el.querySelectorAll('img').forEach(im => { if (!im.dataset.fx) { im.dataset.fx = 1; im.addEventListener('error', () => { im.removeAttribute('src'); im.style.visibility = 'hidden'; }); } }); return el; }
  function box(html, cls = 'tk-wrap') { const d = n('div', cls); d.innerHTML = html; return fixImgs(d); }
  const grid = (cols, items, cls = '', mt = true) => `<div class="tk-grid ${cls}${mt ? ' tk-mt' : ''}" style="grid-template-columns:${cols}">${items.join('')}</div>`;

  // ---------- estado (período anterior) ----------
  let prevOv; // undefined = consultando, null = sem base
  const pv = f => prevOv === undefined ? undefined : (prevOv ? (f(prevOv) || 0) : 0);
  let goTab = () => {};

  // ---------- 1. Resumo ----------
  function grupoStatus(porStatus) {
    const g = { entregue: 0, transito: 0, aguardando: 0, cancelado: 0, naopago: 0, outros: 0 };
    for (const s of porStatus || []) { const k = ost(s.status)[3] || 'outros'; g[k] += s.n || 0; }
    return [['Entregues', g.entregue, GREEN], ['Em trânsito', g.transito, CD], ['Aguardando envio', g.aguardando, AMBER], ['Cancelados', g.cancelado, RED], ['Não pagos', g.naopago, GRAY], ['Outros', g.outros, '#64748b']].filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  }
  const alertasEstoque = s => [...((s && s.esgotados) || []), ...((s && s.criticos) || [])].sort((a, b) => (b.u30 || 0) - (a.u30 || 0) || (a.dias || 0) - (b.dias || 0));
  const diasTxt = x => !(x.qty > 0) ? 'Esgotado' : (x.dias < 1 ? '< 1 dia' : Math.floor(x.dias) + (Math.floor(x.dias) === 1 ? ' dia' : ' dias'));
  const estPill = x => !(x.qty > 0) ? pill('Esgotado', 'rd') : pill(diasTxt(x), x.dias <= 3 ? 'rd' : 'am');
  const vendeDia = x => ((x.u30 || 0) / 30).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  function secResumo(data) {
    const liqPct = data.revenue > 0 ? pct(data.liquido / data.revenue * 100) : '—';
    const mini = (label, icon, val, cmp, i) => `<div class="tk-mini" style="grid-column:${i % 2 + 1};grid-row:${Math.floor(i / 2) + 1}"><div class="tk-kc-h"><span class="tk-ico${i % 2 ? ' c' : ''}"><i class="ph ${icon}"></i></span><span class="tk-lbl">${label}</span><i class="tk-kc-bar" style="background:${i % 2 ? CY : P}"></i></div><div class="v" title="${esc(val)}">${val}</div><div class="tk-kc-d">${cmp}</div></div>`;
    const [s, e] = cur();
    const dark = `<div class="tk-dark" style="grid-column:3;grid-row:1/span 2"><i class="tk-acc"></i><div class="tk-dark-h"><span class="tk-logo"></span>Repasse líquido</div>
      <div><div style="font-size:13px;opacity:.7">Bruto − taxas TikTok − reembolsos ± ajustes</div><div class="tk-dark-v" title="${esc(brl(data.liquido))}">${brl(data.liquido)}</div>${delta(data.liquido, pv(p => p.liquido)).replace('vs. anterior', 'vs. período anterior')}</div>
      <div class="tk-dark-f"><div><div style="font-size:12px;opacity:.65">do faturamento bruto</div><div style="font-size:22px;font-weight:700">${liqPct}</div></div>${s && e ? `<span class="tk-chipd">${ddmm(s)} – ${ddmm(e)}</span>` : ''}</div></div>`;
    const block = `<div class="tk-card" style="padding:16px"><div class="tk-block">${[
      mini('Faturamento bruto', 'ph-currency-circle-dollar', brl(data.revenue), delta(data.revenue, pv(p => p.revenue)), 0),
      mini('Taxas TikTok', 'ph-percent', brl(data.fees), delta(data.fees, pv(p => p.fees), true), 1),
      mini('Pedidos pagos', 'ph-bag-simple', num(data.paid), delta(data.paid, pv(p => p.paid)), 2),
      mini('Reembolsado', 'ph-arrow-u-up-left', brl(data.devolucoes && data.devolucoes.valor), delta((data.devolucoes && data.devolucoes.valor) || 0, pv(p => p.devolucoes && p.devolucoes.valor), true), 3),
    ].join('')}${dark}</div></div>`;
    const sv = seriesOf(data.byDay);
    const vendas = `<div class="tk-card">${chead('Vendas por dia', 'Faturamento bruto por dia · ticket médio ' + brl(data.ticket), `<span class="tk-pill pk" style="margin-top:2px">${brl(data.revenue)} no período</span>`)}<div class="tk-push">${lineChart(sv.dates, sv.vals, { h: 250, name: 'Vendas' })}</div></div>`;
    const sts = grupoStatus(data.porStatus), tot = sts.reduce((a, x) => a + x[1], 0) || 1;
    const status = `<div class="tk-card">${chead('Status dos pedidos', num(data.orders || tot) + ' pedidos no período')}${sts.length ? stackBar(sts) + `<div class="tk-fill">${sts.map(([l, v, c]) => `<div class="tk-kv"><span style="display:flex;gap:8px;align-items:center">${legendDot(c)}${esc(l)}</span><b${l === 'Cancelados' ? ' class="tk-red"' : ''}>${num(v)} <span class="tk-mut" style="font-weight:500">· ${pct(v / tot * 100)}</span></b></div>`).join('')}</div>` : '<p class="tk-cap">Sem pedidos no período.</p>'}</div>`;
    const rk = (data.ranking || []).slice().sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 6);
    const top = `<div class="tk-card">${chead('Top produtos', 'Por valor vendido · pedidos pagos no período', link('Ver todos →', 'Produtos'))}<div class="tk-fill top">${rk.length ? `<div class="tk-scroll tk-stretch"><table class="tk-tbl"><thead><tr><th>#</th><th>Produto</th><th class="r">Unidades</th><th class="r">Valor</th></tr></thead><tbody>${rk.map((p, i) => `<tr><td style="width:44px">${pill(String(i + 1), i < 3 ? 'pp' : 'gy')}</td><td><span class="tk-pn">${foto(p.image)}${pname(p.title, 380, data.revenue > 0 ? pct(p.value / data.revenue * 100) + ' do faturamento' : '')}</span></td><td class="r"><b>${num(p.units)}</b></td><td class="r tk-money">${brl(p.value)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="tk-cap">Nenhum item no período.</p>'}</div></div>`;
    const f = data.financeiro || {}, est = f.aReceberEstimado || {}, conf = f.aReceberConfirmado || {};
    const aRec = est.total || 0;
    const receber = `<div class="tk-card">${chead('A receber (estimado)', 'Pedidos pagos ainda não liquidados pelo TikTok', link('Financeiro →', 'Financeiro'))}<div class="tk-fill"><div style="font-size:28px;font-weight:700;letter-spacing:-.02em" class="tk-money">${brl(aRec)}</div>
      <div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin:12px 0 6px"><span class="tk-mut">Já confirmado pelo TikTok</span><b>${brl(conf.v)}</b></div><span class="tk-prog"><i style="width:${aRec > 0 ? Math.min(100, (conf.v || 0) / aRec * 100) : 0}%;background:linear-gradient(90deg,${CD},${CY})"></i></span></div>
      <div style="margin-top:6px">${[['Entregues', est.entregue, GREEN], ['Em trânsito', est.transito, CD], ['Aguardando envio', est.aguardando, AMBER]].sort((a, b) => ((b[1] && b[1].v) || 0) - ((a[1] && a[1].v) || 0)).map(([l, g, c]) => `<div class="tk-kv" style="font-size:13px;padding:7px 0"><span style="display:flex;gap:8px;align-items:center">${legendDot(c)}${l} <span class="tk-mut" style="font-size:12px">· ${num(g && g.n)} ped.</span></span><b>${brl(g && g.v)}</b></div>`).join('')}</div></div></div>`;
    const al = alertasEstoque(data.estoque).slice(0, 3);
    const estoque = `<div class="tk-card">${chead('Alertas de estoque', 'Variações que vendem e estão acabando', link('Estoque →', 'Estoque'))}<div class="tk-fill">${al.length ? al.map(x => `<div class="tk-pn" style="padding:8px 0;border-bottom:1px solid #f3f4f6">${foto(x.img)}${pname(x.title, 190, esc(x.variacao || x.seller_sku || '') + ' · vende ' + vendeDia(x) + '/dia')}${estPill(x)}</div>`).join('') : '<p class="tk-cap">Nenhum alerta de estoque agora.</p>'}</div></div>`;
    return box(block + grid('minmax(0,1.9fr) minmax(0,1fr)', [vendas, status], 'tk-cols') + grid('minmax(0,1.9fr) minmax(0,1fr)', [top, `<div class="tk-stack">${receber}${estoque}</div>`], 'tk-cols'));
  }

  // ---------- 2. Pedidos ----------
  function secPedidos(data) {
    const st = { grupo: '', q: '', page: 1, token: 0, last: null };
    const el = box(`<div class="tk-grid tk-tiles" style="grid-template-columns:repeat(6,minmax(0,1fr));gap:10px"></div>
      <div class="tk-card tk-mt"><div class="tk-chead" style="align-items:center;flex-wrap:wrap;margin-bottom:12px"><div><h3>Pedidos</h3><p class="tk-cap" style="margin:0">Todos os pedidos no período · mais recentes primeiro</p></div><label class="tk-search"><i class="ph ph-magnifying-glass"></i><input type="search" placeholder="Buscar pedido ou cliente" aria-label="Buscar pedido ou cliente"></label></div>
      <div class="tk-scroll tk-otbl"></div><div class="tk-pag"></div></div>`);
    const tiles = el.querySelector('.tk-tiles'), tbl = el.querySelector('.tk-otbl'), pag = el.querySelector('.tk-pag'), inp = el.querySelector('input');
    const cont0 = { todos: data.orders || 0 }; for (const s of data.porStatus || []) { const k = ost(s.status)[3]; if (k) cont0[k] = (cont0[k] || 0) + (s.n || 0); }
    const paintTiles = (c) => {
      tiles.innerHTML = GRUPOS.map(([g, l, cor, key]) => { const v = c[key || g] || 0; return `<button type="button" class="tk-stt${st.grupo === g ? ' on' : ''}" data-g="${g}"><div class="tk-lbl"><i style="background:${cor}"></i><span class="tk-one">${l}</span></div><b${g === 'cancelado' ? ' class="tk-red"' : ''}>${num(v)}</b></button>`; }).join('');
      tiles.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { st.grupo = b.dataset.g; st.page = 1; load(); });
    };
    paintTiles(cont0);
    const row = (o) => {
      const [sl, sc] = o.pay_status === 'pending' && o.status === 'UNPAID' ? ['Não pago', 'gy'] : ost(o.status);
      const ship = [o.transportadora, o.rastreio].filter(Boolean).map(esc).join(' · ');
      const it = Number(o.itens) || 1;
      return `<tr><td class="nw"><b style="font-size:12.5px">${esc(o.id)}</b></td><td class="nw">${esc(noYear(o.dt))}</td>
        <td class="nw"><b>${esc(o.cliente || '—')}</b>${o.telefone ? `<small>${esc(o.telefone)}</small>` : ''}${o.cidade ? `<small>${esc(o.cidade)}</small>` : ''}</td>
        <td><span class="tk-pn">${foto(o.img)}${pname(o.produto, 230, esc(o.variacao || '') + (it > 1 ? ` · <b style="display:inline;color:var(--p3)">${it} itens</b>` : ''))}</span></td>
        <td class="r"><b>${brl(o.total)}</b></td><td class="nw">${pill(sl, sc)}${ship ? `<small style="margin-top:4px">${ship}</small>` : ''}</td>
        <td class="r">${o.repasse == null ? '<span class="tk-mut">—</span>' : `<span class="tk-money">${brl(o.repasse)}</span>`}</td></tr>`;
    };
    function paintPag(total, page) {
      const per = 10, pages = Math.max(1, Math.ceil(total / per)), a = total ? (page - 1) * per + 1 : 0, b = Math.min(total, page * per);
      const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter(x => x >= 1 && x <= pages).sort((x, y) => x - y);
      let h = `<button type="button" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Anterior"><i class="ph ph-caret-left"></i></button>`, last = 0;
      for (const x of nums) { if (x - last > 1) h += '<span>…</span>'; h += `<button type="button" data-p="${x}" class="${x === page ? 'on' : ''}">${num(x)}</button>`; last = x; }
      h += `<button type="button" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Próxima"><i class="ph ph-caret-right"></i></button>`;
      pag.innerHTML = `<span>Mostrando ${num(a)}–${num(b)} de ${num(total)}</span><div class="tk-pg">${h}</div>`;
      pag.querySelectorAll('button[data-p]').forEach(bt => bt.onclick = () => { const p = +bt.dataset.p; if (p >= 1 && p <= pages && p !== st.page) { st.page = p; load(); } });
    }
    function load() {
      const [s, e] = cur(); const my = ++st.token;
      paintTiles(st.last ? st.last.contagem || cont0 : cont0);
      tbl.style.opacity = '.55';
      if (!st.last) tbl.innerHTML = '<div class="tk-wait">Carregando pedidos…</div>';
      const qs = { start: s, end: e, page: st.page }; if (st.grupo) qs.grupo = st.grupo; if (st.q) qs.q = st.q;
      authGet('/api/tiktok/orders?' + new URLSearchParams(qs)).catch(() => null).then(d => {
        if (my !== st.token) return; tbl.style.opacity = '';
        if (!d) { tbl.innerHTML = '<div class="tk-wait">Não consegui carregar os pedidos. Tente Atualizar.</div>'; pag.innerHTML = ''; return; }
        st.last = d; paintTiles(d.contagem || cont0);
        const list = d.pedidos || [];
        tbl.innerHTML = list.length ? `<table class="tk-tbl"><thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Produto</th><th class="r">Valor</th><th>Status</th><th class="r">Repasse</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>` : `<div class="tk-wait">${st.q ? 'Nenhum pedido encontrado para essa busca.' : 'Nenhum pedido neste filtro.'}</div>`;
        fixImgs(tbl); paintPag(Number(d.total) || 0, Number(d.page) || st.page);
      });
    }
    let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { const q = inp.value.trim(); if (q === st.q) return; st.q = q; st.page = 1; load(); }, 400); };
    load();
    return el;
  }

  // ---------- 3. Produtos ----------
  function secProdutos() {
    const el = box('<div class="tk-card"><div class="tk-wait">Carregando produtos…</div></div>');
    const [s, e] = cur(), pr = prevRange();
    Promise.all([products(s, e), pr ? products(pr[0], pr[1]) : Promise.resolve(null)]).then(([d, old]) => {
      if (!d) { el.innerHTML = '<div class="tk-card"><div class="tk-wait">Não consegui carregar os produtos. Tente Atualizar.</div></div>'; return; }
      const list = (d.produtos || []).slice(), olds = (old && old.produtos) || [], oldBy = new Map(olds.map(p => [String(p.id), p]));
      const prevOk = !!old; const cmpOld = v => prevOk ? v : null;
      const units = list.reduce((a, p) => a + (p.units || 0), 0), oldUnits = olds.reduce((a, p) => a + (p.units || 0), 0);
      const champ = list.slice().sort((a, b) => (b.gmv || 0) - (a.gmv || 0))[0];
      const champOld = champ && oldBy.get(String(champ.id));
      const dates = dayList(s, e).slice(0, (list[0] && list[0].porDia && list[0].porDia.length) || 400);
      const kpis = `<div class="tk-grid tk-k3" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[
        kc('Produtos com venda', 'ph-package', num(list.length), delta(list.length, cmpOld(olds.length)), { bar: P }),
        kc('Unidades vendidas', 'ph-stack', num(units), delta(units, cmpOld(oldUnits)), { bar: CY, cy: true }),
        kc('Produto campeão', 'ph-trophy', champ ? esc(shortName(champ.title)) : '—', champ ? `<span class="tk-money">${brl(champ.gmv)}</span> · ${delta(champ.gmv, cmpOld(champOld ? champOld.gmv : 0), false, true)}` : muted('sem vendas'), { bar: P, title: champ ? champ.title : '' }),
      ].join('')}</div>`;
      el.innerHTML = kpis + `<div class="tk-card tk-mt"><div class="tk-chead" style="align-items:center;flex-wrap:wrap;margin-bottom:14px"><div><h3>Vendas por produto</h3><p class="tk-cap" style="margin:0">${num(list.length)} produtos com venda · pedidos pagos no período</p></div><select class="tk-select" aria-label="Ordenar produtos"><option value="gmv">Por valor vendido</option><option value="units">Por unidades</option><option value="pedidos">Por pedidos</option></select></div><div class="tk-pgrid"></div><div class="tk-more" style="text-align:center"></div></div>`;
      const g = el.querySelector('.tk-pgrid'), more = el.querySelector('.tk-more'), sel = el.querySelector('select');
      let lim = 20;
      const card = (p, i) => {
        const o = oldBy.get(String(p.id));
        return `<div class="tk-card" style="padding:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px">${pill('#' + (i + 1), i < 3 ? 'pp' : 'gy')}<span style="font-size:12px">${prevOk ? (o && o.gmv ? delta(p.gmv, o.gmv, false, true) : '<span class="tk-pill pk" style="font-size:11px;padding:1px 8px">novo</span>') : ''}</span></div>
          ${foto(p.img, 'big', p.title)}<b class="tk-one" title="${esc(p.title)}" style="margin-top:12px">${esc(shortName(p.title))}</b><span class="tk-mut tk-one" style="font-size:12px">${p.variacaoTop ? '+ vendida: ' + esc(p.variacaoTop) : '&nbsp;'}</span>
          <div style="margin-top:10px">${spark(dates, p.porDia || [], { w: 200, h: 34, color: i < 3 ? P : CD })}</div>
          <div class="tk-mut" style="font-size:12.5px;padding-top:8px">${num(p.units)} un · ${num(p.pedidos)} ped.</div>
          <div class="tk-push" style="display:flex;justify-content:space-between;align-items:baseline;padding-top:8px"><span class="tk-mut" style="font-size:12px">valor vendido</span><span class="tk-money" style="font-size:16px">${brl(p.gmv)}</span></div></div>`;
      };
      const paint = () => {
        const k = sel.value, arr = list.slice().sort((a, b) => (b[k] || 0) - (a[k] || 0) || (b.gmv || 0) - (a.gmv || 0));
        g.innerHTML = arr.length ? arr.slice(0, lim).map(card).join('') : '<p class="tk-cap">Nenhum produto vendido no período.</p>'; fixImgs(g);
        more.innerHTML = arr.length > lim ? `<button type="button" class="tk-btn ghost sm" style="margin-top:16px">Ver mais (${num(arr.length - lim)})</button>` : '';
        const b = more.querySelector('button'); if (b) b.onclick = () => { lim += 20; paint(); };
      };
      sel.onchange = () => { lim = 20; paint(); };
      paint();
    });
    return el;
  }

  // ---------- 4. Devoluções ----------
  function secDevolucoes(data) {
    const dv = data.devolucoes || {}, n0 = dv.n || 0;
    const taxa = data.paid > 0 ? n0 / data.paid * 100 : 0;
    const taxaOld = prevOv === undefined ? undefined : (prevOv && prevOv.paid > 0 ? ((prevOv.devolucoes && prevOv.devolucoes.n) || 0) / prevOv.paid * 100 : 0);
    const andamento = (data.devStatus || []).reduce((a, s) => a + (dst(s.status)[3] ? s.n || 0 : 0), 0);
    const kpis = `<div class="tk-grid tk-k4" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[
      kc('Devoluções', 'ph-arrow-u-up-left', num(n0), delta(n0, pv(p => p.devolucoes && p.devolucoes.n), true), { bar: P }),
      kc('Taxa de devolução', 'ph-percent', pct(taxa, 2), delta(taxa, taxaOld, true), { bar: CY, cy: true }),
      kc('Valor devolvido', 'ph-currency-circle-dollar', brl(dv.valor), delta(dv.valor || 0, pv(p => p.devolucoes && p.devolucoes.valor), true), { bar: P }),
      kc('Em andamento', 'ph-hourglass', num(andamento), muted('aguardando conclusão'), { bar: CY, cy: true }),
    ].join('')}</div>`;
    const mot = {}; for (const m of data.devMotivos || []) { const k = motivo(m.reason); mot[k] = (mot[k] || 0) + (m.n || 0); }
    const motList = Object.entries(mot).sort((a, b) => b[1] - a[1]);
    const motTot = motList.reduce((a, x) => a + x[1], 0);
    const motivos = `<div class="tk-card">${chead('Motivos', num(motTot) + ' devoluções com motivo informado')}<div class="tk-fill">${motList.length ? `<div>${hbars(motList.map(([k, v], i) => [k, v, i === 0 ? P : i < 3 ? '#ff7a93' : '#ffc2cf']), 170)}</div>` : '<p class="tk-cap">Sem devoluções no período.</p>'}<div class="tk-note" style="margin-top:12px"><i class="ph ph-info"></i><span>Taxa de devolução = devoluções ÷ pedidos pagos (${num(data.paid)})</span></div></div></div>`;
    const stl = {}; for (const s of data.devStatus || []) { const [l, , c] = dst(s.status); stl[l] = stl[l] || [l, 0, c]; stl[l][1] += s.n || 0; }
    const stList = Object.values(stl).sort((a, b) => b[1] - a[1]);
    const stTot = stList.reduce((a, x) => a + x[1], 0);
    const status = `<div class="tk-card">${chead('Por status', 'Situação das ' + num(stTot) + ' devoluções')}${stList.length ? `<div class="tk-fill" style="flex-direction:row;align-items:center;gap:18px;justify-content:flex-start">${donut(stList, 'devoluções', 140)}<div style="flex:1;min-width:0">${legend(stList)}</div></div>` : '<p class="tk-cap">Sem devoluções no período.</p>'}</div>`;
    const lst = (data.devList || []).slice();
    const cntBy = l => lst.filter(d => dst(d.status)[0] === l).length;
    const chips = ['Todas', ...[...new Set(lst.map(d => dst(d.status)[0]))].sort((a, b) => cntBy(b) - cntBy(a))];
    const el = box(kpis + grid('minmax(0,1fr) minmax(0,1fr)', [motivos, status], 'tk-cols') + `<div class="tk-card tk-mt">${chead('Devoluções', 'Últimas ' + num(lst.length) + ' solicitações do período')}<div class="tk-chead" style="align-items:center;flex-wrap:wrap;margin-bottom:12px"><div class="tk-chips">${chips.map((c, i) => `<button type="button" class="tk-chip${i ? '' : ' on'}" data-c="${esc(c)}">${esc(c)}${i ? ' · ' + num(lst.filter(d => dst(d.status)[0] === c).length) : ''}</button>`).join('')}</div><label class="tk-search"><i class="ph ph-magnifying-glass"></i><input type="search" placeholder="Buscar pedido ou produto" aria-label="Buscar pedido ou produto"></label></div><div class="tk-scroll tk-dtbl"></div></div>`);
    const tb = el.querySelector('.tk-dtbl'), inp = el.querySelector('input'); let chip = 'Todas';
    const paint = () => {
      const q = inp.value.trim().toLowerCase();
      const arr = lst.filter(d => (chip === 'Todas' || dst(d.status)[0] === chip) && (!q || String(d.order_id).includes(q) || String(d.produto || '').toLowerCase().includes(q) || motivo(d.reason).toLowerCase().includes(q)));
      tb.innerHTML = arr.length ? `<table class="tk-tbl"><thead><tr><th>Produto</th><th>Pedido</th><th>Motivo</th><th class="r">Valor</th><th>Status</th></tr></thead><tbody>${arr.map(d => { const [l, c] = dst(d.status); const m = motivo(d.reason); return `<tr><td><span class="tk-pn">${foto(d.img)}${pname(d.produto, 300, [d.variacao, d.dt].filter(Boolean).map(esc).join(' · '))}</span></td><td class="nw" style="font-size:12.5px">${esc(d.order_id)}</td><td class="nw" title="${esc(d.reason || '')}">${esc(m)}</td><td class="r"><b>${brl(d.refund)}</b></td><td>${pill(l, c)}</td></tr>`; }).join('')}</tbody></table>` : '<div class="tk-wait">Nenhuma devolução neste filtro.</div>';
      fixImgs(tb);
    };
    el.querySelectorAll('.tk-chip').forEach(b => b.onclick = () => { chip = b.dataset.c; el.querySelectorAll('.tk-chip').forEach(x => x.classList.toggle('on', x === b)); paint(); });
    inp.oninput = paint; paint();
    return el;
  }

  // ---------- 5. Financeiro ----------
  function secFinanceiro(data) {
    const f = data.financeiro;
    if (!f) return box('<div class="tk-card"><div class="tk-wait">Sem dados financeiros para o período.</div></div>');
    const est = f.aReceberEstimado || {}, conf = f.aReceberConfirmado || {}, ex = f.extratos || {}, det = ex.detalhe || {};
    const aRec = est.total || 0;
    const hero = `<div class="tk-dark" style="padding:18px 22px;gap:10px"><i class="tk-acc"></i><div class="tk-dark-h"><span class="tk-logo"></span>A receber (estimado)</div><div class="tk-dark-v" style="margin:0;font-size:clamp(24px,2.3vw,32px)" title="${esc(brl(aRec))}">${brl(aRec)}</div>
      <div><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px"><span style="color:#cbd5e1">Já confirmado pelo TikTok</span><b>${brl(conf.v)}</b></div><span class="tk-prog" style="background:#ffffff1a"><i style="width:${aRec > 0 ? Math.min(100, (conf.v || 0) / aRec * 100) : 0}%;background:linear-gradient(90deg,${CD},${CY})"></i></span><div style="font-size:12px;color:#9ca3af;margin-top:6px">${num((est.entregue && est.entregue.n || 0) + (est.transito && est.transito.n || 0) + (est.aguardando && est.aguardando.n || 0))} pedidos pagos ainda não liquidados</div></div></div>`;
    const kpis = `<div class="tk-grid tk-fin">${hero}${[
      kc('Caiu na conta', 'ph-bank', brl(f.recebido), delta(f.recebido, pv(p => p.financeiro && p.financeiro.recebido)), { bar: P, money: true }),
      kc('Depósitos', 'ph-arrows-down-up', num(f.depositos), muted('no período'), { bar: CY, cy: true }),
      kc('Taxa média de repasse', 'ph-percent', pct(f.taxaRepasse || 0), delta(f.taxaRepasse || 0, pv(p => p.financeiro && p.financeiro.taxaRepasse)), { bar: P }),
    ].join('')}</div>`;
    // cascata do bruto ao líquido
    let steps, capW;
    if ((det.nDetalhados || 0) > 0) {
      const base = (ex.bruto || 0) - (det.comTiktok || 0) - (det.comAfiliados || 0) - (det.outras || 0) - (det.frete || 0);
      const aj = (ex.repasse || 0) - base; // ajustes + qualquer diferença de extratos sem detalhe
      steps = [['Bruto', ex.bruto || 0, 't'], ['Com. TikTok', -(det.comTiktok || 0)], ['Com. afiliados', -(det.comAfiliados || 0)], ['Outras taxas', -(det.outras || 0)], ['Frete', -(det.frete || 0)], ['Ajustes', aj], ['Líquido', ex.repasse || 0, 't']];
      capW = 'Extratos do período · ' + num(det.nDetalhados) + ' de ' + num(det.n) + ' com detalhe das taxas';
    } else {
      const aj = (ex.repasse || 0) - ((ex.bruto || 0) - (ex.taxas || 0));
      steps = [['Bruto', ex.bruto || 0, 't'], ['Taxas', -(ex.taxas || 0)], ...(aj ? [['Ajustes', aj]] : []), ['Líquido', ex.repasse || 0, 't']];
      capW = 'Extratos do período · sem detalhe das taxas';
    }
    const wf = `<div class="tk-card">${chead('Do bruto ao líquido', capW)}<div class="tk-push">${ex.bruto ? waterfall(steps, { h: 380 }) : '<p class="tk-cap">Sem extratos no período.</p>'}</div></div>`;
    const cair = [['Entregues', 'cai nos próximos dias', est.entregue, GREEN], ['Em trânsito', 'cai depois da entrega', est.transito, CD], ['Aguardando envio', 'depois de enviar e entregar', est.aguardando, AMBER]].sort((a, b) => ((b[2] && b[2].v) || 0) - ((a[2] && a[2].v) || 0));
    const quando = `<div class="tk-card">${chead('Quando vai cair', 'O TikTok paga todo dia · o repasse sai depois da entrega')}<div class="tk-fill">${cair.map(([l, q, g, c]) => `<div style="padding:12px 0;border-bottom:1px solid #f3f4f6"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><span style="display:flex;gap:8px;align-items:center;min-width:0">${legendDot(c)}<b class="tk-one">${l}</b></span><b class="tk-money">${brl(g && g.v)}</b></div><div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--mut);margin:3px 0 6px 18px"><span>${q}</span><span>${num(g && g.n)} pedidos</span></div><span class="tk-prog" style="height:6px;margin-left:18px"><i style="width:${aRec > 0 ? ((g && g.v) || 0) / aRec * 100 : 0}%;background:${c}"></i></span></div>`).join('')}
      <div class="tk-kv" style="font-size:14.5px"><span><b>Total a receber</b></span><b class="tk-money">${brl(aRec)}</b></div>
      <p class="tk-cap" style="margin:4px 0 0">Estimativa = valor dos pedidos × taxa média de repasse dos últimos 30 dias (${pct(f.taxaRepasse || 0)}).${conf.v > 0 ? ' Já confirmado: ' + brl(conf.v) + (conf.desde ? ' desde ' + esc(conf.desde) : '') + '.' : ''}</p></div></div>`;
    const dep = seriesOf(f.recebidoPorDia);
    const depCard = `<div class="tk-card">${chead('Depósitos por dia', num(f.depositos) + ' depósitos · ' + brl(f.recebido) + ' caiu na conta')}<div class="tk-push">${barChart(dep.dates, dep.vals, { w: 1300, h: 240, color: CD, name: 'Depósito' })}</div></div>`;
    const lista = f.lista || [];
    const cell = (r, k) => r.detalhado ? `<td class="r tk-red">− ${brl(r[k])}</td>` : '<td class="r tk-mut">—</td>';
    const extr = `<div class="tk-card tk-mt"><div class="tk-chead" style="flex-wrap:wrap"><div><h3>Extratos</h3><p class="tk-cap">Liquidações do TikTok por dia · ${num(lista.length)} extratos</p></div><button type="button" class="tk-btn ghost sm tk-csv"${lista.length ? '' : ' disabled'}><i class="ph ph-download-simple"></i>Exportar CSV</button></div>
      ${lista.length ? `<div class="tk-scroll"><table class="tk-tbl"><thead><tr><th>Data</th><th class="r">Valor bruto</th><th class="r">Comissão TikTok</th><th class="r">Comissão afiliados</th><th class="r">Frete</th><th class="r">Outras taxas</th><th class="r">Líquido</th><th>Status</th></tr></thead><tbody>${lista.map(r => `<tr><td class="nw"><b>${esc(noYear(r.dt))}</b></td><td class="r">${brl(r.bruto)}</td>${cell(r, 'comTiktok')}${cell(r, 'comAfiliados')}${cell(r, 'frete')}${r.detalhado ? cell(r, 'outras') : `<td class="r tk-red">− ${brl(r.taxas)}</td>`}<td class="r tk-money">${brl(r.liquido)}</td><td>${r.status === 'PAID' ? pill('Pago', 'g') : pill('Pendente', 'am')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="tk-cap">Sem extratos no período.</p>'}</div>`;
    const el = box(kpis + grid('minmax(0,1.7fr) minmax(0,1fr)', [wf, quando], 'tk-cols') + `<div class="tk-mt">${depCard}</div>` + extr);
    const b = el.querySelector('.tk-csv');
    if (b) b.onclick = () => { const [s, e] = cur(); downloadCsv('tiktok-extratos-' + (s || '') + '_' + (e || '') + '.csv', [['Data', 'Valor bruto', 'Comissão TikTok', 'Comissão afiliados', 'Frete', 'Outras taxas', 'Taxas (total)', 'Líquido', 'Status'], ...lista.map(r => [r.dt, csvMoney(r.bruto), r.detalhado ? csvMoney(r.comTiktok) : '', r.detalhado ? csvMoney(r.comAfiliados) : '', r.detalhado ? csvMoney(r.frete) : '', r.detalhado ? csvMoney(r.outras) : '', csvMoney(r.taxas), csvMoney(r.liquido), r.status === 'PAID' ? 'Pago' : 'Pendente'])]); };
    return el;
  }

  // ---------- 6. Estoque ----------
  function secEstoque(data) {
    const s = data.estoque;
    if (!s) return box('<div class="tk-card"><div class="tk-wait">Sem dados de estoque.</div></div>');
    const all = alertasEstoque(s), nEsg = all.filter(x => !(x.qty > 0)).length, nAc = all.length - nEsg;
    const kpis = `<div class="tk-grid tk-k4" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[
      kc('Variações ativas', 'ph-stack', num(s.skus), muted('produtos × cores/modelos'), { bar: P }),
      kc('Esgotados que vendem', 'ph-warning-circle', `<span class="tk-red">${num(s.nEsgotadosVendendo)}</span>`, muted('venderam nos últimos 30 dias'), { bar: CY, cy: true }),
      kc('Acabando (até 10 dias)', 'ph-hourglass-low', num(s.nCriticos), muted('no ritmo atual de vendas'), { bar: P }),
      kc('Sem estoque (total)', 'ph-prohibit', num(s.semEstoque), muted('variações zeradas'), { bar: CY, cy: true }),
    ].join('')}</div>`;
    const top5 = all.slice(0, 5);
    const repor = `<div class="tk-card tk-mt"><div class="tk-chead"><div><h3>Repor primeiro</h3><p class="tk-cap">As ${num(top5.length)} variações que mais vendem entre esgotadas e acabando</p></div><button type="button" class="tk-btn sm tk-csv"${all.length ? '' : ' disabled'}><i class="ph ph-download-simple"></i>Exportar lista</button></div>
      ${top5.length ? `<div class="tk-grid tk-r5" style="grid-template-columns:repeat(5,minmax(0,1fr));gap:12px">${top5.map((x, i) => `<div style="border:1px solid var(--ln);border-radius:12px;padding:12px;min-width:0;display:flex;flex-direction:column"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="color:${i < 3 ? P : '#9ca3af'};font-size:18px">${i + 1}</b>${estPill(x)}</div>${foto(x.img, 'big', x.title).replace('class="tk-foto big"', 'class="tk-foto big" style="height:96px"')}<span style="min-width:0;margin-top:8px"><b class="tk-one" title="${esc(x.title)}" style="font-size:13px">${esc(shortName(x.title))}</b><span class="tk-mut tk-one" style="font-size:12px">${esc(x.variacao || '—')} · vende ${vendeDia(x)}/dia</span></span></div>`).join('')}</div>` : '<p class="tk-cap">Nenhuma variação precisando de reposição agora.</p>'}</div>`;
    const tabela = `<div class="tk-card tk-mt"><div class="tk-chead" style="align-items:center;flex-wrap:wrap;margin-bottom:12px"><div><h3>Alertas de estoque</h3><p class="tk-cap" style="margin:0">Esgotados que vendem e variações acabando · dias = estoque ÷ média diária dos últimos 30 dias</p></div><div class="tk-chips"><button type="button" class="tk-chip on" data-f="">Todos · ${num(all.length)}</button><button type="button" class="tk-chip" data-f="e">Esgotado · ${num(nEsg)}</button><button type="button" class="tk-chip" data-f="a">Acabando · ${num(nAc)}</button></div></div><div class="tk-scroll tk-etbl"></div></div>`;
    const el = box(kpis + repor + tabela);
    const tb = el.querySelector('.tk-etbl'); let flt = '';
    const paint = () => {
      const arr = all.filter(x => !flt || (flt === 'e' ? !(x.qty > 0) : x.qty > 0));
      tb.innerHTML = arr.length ? `<table class="tk-tbl"><thead><tr><th>Produto</th><th>Variação</th><th class="r">Em estoque</th><th class="r">Vende por dia</th><th>Acaba em</th><th>Status</th></tr></thead><tbody>${arr.map(x => { const esg = !(x.qty > 0), w = esg ? 100 : Math.max(8, Math.min(100, (x.dias || 0) / 10 * 100)); return `<tr><td><span class="tk-pn">${foto(x.img)}${pname(x.title, 300, esc(x.seller_sku || x.sku || ''))}</span></td><td class="nw">${esc(x.variacao || '—')}</td><td class="r"><b${esg ? ' class="tk-red"' : ''}>${num(x.qty)}</b></td><td class="r">${vendeDia(x)}</td><td style="min-width:120px"><span style="font-size:12.5px;font-weight:600">${esg ? '—' : diasTxt(x)}</span><span class="tk-prog" style="height:6px;margin-top:5px;width:110px"><i style="width:${w}%;background:${esg ? '#fca5a5' : (x.dias <= 3 ? RED : AMBER)}"></i></span></td><td>${esg ? pill('Esgotado', 'rd') : pill('Acabando', 'am')}</td></tr>`; }).join('')}</tbody></table>` : '<div class="tk-wait">Nenhuma variação neste filtro.</div>';
      fixImgs(tb);
    };
    el.querySelectorAll('.tk-chip').forEach(b => b.onclick = () => { flt = b.dataset.f; el.querySelectorAll('.tk-chip').forEach(x => x.classList.toggle('on', x === b)); paint(); });
    const b = el.querySelector('.tk-csv');
    if (b) b.onclick = () => downloadCsv('tiktok-repor-estoque.csv', [['Produto', 'SKU do vendedor', 'Variação', 'Em estoque', 'Vendas 30 dias', 'Vende por dia', 'Acaba em (dias)', 'Situação'], ...all.map(x => [x.title, x.seller_sku || '', (x.variacao || '').trim(), x.qty || 0, x.u30 || 0, vendeDia(x), x.qty > 0 ? String(x.dias).replace('.', ',') : 0, x.qty > 0 ? 'Acabando' : 'Esgotado'])]);
    paint();
    return el;
  }

  // ---------- 7/8. seções que usam o Analytics (insights) ----------
  function asyncSection(build) {
    const el = box('<div class="tk-card"><div class="tk-wait">Carregando dados do TikTok Shop…</div></div>');
    const [s, e] = cur(), pr = prevRange();
    Promise.all([insights(s, e), pr ? insights(pr[0], pr[1]) : Promise.resolve(null)]).then(([d, old]) => {
      if (!d) { el.innerHTML = '<div class="tk-card"><div class="tk-wait">Não consegui carregar agora. Tente Atualizar.</div></div>'; return; }
      el.replaceChildren(); build(el, d, old || null); fixImgs(el);
    });
    return el;
  }
  const compradores = sh => (sh && sh.buyers) || 0;
  function secDesempenho() {
    return asyncSection((el, d, old) => {
      const s = d.shop, o = old && old.shop;
      if (!s) { el.innerHTML = `<div class="tk-card"><div class="tk-wait">Analytics indisponível para o período.${d.erro ? ' (' + esc(d.erro) + ')' : ''}</div></div>`; return; }
      const vis = d.porDiaVisitas || {}, oVis = (old && old.porDiaVisitas) || {};
      const buyers = compradores(s) || Object.values(vis).reduce((a, x) => a + (x.compradores || 0), 0);
      const oBuyers = o ? (compradores(o) || Object.values(oVis).reduce((a, x) => a + (x.compradores || 0), 0)) : null;
      const vDays = Object.keys(vis).sort(), lastWith = vDays.filter(k => (vis[k].visitantes || 0) > 0).pop();
      const ate = [d.disponivelAte, lastWith].filter(Boolean).sort().pop();
      const cmp = (c, oldV, inv) => delta(c, o ? oldV : null, inv, true);
      const M = [
        ['Visitantes por dia', 'ph-users', num(s.visitors), cmp(s.visitors, o && o.visitors)],
        ['Visualizações de produto', 'ph-eye', num(s.pageViews), cmp(s.pageViews, o && o.pageViews)],
        ['Exibições', 'ph-monitor-play', num(s.impressions), cmp(s.impressions, o && o.impressions)],
        ['Compradores', 'ph-user-check', buyers ? num(buyers) : '—', buyers ? cmp(buyers, oBuyers) : muted('não informado')],
        ['Pedidos', 'ph-receipt', num(s.orders), cmp(s.orders, o && o.orders)],
        ['Taxa de conversão', 'ph-funnel', pct(s.conversao || 0, 2), cmp(s.conversao || 0, o && o.conversao)],
        ['GMV', 'ph-currency-circle-dollar', brl(s.gmv), cmp(s.gmv, o && o.gmv)],
        ['Unidades', 'ph-stack', num(s.units), cmp(s.units, o && o.units)],
        ['Reembolsos', 'ph-arrow-u-up-left', brl(s.refunds), cmp(s.refunds, o && o.refunds, true)],
      ];
      const [ps, pe] = cur();
      const mgrid = `<div class="tk-card">${chead('Métricas da loja', 'Analytics do TikTok · ' + (ps && pe ? ddmm(ps) + ' – ' + ddmm(pe) : 'período'))}<div class="tk-fill"><div class="tk-mgrid">${M.map(([a, ic, b, dl]) => `<div><div class="tk-lbl" style="display:flex;gap:6px;align-items:center"><i class="ph ${ic}" style="color:var(--p)"></i><span class="tk-one">${a}</span></div><div class="v" title="${esc(b)}">${b}</div><div style="font-size:12.5px">${dl}</div></div>`).join('')}</div></div></div>`;
      const fun = [['Exibições', s.impressions, K], ['Visualizações de produto', s.pageViews, '#3b3d4a'], ...(buyers ? [['Compradores', buyers, CD]] : []), ['Pedidos', s.orders, P]];
      const widths = fun.length === 4 ? [100, 76, 54, 40] : [100, 70, 44];
      const funil = `<div class="tk-card">${chead('Funil', fun.map(x => x[0].replace(' de produto', '')).join(' → '))}<div class="tk-fill"><div class="tk-funnel">${fun.map(([l, v, c], i) => `<div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>${l}</span><b>${num(v)}</b></div><div class="bar" style="width:${widths[i]}%;background:${c}">${i ? (fun[i - 1][1] ? pct(v / fun[i - 1][1] * 100, v / fun[i - 1][1] < .1 ? 2 : 1) : '—') + ' da etapa anterior' : '100%'}</div></div>`).join('')}</div>
        <div class="tk-kv" style="border-top:1px solid #f3f4f6;margin-top:12px;padding-top:12px"><span>Taxa de conversão <span class="tk-mut" style="font-size:12px">(pedidos ÷ visualizações)</span></span><b style="color:var(--p3)">${pct(s.conversao || 0, 2)}</b></div>${buyers ? '' : '<p class="tk-cap" style="margin:6px 0 0">O TikTok não informou compradores únicos neste período.</p>'}</div></div>`;
      const visDates = vDays.filter(k => !lastWith || k <= lastWith);
      const visCard = `<div class="tk-card tk-mt">${chead('Visitantes e pedidos por dia', 'Barras = visitantes (eixo esq.) · linha = pedidos (eixo dir.)', `<span class="tk-legend"><span>${legendDot(CY)}Visitantes</span><span><i style="width:14px;height:3px;border-radius:3px;background:${P};display:inline-block"></i>Pedidos</span></span>`)}<div class="tk-push">${comboChart(visDates, visDates.map(k => vis[k].visitantes || 0), visDates.map(k => vis[k].pedidos || 0), { w: 1300, h: 280 })}</div></div>`;
      const gp = s.gmvPor || {}, vp = s.viewsPor || {}, ip = s.imprPor || {}, gt = Math.max(1, (gp.VIDEO || 0) + (gp.LIVE || 0) + (gp.PRODUCT_CARD || 0));
      const fontes = [['VIDEO', 'Vídeos', P, 'ph-video-camera'], ['PRODUCT_CARD', 'Vitrine / cartão do produto', CD, 'ph-storefront'], ['LIVE', 'LIVE', '#3b3d4a', 'ph-broadcast']].sort((a, b) => (gp[b[0]] || 0) - (gp[a[0]] || 0));
      const fcards = `<div class="tk-grid tk-mt tk-k3" style="grid-template-columns:repeat(3,minmax(0,1fr))">${fontes.map(([k, l, c, ic]) => { const g = (gp[k] || 0) / gt * 100; return `<div class="tk-card"><div style="display:flex;align-items:center;gap:10px;min-width:0"><span class="tk-ico" style="background:${c}1f;color:${c}"><i class="ph ${ic}"></i></span><b class="tk-one">${l}</b><span class="tk-lbl" style="margin-left:auto">GMV</span></div><div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:10px 0 4px"><span style="font-size:26px;font-weight:700">${pct(g)}</span><b class="tk-money">${brl(gp[k])}</b></div><span class="tk-prog" style="height:6px"><i style="width:${g}%;background:${c}"></i></span><div class="tk-kv" style="margin-top:8px"><span class="tk-mut">Visualizações</span><b>${num(vp[k])}</b></div><div class="tk-kv"><span class="tk-mut">Exibições</span><b>${num(ip[k])}</b></div></div>`; }).join('')}</div>`;
      const note = `<div class="tk-note" style="margin-bottom:16px"><i class="ph ph-info" style="color:var(--c2);font-size:16px"></i><span>Dados do Analytics disponíveis até <b>${ate ? ddmm(ate) : '—'}</b> · o TikTok atualiza as métricas de tráfego com atraso. De onde vêm as vendas: ordenado do maior para o menor.</span></div>`;
      el.innerHTML = note + grid('minmax(0,1.5fr) minmax(0,1fr)', [mgrid, funil], 'tk-cols', false) + visCard + fcards;
    });
  }
  function secVideos() {
    return asyncSection((box2, d, old) => {
      const a = (d.afiliados && d.afiliados.total) || {}, oa = old && old.afiliados && old.afiliados.total;
      const cmp = (c, v, inv) => delta(c, old ? (v || 0) : null, inv);
      const kp = n('div', 'tk-grid tk-k4'); kp.style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))';
      kp.innerHTML = [
        kc('Vendas por vídeos', 'ph-video-camera', brl(d.shop && d.shop.gmvPor && d.shop.gmvPor.VIDEO), cmp(d.shop && d.shop.gmvPor && d.shop.gmvPor.VIDEO, old && old.shop && old.shop.gmvPor && old.shop.gmvPor.VIDEO), { bar: P, money: true }),
        kc('Vendas via criadores', 'ph-currency-circle-dollar', brl(a.gmv), cmp(a.gmv, oa && oa.gmv), { bar: CY, cy: true, money: true }),
        kc('Comissão de afiliados', 'ph-hand-coins', brl(a.comissao), a.gmv ? muted(pct(a.comissao / a.gmv * 100) + ' das vendas deles') : muted('—'), { bar: P }),
        kc('Criadores que venderam', 'ph-users-three', num(a.criadores), cmp(a.criadores, oa && oa.criadores), { bar: CY, cy: true }),
      ].join('');
      box2.append(kp);
      const todos = (d.afiliados && d.afiliados.criadores) || [];
      const cp = n('section', 'shp-panel'); cp.style.marginTop = '16px';
      const hd = n('div', 'tk-chead'); hd.style.cssText = 'align-items:center;flex-wrap:wrap;margin-bottom:12px';
      const ht = n('div'); ht.innerHTML = '<h3 style="margin:0 0 2px;font-size:15px">Ranking de criadores</h3><p class="tk-cap" style="margin:0">Por dinheiro gerado · clique para ver os vídeos que mais venderam de cada um</p>';
      hd.append(ht); cp.append(hd);
      if (!todos.length) { cp.append(n('p', 'tk-cap', 'Sem vendas de afiliados no período.')); box2.append(cp); return; }
      const tools = n('div'); tools.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      const sb2 = n('label', 'tk-search'); sb2.style.minWidth = '200px'; sb2.innerHTML = '<i class="ph ph-magnifying-glass"></i>';
      const busca = n('input'); busca.type = 'search'; busca.placeholder = 'Buscar criador (@usuario)'; busca.setAttribute('aria-label', 'Buscar criador'); sb2.append(busca);
      const ord = n('select', 'tk-select'); ord.setAttribute('aria-label', 'Ordenar criadores');
      for (const [v2, l] of [['gmv', 'Mais dinheiro gerado'], ['pedidos', 'Mais pedidos'], ['comissao', 'Maior comissão'], ['seguidores', 'Mais seguidores']]) { const o = n('option', '', l); o.value = v2; ord.append(o); }
      tools.append(sb2, ord, n('span', 'tk-mut', num(todos.length) + ' criadores')); hd.append(tools);
      const gridEl = n('div', 'ttk-rk2'); const esq = n('div'); const det = n('aside', 'ttk-det'); gridEl.append(esq, det); cp.append(gridEl);
      const tbl = n('div', 'ttk-tbl'); const listaEl = n('div'); esq.append(tbl);
      const th = n('div', 'ttk-tr th'); th.append(n('span', '', '#'), n('span', '', 'Criador'), n('span', 'num hide-sm', 'Seguidores'), n('span', 'num hide-sm', 'Pedidos'), n('span', 'num hide-sm hide-lg', 'Comissão'), n('span', 'num', 'Dinheiro gerado'), n('span'));
      tbl.append(th, listaEl);
      const rankPos = new Map(todos.map((c, i) => [c.user, i + 1]));
      const cacheV = {};
      const avatar = (c) => {
        const ini = n('span', 'ttk-av2', (c.user || '?').slice(0, 2));
        if (!safeUrl(c.avatar)) return ini;
        const im = n('img', 'ttk-av2'); im.src = c.avatar; im.alt = ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; im.onerror = () => im.replaceWith(ini); return im;
      };
      const crown = (p) => { const i = n('i', 'ph-fill ph-crown'); i.style.color = ['#f5b301', '#9ca3af', '#c2703d'][p - 1]; return i; };
      const segs = (v) => v == null ? '—' : (v >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : v >= 1e3 ? (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : num(v));
      let limite = 20, atual = null;
      const pintar = () => {
        const q = busca.value.trim().toLowerCase().replace(/^@/, '');
        const arr = todos.filter((c) => !q || String(c.user).toLowerCase().includes(q) || String(c.nome || '').toLowerCase().includes(q)).sort((x, y) => (y[ord.value] || 0) - (x[ord.value] || 0));
        listaEl.replaceChildren();
        arr.slice(0, limite).forEach((c, i) => listaEl.append(criadorRow(c, i)));
        if (!arr.length) listaEl.append(n('p', 'tk-wait', 'Nenhum criador encontrado.'));
        if (arr.length > limite) { const bt = n('button', 'tk-btn ghost sm', 'Ver mais (' + num(arr.length - limite) + ')'); bt.type = 'button'; bt.style.cssText = 'margin:12px auto;display:flex'; bt.onclick = () => { limite += 40; pintar(); }; listaEl.append(bt); }
      };
      busca.oninput = () => { limite = 20; pintar(); }; ord.onchange = () => { limite = 20; pintar(); };
      function criadorRow(c, i) {
        const row = n('div', 'ttk-tr rw' + (atual === c.user ? ' sel' : '')); row.dataset.user = c.user; row.title = 'Ver os vídeos que mais venderam de @' + c.user;
        const p = i + 1; const pos = n('span', 'pos' + (p <= 3 ? ' top' : '')); pos.append(String(p)); if (p <= 3) pos.append(crown(p));
        const who = n('div', 'who'); const tx = n('div'); tx.style.minWidth = '0'; tx.append(n('b', '', c.nome || c.user), n('span', '', '@' + c.user));
        who.append(avatar(c), tx);
        row.append(pos, who, n('span', 'num hide-sm', segs(c.seguidores)), n('span', 'num hide-sm', num(c.pedidos)), n('span', 'num hide-sm hide-lg', brl(c.comissao)), n('span', 'money', brl(c.gmv)), n('span', 'go', '›'));
        row.onclick = () => { abrir(c); if (window.innerWidth <= 980) det.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
        return row;
      }
      function abrir(c) {
        atual = c.user;
        listaEl.querySelectorAll('.ttk-tr.rw').forEach((r) => r.classList.toggle('sel', r.dataset.user === c.user));
        det.replaceChildren();
        const back = n('button', 'back', '← Voltar para o ranking'); back.type = 'button'; back.onclick = () => tbl.scrollIntoView({ behavior: 'smooth', block: 'start' }); det.append(back);
        const pf = n('div', 'pf'); const av = n('span', 'avw'); av.append(avatar(c)); if (!safeUrl(c.avatar)) av.firstChild.style.cssText = 'width:76px;height:76px;font-size:1.5rem'; const rp = rankPos.get(c.user) || 0;
        if (rp && rp <= 3) { const cr = n('span', 'crown'); cr.append(crown(rp)); av.append(cr); }
        const nm = n('div'); nm.style.minWidth = '0'; const lk = n('a', '', '@' + c.user + ' ↗'); lk.href = 'https://www.tiktok.com/@' + encodeURIComponent(c.user); lk.target = '_blank'; lk.rel = 'noopener noreferrer';
        nm.append(n('h4', '', c.nome || c.user), lk, n('div', 'tk-cap', [rp ? rp + 'º no ranking' : '', c.seguidores != null ? segs(c.seguidores) + ' seguidores' : ''].filter(Boolean).join(' · '))); nm.lastChild.style.margin = '2px 0 0'; pf.append(av, nm); det.append(pf);
        const st = n('div', 'st'); const cel = (v, l, cls) => { const d2 = n('div', cls || ''); d2.append(n('span', '', l), n('b', '', v)); return d2; };
        st.append(cel(num(c.pedidos), 'Pedidos'), cel(brl(c.comissao), 'Comissão'), cel(brl(c.gmv), 'Dinheiro gerado', 'gv')); det.append(st);
        const vh = n('div', 'vh'); const cnt = n('span', '', ''); vh.append(n('h5', '', 'Vídeos do criador'), cnt); det.append(vh);
        const vl = n('div', 'ttk-vl'); vl.append(n('p', 'tk-cap', 'Carregando vídeos…')); det.append(vl);
        const [s1, e1] = cur(); const key = c.user + '|' + s1 + '|' + e1;
        const pr = cacheV[key] || (cacheV[key] = authGet('/api/tiktok/creator-videos?' + new URLSearchParams({ creator: c.user, start: s1, end: e1 })).catch(() => null));
        pr.then((r) => {
          if (atual !== c.user) return;
          vl.replaceChildren();
          const vids = ((r && r.videos) || []).slice().sort((x, y) => (y.gmv || 0) - (x.gmv || 0));
          cnt.textContent = num(vids.length) + (vids.length === 1 ? ' vídeo' : ' vídeos');
          if (!vids.length) { vl.append(n('p', 'tk-cap', r ? 'Nenhuma venda paga deste criador no período.' : 'Não consegui carregar os vídeos. Tente de novo.')); if (!r) delete cacheV[key]; return; }
          vids.forEach((v) => {
            const it = n('a', 'ttk-vr'); const u = safeUrl(v.url); if (u) { it.href = u; it.target = '_blank'; it.rel = 'noopener noreferrer'; }
            const tb = n('div', 'th'); if (safeUrl(v.img)) { const im = n('img'); im.src = v.img; im.alt = ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; im.onerror = () => im.remove(); tb.append(im); }
            const live = v.tipo === 'LIVE'; const tag = n('i', '', live ? 'LIVE' : 'VÍDEO'); tag.style.background = live ? CY : P; tag.style.color = live ? K : '#fff'; tb.append(tag);
            const tx = n('div', 'tx'); const tt = n('b', '', shortName(v.produto)); tt.title = v.produto || ''; tx.append(tt, n('span', '', v.periodo ? 'vendas em ' + v.periodo : ''));
            const bx = n('div', 'bx'); const l1 = n('div'); l1.append(n('span', 'tk-mut', 'Pedidos'), n('b', '', num(v.pedidos))); const l2 = n('div'); l2.append(n('span', 'tk-mut', 'Vendas'), n('span', 'g', brl(v.gmv)));
            bx.append(l1, l2); it.append(tb, tx, bx); vl.append(it);
          });
        });
      }
      pintar();
      abrir(todos.slice().sort((x, y) => (y.gmv || 0) - (x.gmv || 0))[0]);
      box2.append(cp);
    });
  }

  // ---------- 9. Atendimento ----------
  function msgParse(m) { try { return JSON.parse(m.content || '{}') || {}; } catch (e) { return { content: String(m.content || '') }; } }
  const TYPE_LABEL = { PRODUCT_CARD: 'Produto enviado', ORDER_CARD: 'Pedido enviado', VIDEO: 'Vídeo', EMOTICONS: 'Figurinha', COUPON_CARD: 'Cupom', LOGISTICS_CARD: 'Rastreio', RETURN_REFUND_CARD: 'Devolução/Reembolso', ALLOCATED_SERVICE: 'Atendimento transferido', NOTIFICATION: 'Aviso' };
  function msgText(m) { const c = msgParse(m); if (m.type === 'TEXT' || c.content) return c.content || c.text || ''; if (m.type === 'IMAGE') return '📷 Foto'; return TYPE_LABEL[m.type] || ''; }
  // conteúdo da bolha: texto, foto (IMAGE) ou cartão
  function msgNode(m) {
    const c = msgParse(m);
    if (m.type === 'IMAGE' && safeUrl(c.url || c.image_url)) { const im = n('img'); im.src = c.url || c.image_url; im.alt = 'foto'; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; return im; }
    const txt = msgText(m); return txt ? n('div', 'tk-msg-body', txt) : null;
  }
  const when = (t) => t ? new Date(Number(t) * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const whenShort = (t) => { if (!t) return ''; const d = new Date(Number(t) * 1000), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); };
  const avatarHtml = (url, name, size = 38) => { const u = safeUrl(url); const st = `width:${size}px;height:${size}px;flex:0 0 ${size}px`; return u ? `<img class="tk-av" style="${st}" src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="tk-av" style="${st}">${esc(String(name || '?').slice(0, 1))}</span>`; };
  function secAtendimento() {
    const el = box(`<div class="tk-card tk-chat"><div class="tk-clist"><div class="hd"><label class="tk-search" style="min-width:0"><i class="ph ph-magnifying-glass"></i><input type="search" placeholder="Buscar cliente" aria-label="Buscar cliente"></label><div class="tk-chips" style="margin-top:10px"><button type="button" class="tk-chip on" data-u="0">Todas</button><button type="button" class="tk-chip" data-u="1">Não lidas</button></div></div><div class="items"><div class="tk-empty">Carregando conversas…</div></div></div>
      <div class="tk-thread"><div class="tk-empty" style="margin:auto">Selecione uma conversa à esquerda.</div></div><div class="tk-cpanel"><div class="tk-empty">Os dados do cliente aparecem aqui.</div></div></div>`);
    const items = el.querySelector('.items'), thread = el.querySelector('.tk-thread'), cpanel = el.querySelector('.tk-cpanel'), inp = el.querySelector('input');
    let convs = [], onlyUnread = false, sel = null;
    const buyerOf = c => (c.participants || []).find(p => p.role !== 'SHOP') || {};
    const paintList = () => {
      const q = inp.value.trim().toLowerCase();
      const arr = convs.filter(c => (!onlyUnread || c.unread_count > 0) && (!q || String(buyerOf(c).nickname || '').toLowerCase().includes(q)));
      items.innerHTML = arr.length ? arr.map(c => { const b = buyerOf(c), lm = c.latest_message, prev = lm ? (msgText(lm) || (lm.sender && lm.sender.role === 'ROBOT' ? 'Mensagem automática' : 'Mensagem')) : ''; return `<button type="button" class="tk-ci${sel === c.id ? ' on' : ''}" data-id="${esc(c.id)}">${avatarHtml(b.avatar, b.nickname)}<div class="tx"><div class="top"><b>${esc(b.nickname || 'Cliente')}</b><small>${esc(whenShort(lm && lm.create_time))}</small></div><div class="pv"><span>${esc(prev.replace(/\s+/g, ' '))}</span>${c.unread_count > 0 ? `<span class="tk-badge">${num(c.unread_count)}</span>` : ''}</div></div></button>`; }).join('') : `<div class="tk-empty">${convs.length ? 'Nenhuma conversa neste filtro.' : 'Nenhuma conversa.'}</div>`;
      fixImgs(items);
      items.querySelectorAll('.tk-ci').forEach(bt => bt.onclick = () => { const c = convs.find(x => String(x.id) === bt.dataset.id); if (c) open(c); });
    };
    inp.oninput = paintList;
    el.querySelectorAll('.tk-chip').forEach(b => b.onclick = () => { onlyUnread = b.dataset.u === '1'; el.querySelectorAll('.tk-chip').forEach(x => x.classList.toggle('on', x === b)); paintList(); });
    conversations().then(d => {
      convs = (d && d.conversations) || [];
      const nu = convs.filter(c => c.unread_count > 0).length; const cu = el.querySelector('.tk-chip[data-u="1"]'); if (cu) cu.textContent = 'Não lidas · ' + num(nu);
      if (!d) { items.innerHTML = '<div class="tk-empty">Não consegui carregar as conversas.</div>'; return; }
      paintList(); if (convs.length) open(convs[0]);
    });
    function open(c) {
      sel = c.id; items.querySelectorAll('.tk-ci').forEach(b => b.classList.toggle('on', b.dataset.id === String(c.id)));
      const buyer = buyerOf(c);
      thread.innerHTML = `<div class="hd">${avatarHtml(buyer.avatar, buyer.nickname, 34)}<b class="tk-one">${esc(buyer.nickname || 'Cliente')}</b><span class="tk-hpill" style="margin-left:auto"></span></div><div class="tk-msgs"><div class="tk-empty">Carregando mensagens…</div></div>`;
      fixImgs(thread);
      const scroll = thread.querySelector('.tk-msgs'), hpill = thread.querySelector('.tk-hpill');
      loadCustomer(c, buyer, hpill);
      authGet('/api/tiktok/chat/messages?conversation_id=' + encodeURIComponent(c.id)).catch(() => null).then((d) => {
        if (sel !== c.id) return;
        scroll.replaceChildren();
        if (!d) { scroll.append(n('div', 'tk-empty', 'Não consegui carregar as mensagens.')); return; }
        const msgs = (d.messages || []).slice().sort((a, b) => (Number(a.create_time) || 0) - (Number(b.create_time) || 0));
        if (!msgs.length) scroll.append(n('div', 'tk-empty', 'Sem mensagens.'));
        let shown = 0;
        for (const m of msgs) {
          const role = (m.sender && m.sender.role) || '';
          const body = msgNode(m);
          if (role === 'SYSTEM') { if (body && body.textContent) { scroll.append(n('span', 'tk-sysn', body.textContent + ' · ' + when(m.create_time))); shown++; } continue; }
          if (!body) continue; // cartões internos sem conteúdo
          const mine = role === 'SHOP' || role === 'ROBOT' || role === 'CUSTOMER_SERVICE';
          const bub = n('div', 'tk-bub ' + (role === 'ROBOT' ? 'bot' : mine ? 's' : 'c'));
          if (role === 'ROBOT') { const em = n('em'); em.innerHTML = '<i class="ph ph-robot"></i> resposta automática'; bub.append(em); }
          bub.append(body, n('small', '', when(m.create_time)));
          scroll.append(bub); shown++;
        }
        if (!shown && msgs.length) scroll.append(n('div', 'tk-empty', 'Só há avisos automáticos do TikTok nesta conversa. Abra no Seller Center para ver cartões especiais.'));
        scroll.scrollTop = scroll.scrollHeight;
        if (c.can_send_message === false) { thread.append(n('div', 'tk-empty', 'Esta conversa não aceita resposta.')); return; }
        const comp = n('div', 'tk-comp'), ta = n('textarea'), btn = n('button', 'tk-btn'), err = n('div', 'tk-senderr');
        btn.innerHTML = '<i class="ph-fill ph-paper-plane-tilt"></i>Enviar'; ta.placeholder = 'Escreva uma resposta…'; ta.rows = 1; btn.type = 'button'; ta.setAttribute('aria-label', 'Mensagem');
        const send = async () => { const text = ta.value.trim(); if (!text) return; btn.disabled = true; err.textContent = '';
          try { if (!(await chatSendReq(c.id, text))) err.textContent = 'Não consegui enviar. Tente de novo.'; else { ta.value = ''; const bub = n('div', 'tk-bub s'); bub.append(n('div', 'tk-msg-body', text), n('small', '', 'agora')); scroll.append(bub); scroll.scrollTop = scroll.scrollHeight; } }
          catch (e) { err.textContent = 'Não consegui enviar. Tente de novo.'; } btn.disabled = false; };
        btn.onclick = send; ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
        comp.append(ta, btn); thread.append(comp, err);
      });
    }
    const custCache = {};
    function loadCustomer(c, buyer, hpill) {
      const head = `<div style="display:flex;align-items:center;gap:10px">${avatarHtml(buyer.avatar, buyer.nickname, 46)}<div class="tk-min0"><b class="tk-one">${esc(buyer.nickname || 'Cliente')}</b><div class="tk-mut" style="font-size:12px">Cliente TikTok Shop</div></div></div>`;
      cpanel.innerHTML = head + '<div class="tk-empty">Carregando dados do cliente…</div>'; fixImgs(cpanel);
      if (!buyer.user_id) { cpanel.innerHTML = head + '<div class="tk-empty">Cliente sem identificação nesta conversa.</div>'; fixImgs(cpanel); return; }
      const p = custCache[buyer.user_id] || (custCache[buyer.user_id] = authGet('/api/tiktok/chat/customer?' + new URLSearchParams({ user_id: buyer.user_id })).catch(() => null));
      p.then(d => {
        if (sel !== c.id) return;
        if (!d) { delete custCache[buyer.user_id]; cpanel.innerHTML = head + '<div class="tk-empty">Não consegui carregar os dados do cliente.</div>'; fixImgs(cpanel); return; }
        const ult = d.ultimos || [], u0 = ult[0];
        if (u0 && hpill) { const [l, cl] = ost(u0.status); hpill.innerHTML = pill('Pedido ' + l.toLowerCase(), cl); }
        const ocard = o => { const [l, cl] = ost(o.status); const ship = [o.transportadora, o.rastreio].filter(Boolean).map(esc).join(' · '); return `<div class="tk-ocard"><div style="display:flex;justify-content:space-between;gap:8px;font-size:12px"><b class="tk-one">${esc(o.id)}</b><span class="tk-mut" style="white-space:nowrap">${esc(noYear(o.dt).slice(0, 5))}</span></div><div class="tk-pn" style="margin:8px 0">${foto(o.img)}${pname(o.produto, 170, esc(o.variacao || ''))}</div><div style="display:flex;justify-content:space-between;align-items:center;gap:8px">${pill(l, cl)}<b>${brl(o.total)}</b></div>${ship ? `<div class="tk-mut" style="font-size:11.5px;margin-top:6px">${ship}</div>` : ''}</div>`; };
        cpanel.innerHTML = head + `<h4>Cliente</h4>${d.nome ? `<div class="tk-kv"><span class="tk-mut">Nome</span><b class="tk-one">${esc(d.nome)}</b></div>` : ''}<div class="tk-kv"><span class="tk-mut">Cliente desde</span><b>${esc(d.desde || '—')}</b></div><div class="tk-kv"><span class="tk-mut">Total de pedidos</span><b>${num(d.pedidos)}${d.pagos != null && d.pagos !== d.pedidos ? ` <span class="tk-mut" style="font-weight:500">· ${num(d.pagos)} pagos</span>` : ''}</b></div><div class="tk-kv"><span class="tk-mut">Total gasto</span><b class="tk-money">${brl(d.gasto)}</b></div><div class="tk-kv"><span class="tk-mut">Cidade/UF</span><b class="tk-one">${esc(d.cidade || '—')}</b></div>
          ${u0 ? `<h4>Último pedido</h4>${ocard(u0)}` : '<h4>Pedidos</h4><div class="tk-empty" style="padding:12px 0;text-align:left">Nenhum pedido encontrado para este cliente.</div>'}
          ${ult.length > 1 ? `<h4>Outros pedidos</h4>${ult.slice(1).map(o => `<div class="tk-kv" style="font-size:12.5px"><span class="tk-min0"><b style="font-size:12px" class="tk-one">${esc(o.id)}</b><span class="tk-mut" style="display:block;font-size:11.5px">${esc(noYear(o.dt).slice(0, 5))} · ${esc(ost(o.status)[0])}</span></span><b>${brl(o.total)}</b></div>`).join('')}` : ''}`;
        fixImgs(cpanel);
      });
    }
    return el;
  }

  const TABS = [['Resumo', secResumo], ['Pedidos', secPedidos], ['Produtos', secProdutos], ['Devoluções', secDevolucoes], ['Financeiro', secFinanceiro], ['Estoque', secEstoque], ['Desempenho', secDesempenho], ['Vídeos & Criadores', secVideos], ['Atendimento', secAtendimento]];
  const USES_PREV = ['Resumo', 'Devoluções', 'Financeiro'];

  function render(target, data, state, onSync) {
    ensureStyle();
    target.replaceChildren(); target.hidden = false; document.body.dataset.marketplace = 'tiktokshop';
    const wrap = n('div', 'ttk-v2');
    const band = n('div', 'ttk-band'), tabsEl = n('nav', 'ttk-tabs'); tabsEl.setAttribute('aria-label', 'Seções do TikTok Shop'); band.append(tabsEl);
    if (!data) {
      for (const [label] of TABS) { const b = n('button', 'ttk-tab' + (label === (root.__tiktokTab || 'Resumo') ? ' on' : ''), label); b.type = 'button'; b.disabled = true; tabsEl.append(b); }
      wrap.append(band, box(`<div class="tk-card"><div class="tk-wait">${esc(state || 'Carregando dados do TikTok Shop…')}</div></div>`)); target.append(wrap); return;
    }
    const content = n('div');
    let active = (root.__tiktokTab && TABS.some(t => t[0] === root.__tiktokTab)) ? root.__tiktokTab : 'Resumo';
    const paint = () => {
      tabsEl.querySelectorAll('.ttk-tab').forEach(btn => btn.classList.toggle('on', btn.dataset.t === active));
      const sec = TABS.find(t => t[0] === active)[1];
      content.replaceChildren(sec(data));
    };
    goTab = (label) => { if (!TABS.some(t => t[0] === label)) return; active = label; root.__tiktokTab = label; paint(); wrap.scrollIntoView({ block: 'start' }); };
    for (const [label] of TABS) {
      const btn = n('button', 'ttk-tab', label); btn.type = 'button'; btn.dataset.t = label;
      btn.onclick = () => { active = label; root.__tiktokTab = label; paint(); };
      tabsEl.append(btn);
    }
    content.addEventListener('click', (e) => { const g = e.target.closest && e.target.closest('[data-go]'); if (g) goTab(g.dataset.go); });
    // barra fina fora da faixa: última sincronização + Atualizar
    const meta = n('div', 'ttk-meta');
    meta.append(n('span', '', 'Loja: ' + (data.shop || 'TikTok Shop') + (data.lastSync ? ' · última sincronização ' + data.lastSync : '') + ' · pedidos também chegam por webhook do TikTok Shop'));
    const syncBtn = n('button', 'tk-btn ghost sm'); syncBtn.type = 'button'; syncBtn.innerHTML = '<i class="ph ph-arrows-clockwise"></i>Atualizar';
    syncBtn.onclick = async () => { insightsCache.clear(); productsCache.clear(); convCache = null; syncBtn.disabled = true; syncBtn.lastChild.textContent = 'Sincronizando…'; try { await sync(); if (onSync) onSync(); } finally { syncBtn.disabled = false; syncBtn.lastChild.textContent = 'Atualizar'; } };
    meta.append(syncBtn);
    wrap.append(band, meta, content);
    // período anterior (comparações)
    prevOv = undefined; const pr = prevRange();
    if (pr) overview(pr[0], pr[1]).then(p => { prevOv = p || null; if (wrap.isConnected && USES_PREV.includes(active)) paint(); }); else prevOv = null;
    // não lidas no Atendimento
    conversations().then(d => { const u = ((d && d.conversations) || []).reduce((a, c) => a + (c.unread_count > 0 ? 1 : 0), 0); const b = tabsEl.querySelector('[data-t="Atendimento"]'); if (b && u) b.append(n('span', 'cnt', num(u))); });
    paint();
    target.append(wrap);
  }

  root.CacifeTikTok = { overview, sync, render };
})(window);
