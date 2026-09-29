// Kit compartilhado dos painéis de canal (Mercado Livre, Nuvemshop, Shopee): o mesmo desenho das abas
// "Produtos" e "Devoluções" do TikTok Shop, com a cor de cada canal. Valores de dinheiro em CENTAVOS.
// Tudo que vem de fora passa por esc(); imagens só http(s) ou data:image. Estilos ficam dentro de .ck.
(function (root) {
  'use strict';
  const GREEN = '#16a34a', AMBER = '#d97706', RED = '#dc2626', GRAY = '#9ca3af';
  const TONE = { g: GREEN, am: AMBER, rd: RED, gy: GRAY, cy: '' };

  // ---------- helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => { const s = String(u || '').trim(); return /^https?:\/\//i.test(s) || /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(s) ? s : ''; };
  const brl = c => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(c) || 0) / 100);
  const num = v => new Intl.NumberFormat('pt-BR').format(Number(v) || 0);
  const pct = (v, d = 1) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
  const ddmm = iso => iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : '—';
  const tile = s => { const t = String(s || '').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t; };
  // Nome curto: tira "Óculos de Sol" do começo e fica com as 4 primeiras palavras (igual ao TikTok).
  function shortName(t) {
    const full = String(t || '').replace(/\s+/g, ' ').trim(); if (!full) return 'Produto';
    let s = full.replace(/^(kit\s+\d+\s+)?[óo]culos\s+(de\s+sol\s+)?/i, (m, kit) => kit ? tile(kit) : '');
    if (!s) s = full;
    const w = s.split(' ').filter(x => !/^[-–|·+]$/.test(x)).slice(0, 4);
    while (w.length > 1 && /^(e|de|da|do|das|dos|com|para|em|a|o|\+)$/i.test(w[w.length - 1])) w.pop();
    return tile(w.join(' ').replace(/[,;:\-–]+$/, ''));
  }
  const dayList = (s, e) => { const out = []; if (!s || !e) return out; for (let d = new Date(s + 'T12:00:00Z'), end = new Date(e + 'T12:00:00Z'); d <= end && out.length < 400; d = new Date(+d + 864e5)) out.push(d.toISOString().slice(0, 10)); return out; };
  const brDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
  function toDay(v) {
    const s = String(v || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s); return Number.isFinite(d.getTime()) ? brDay.format(d) : '';
  }
  // comparação com o período anterior (inverse = subir é ruim). old: undefined = consultando, 0/null = sem base
  function delta(curV, old, inverse, short) {
    if (old === undefined) return '<span class="ck-mut">Consultando período anterior…</span>';
    if (!old) return '<span class="ck-mut">Sem base anterior</span>';
    const p = ((Number(curV) || 0) / old - 1) * 100, up = p >= 0, good = inverse ? !up : up;
    if (Math.abs(p) < 0.05) return '<span class="ck-mut" style="font-weight:600">= 0%</span>' + (short ? '' : ' <span class="ck-mut ck-vs">vs. anterior</span>');
    return `<span class="${good ? 'ck-up' : 'ck-down'}">${up ? '▲' : '▼'} ${Math.abs(p).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>${short ? '' : ' <span class="ck-mut ck-vs">vs. anterior</span>'}`;
  }
  const muted = t => `<span class="ck-mut">${esc(t)}</span>`;
  const pill = (t, c) => `<span class="ck-pill ${esc(c)}">${esc(t)}</span>`;
  const foto = (url, cls = '', title = '') => { const u = safeUrl(url); return u ? `<img class="ck-foto ${cls}" src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer"${title ? ` title="${esc(title)}"` : ''}>` : `<span class="ck-foto ${cls}"><i class="ph ph-image"></i></span>`; };
  const pname = (full, max, sub) => `<span class="ck-pn-tx"><b title="${esc(full)}"${max ? ` style="max-width:${max}px"` : ''}>${esc(shortName(full))}</b>${sub != null ? `<span>${sub}</span>` : ''}</span>`;
  const chead = (t, c, right = '') => `<div class="ck-chead"><div class="ck-min0"><h3>${t}</h3>${c ? `<p class="ck-cap">${c}</p>` : ''}</div>${right}</div>`;
  // card de KPI: value/sub já vêm escapados/formatados
  const kc = (label, icon, value, sub, o = {}) => `<div class="ck-card ck-kc"><div class="ck-kc-h"><span class="ck-ico${o.alt ? ' c' : ''}"><i class="ph ${esc(icon)}"></i></span><span class="ck-lbl">${esc(label)}</span><i class="ck-kc-bar${o.alt ? ' c' : ''}"></i></div><div class="ck-kc-v ck-one${o.money ? ' ck-money' : ''}" title="${esc(o.title || String(value).replace(/<[^>]+>/g, ''))}">${value}</div><div class="ck-kc-d">${sub}</div></div>`;
  const legendDot = c => `<i class="ck-dot" style="background:${esc(c)}"></i>`;
  function hbars(items, w = 160) { const max = Math.max(1, ...items.map(x => x[1])); return items.map(([l, v, c]) => `<div class="ck-hbar" style="grid-template-columns:${w}px minmax(0,1fr) 48px"><span title="${esc(l)}">${esc(l)}</span><span class="ck-tr"><i style="width:${v / max * 100}%;background:${c}"></i></span><b>${num(v)}</b></div>`).join(''); }
  function donut(items, label, size = 140) {
    const tot = items.reduce((s, x) => s + x[1], 0) || 1; let off = 0, g = '<circle cx="60" cy="60" r="46" fill="none" stroke="#f3f4f6" stroke-width="16"/>';
    for (const [l, v, c] of items) { const f = v / tot * 100; if (f <= 0) continue; g += `<circle class="hv" data-tip="${esc(l)}|${num(v)} · ${pct(f)}" cx="60" cy="60" r="46" pathLength="100" fill="none" stroke="${esc(c)}" stroke-width="16" stroke-dasharray="${Math.max(0.1, f - .6)} ${100 - f + .6}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`; off += f; }
    return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" style="flex:none">${g}<text x="60" y="57" text-anchor="middle" style="font-size:9px">${esc(label)}</text><text x="60" y="72" text-anchor="middle" style="font-size:14px;fill:#111827;font-weight:700">${num(tot)}</text></svg>`;
  }
  const legend = items => { const tot = items.reduce((s, x) => s + x[1], 0) || 1; return items.map(([l, v, c]) => `<div class="ck-kv"><span class="ck-min0" style="display:flex;gap:8px;align-items:center">${legendDot(c)}<span class="ck-one">${esc(l)}</span></span><b>${num(v)} <span class="ck-mut" style="font-weight:500">· ${pct(v / tot * 100)}</span></b></div>`).join(''); };
  function spark(dates, vals, { w = 200, h = 34, color = 'var(--p)' } = {}) {
    if (vals.length < 2) return '';
    const max = Math.max(1, ...vals) * 1.1, st = w / (vals.length - 1), X = i => i * st, Y = v => h - 2 - v / max * (h - 4);
    let g = `<polyline points="${vals.map((v, i) => X(i) + ',' + Y(v)).join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>`;
    vals.forEach((v, i) => { g += `<g class="hv" data-tip="${ddmm(dates[i])}|Vendas: ${brl(v)}"><rect x="${X(i) - st / 2}" y="0" width="${st}" height="${h}" fill="transparent"/><circle class="dot" cx="${X(i)}" cy="${Y(v)}" r="2.8" fill="${color}"/></g>`; });
    return `<svg class="ck-spark" viewBox="-3 0 ${w + 6} ${h}" preserveAspectRatio="none" style="height:${h}px">${g}</svg>`;
  }
  // imagens que falharem viram o fundo cinza do quadro
  function fixImgs(el) { el.querySelectorAll('img').forEach(im => { if (!im.dataset.fx) { im.dataset.fx = 1; im.addEventListener('error', () => { im.removeAttribute('src'); im.style.visibility = 'hidden'; }); } }); return el; }
  const hex = c => /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? String(c) : '';

  // ---------- estilos (uma vez) ----------
  function ensureStyle() {
    if (document.getElementById('ck-style')) return;
    const css = `
    .ck{--p:#ee4d2d;--c:#26aa99;--b1:var(--p);--b2:var(--c);--p2:color-mix(in srgb,var(--p) 11%,#fff);--p3:color-mix(in srgb,var(--p) 78%,#000);--c3:color-mix(in srgb,var(--c) 13%,#fff);--c2:color-mix(in srgb,var(--c) 80%,#000);--ink:#111827;--mut:#6b7280;--ln:#eceef2;font-family:"DM Sans",system-ui,sans-serif;font-size:14px;color:var(--ink);font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;min-width:0;display:flex;flex-direction:column;gap:0}
    .ck *{box-sizing:border-box}
    .ck h3{margin:0 0 2px;font-size:15px;font-weight:700;letter-spacing:-.01em;color:var(--ink);line-height:1.3}
    .ck p{margin:0}
    .ck .ck-card{background:#fff;border:1px solid var(--ln);border-radius:16px;padding:18px;min-width:0;display:flex;flex-direction:column;box-shadow:0 1px 2px #1118270a}
    .ck .ck-cap{margin:0 0 14px;color:var(--mut);font-size:12.5px;line-height:1.4}
    .ck .ck-chead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .ck .ck-min0{min-width:0}
    .ck .ck-grid{display:grid;gap:16px;align-items:stretch}
    .ck .ck-mt{margin-top:16px}
    .ck .ck-push{margin-top:auto}
    .ck .ck-fill{flex:1;display:flex;flex-direction:column;justify-content:space-between;min-width:0}
    .ck .ck-lbl{font-size:12.5px;color:var(--mut);font-weight:500}
    .ck .ck-mut{color:var(--mut)}
    .ck .ck-up{color:#16a34a;font-weight:600;font-size:12.5px}.ck .ck-down{color:#dc2626;font-weight:600;font-size:12.5px}.ck .ck-vs{font-size:12px}
    .ck .ck-money{color:#16a34a!important;font-weight:700;white-space:nowrap}
    .ck .ck-one{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
    .ck .ck-scroll{overflow-x:auto;min-width:0}
    .ck table.ck-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
    .ck .ck-tbl th{border-top:0;font-size:12px;color:var(--mut);font-weight:600;text-align:left;padding:9px 10px;border-bottom:1px solid var(--ln);white-space:nowrap;background:transparent}
    .ck .ck-tbl td{padding:11px 10px;border:0;border-bottom:1px solid #f3f4f6;vertical-align:middle;text-align:left;font-weight:400;line-height:1.35;font-size:13.5px}
    .ck .ck-tbl th.r,.ck .ck-tbl td.r{text-align:right;white-space:nowrap}
    .ck .ck-tbl td.nw{white-space:nowrap}
    .ck .ck-tbl tr:last-child td{border-bottom:0}
    .ck .ck-pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;border-radius:999px;padding:3px 10px;white-space:nowrap;line-height:1.4}
    .ck .ck-pill.g{background:#e7f7ee;color:#15803d}.ck .ck-pill.cy{background:var(--c3);color:var(--c2)}.ck .ck-pill.am{background:#fff4d6;color:#8a5a00}.ck .ck-pill.rd{background:#fdecec;color:#b42318}.ck .ck-pill.gy{background:#f3f4f6;color:#4b5563}.ck .ck-pill.pk{background:var(--p2);color:var(--p3)}.ck .ck-pill.pp{background:var(--p);color:var(--pt,#fff)}
    .ck .ck-foto{width:40px;height:40px;border-radius:10px;background:#f3f4f6;display:grid;place-items:center;font-size:18px;color:#c4c8d0;flex:none;object-fit:cover}
    .ck .ck-foto.big{width:100%;height:150px;border-radius:12px;font-size:34px}
    .ck .ck-pn{display:flex;align-items:center;gap:12px;min-width:0}
    .ck .ck-pn-tx{min-width:0;display:block;flex:1}
    .ck .ck-pn-tx b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
    .ck .ck-pn-tx>span{display:block;font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ck .ck-btn{border:0;border-radius:10px;padding:10px 16px;font:700 13px "DM Sans",system-ui,sans-serif;cursor:pointer;background:var(--p);color:var(--pt,#fff);display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
    .ck .ck-btn.ghost,.ck .ck-btn.ghost:hover:not(:disabled){background:#fff;color:#374151;border:1px solid var(--ln)}
    .ck .ck-btn.ghost:hover:not(:disabled){border-color:#d1d5db}
    .ck .ck-btn.sm{padding:7px 12px;font-size:12.5px}
    .ck .ck-chips{display:flex;gap:6px;flex-wrap:wrap}
    .ck .ck-chip,.ck .ck-chip:hover:not(:disabled){border:1px solid var(--ln);background:#fff;border-radius:9px;padding:6px 11px;font:600 12.5px "DM Sans",system-ui,sans-serif;color:#4b5563;white-space:nowrap;cursor:pointer}
    .ck .ck-chip:hover:not(:disabled){border-color:#d1d5db}
    .ck .ck-chip.on,.ck .ck-chip.on:hover:not(:disabled){background:var(--p);border-color:var(--p);color:var(--pt,#fff)}
    .ck label.ck-search{display:flex;align-items:center;gap:8px;border:1px solid var(--ln);border-radius:10px;padding:0 12px;background:#fff;color:var(--mut);min-width:240px;height:36px;font-size:13px;margin:0}
    .ck .ck-search input{border:0;outline:0;background:transparent;font:inherit;font-size:13px;color:var(--ink);flex:1;min-width:0;height:100%;padding:0;box-shadow:none}
    .ck select.ck-select{border:1px solid var(--ln);border-radius:10px;height:36px;padding:0 10px;font:inherit;font-size:13px;background:#fff;color:var(--ink);width:auto;min-width:0}
    .ck .ck-kv{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #f3f4f6;font-size:13.5px;align-items:center}.ck .ck-kv:last-child{border-bottom:0}.ck .ck-kv>b{white-space:nowrap}
    .ck .ck-note{display:flex;gap:8px;align-items:center;background:#fafafa;border:1px solid var(--ln);border-radius:10px;padding:9px 12px;font-size:12.5px;color:#4b5563}
    .ck .ck-hbar{display:grid;gap:10px;align-items:center;padding:7px 0;font-size:13px}.ck .ck-hbar .ck-tr{height:10px;background:#f3f4f6;border-radius:9px;overflow:hidden}.ck .ck-hbar .ck-tr i{display:block;height:100%;border-radius:9px}.ck .ck-hbar>span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ck .ck-hbar>b{text-align:right}
    .ck .ck-dot{width:10px;height:10px;border-radius:3px;flex:none;display:inline-block}
    .ck .ck-ico{flex:0 0 28px;width:28px;height:28px;border-radius:8px;background:var(--p2);color:var(--p3);display:grid;place-items:center;font-size:15px}
    .ck .ck-ico.c{background:var(--c3);color:var(--c2)}
    .ck .ck-kc{padding:16px 18px;justify-content:center}
    .ck .ck-kc-h{display:flex;align-items:center;gap:10px;margin-bottom:14px}.ck .ck-kc-h .ck-lbl{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ck .ck-kc-bar{margin-left:auto;flex:none;width:28px;height:4px;border-radius:9px;background:var(--b1)}.ck .ck-kc-bar.c{background:var(--b2)}
    .ck .ck-kc-v{font-size:23px;font-weight:700;letter-spacing:-.02em;line-height:1.15}
    .ck .ck-kc-d{margin-top:10px;font-size:12.5px;min-height:18px}
    .ck .ck-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
    .ck .ck-spark{width:100%;display:block;overflow:visible}
    .ck svg text{font-family:"DM Sans",system-ui,sans-serif;fill:#9ca3af;font-size:11px}
    .ck .hv{cursor:crosshair}.ck .hv .dot{opacity:0}.ck .hv:hover .dot{opacity:1}
    .ck .ck-wait{padding:30px;text-align:center;color:var(--mut);font-size:13px}
    @media(max-width:1100px){.ck .ck-cols{grid-template-columns:minmax(0,1fr)!important}.ck .ck-k4{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ck label.ck-search{min-width:0;flex:1}}
    @media(max-width:620px){.ck .ck-k4,.ck .ck-k3{grid-template-columns:minmax(0,1fr)!important}.ck .ck-pgrid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.ck .ck-foto.big{height:130px}.ck .ck-donut{flex-direction:column!important;align-items:stretch!important}.ck .ck-donut>svg{align-self:center}}`;
    document.head.append(Object.assign(document.createElement('style'), { id: 'ck-style', textContent: css }));
    // tooltip único ([data-tip] = "título|linha|linha")
    const tip = document.createElement('div'); tip.id = 'ck-tip';
    tip.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:#111827;color:#fff;border-radius:10px;padding:8px 11px;font:500 12.5px/1.45 "DM Sans",system-ui,sans-serif;box-shadow:0 8px 24px #0003;display:none;white-space:nowrap';
    document.body.append(tip);
    document.addEventListener('mousemove', (e) => {
      const t = e.target && e.target.closest && e.target.closest('.ck [data-tip]');
      if (!t) { tip.style.display = 'none'; return; }
      const [a, ...r] = t.getAttribute('data-tip').split('|');
      const b = document.createElement('b'); b.textContent = a; b.style.cssText = 'display:block;font-size:11.5px;font-weight:700;opacity:.8';
      tip.replaceChildren(b); r.forEach((x, i) => { if (i) tip.append(document.createElement('br')); tip.append(document.createTextNode(x)); });
      tip.style.display = 'block';
      const w = tip.offsetWidth, h = tip.offsetHeight; let x = e.clientX + 14, y = e.clientY - h - 12;
      if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y < 8) y = e.clientY + 16;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }, { passive: true });
  }
  // raiz .ck com as cores do canal: accent = cor forte (pílulas/botões), accent2 = cor secundária,
  // bar = traço dos cards (padrão = accent), text = cor do texto sobre o accent (padrão branco)
  function rootEl(o) {
    ensureStyle();
    const el = document.createElement('div'); el.className = 'ck';
    const p = hex(o.accent), c = hex(o.accent2), b = hex(o.bar), t = hex(o.accentText);
    if (p) el.style.setProperty('--p', p); if (c) el.style.setProperty('--c', c); if (b) el.style.setProperty('--b1', b); if (t) el.style.setProperty('--pt', t);
    return el;
  }

  // ---------- agregação por produto ----------
  // rows: itens de pedidos PAGOS { id, title, image, qty, value (centavos, total da linha), date, variation, orderId }
  function aggregate(rows) {
    const by = new Map();
    for (const r of rows || []) {
      if (!r) continue;
      const key = String(r.id != null && r.id !== '' ? r.id : 't:' + (r.title || ''));
      let p = by.get(key);
      if (!p) { p = { id: key, title: '', image: '', units: 0, gmv: 0, orders: new Set(), lines: 0, porDia: {}, vars: new Map() }; by.set(key, p); }
      const qty = Number(r.qty) || 0, value = Number(r.value) || 0;
      if (!p.title && r.title) p.title = String(r.title);
      if (!p.image && safeUrl(r.image)) p.image = safeUrl(r.image);
      p.units += qty; p.gmv += value; p.lines++;
      if (r.orderId != null && r.orderId !== '') p.orders.add(String(r.orderId));
      const d = toDay(r.date); if (d) p.porDia[d] = (p.porDia[d] || 0) + value;
      const v = String(r.variation || '').trim(); if (v) p.vars.set(v, (p.vars.get(v) || 0) + qty);
    }
    return [...by.values()].map(p => ({
      id: p.id, title: p.title || 'Produto', image: p.image, units: p.units, gmv: p.gmv, porDia: p.porDia,
      pedidos: p.orders.size || p.lines,
      variacaoTop: [...p.vars].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
    }));
  }
  const seriesFor = (p, dates) => Array.isArray(p.porDia) ? p.porDia.slice(0, dates.length).map(Number) : dates.map(d => Number((p.porDia || {})[d]) || 0);

  // ---------- Produtos ----------
  // o: { rows | products, prevRows | prevProducts (null = sem comparação), prevLoading, start, end,
  //      accent, accent2, bar, accentText, caption, loadImages(ids) -> Promise<{id: url}> }
  function productsView(target, o = {}) {
    const el = rootEl(o);
    const list = (o.products || aggregate(o.rows)).map(p => ({ ...p, id: String(p.id), image: safeUrl(p.image) }));
    const prevList = o.prevProducts || (o.prevRows ? aggregate(o.prevRows) : null);
    const prevOk = !!prevList, loading = !prevOk && !!o.prevLoading;
    const olds = prevList || [], oldBy = new Map(olds.map(p => [String(p.id), p]));
    const cmp = (v, old, inv, short) => prevOk ? delta(v, old, inv, short) : loading ? delta(v, undefined) : muted('no período');
    const units = list.reduce((a, p) => a + (p.units || 0), 0), oldUnits = olds.reduce((a, p) => a + (p.units || 0), 0);
    const champ = list.slice().sort((a, b) => (b.gmv || 0) - (a.gmv || 0))[0];
    const champOld = champ && oldBy.get(String(champ.id));
    const dates = dayList(o.start, o.end);
    const kpis = `<div class="ck-grid ck-k3" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[
      kc('Produtos com venda', 'ph-package', num(list.length), cmp(list.length, olds.length)),
      kc('Unidades vendidas', 'ph-stack', num(units), cmp(units, oldUnits), { alt: true }),
      kc('Produto campeão', 'ph-trophy', champ ? esc(shortName(champ.title)) : '—', champ ? `<span class="ck-money">${brl(champ.gmv)}</span>${prevOk ? ' · ' + delta(champ.gmv, champOld ? champOld.gmv : 0, false, true) : ''}` : muted('sem vendas'), { title: champ ? champ.title : '' }),
    ].join('')}</div>`;
    el.innerHTML = kpis + `<div class="ck-card ck-mt"><div class="ck-chead" style="align-items:center;flex-wrap:wrap;margin-bottom:14px"><div class="ck-min0"><h3>Vendas por produto</h3><p class="ck-cap" style="margin:0">${num(list.length)} produtos com venda · ${esc(o.caption || 'pedidos pagos no período')}</p></div><select class="ck-select" aria-label="Ordenar produtos"><option value="gmv">Por valor vendido</option><option value="units">Por unidades</option><option value="pedidos">Por pedidos</option></select></div><div class="ck-pgrid"></div><div class="ck-more" style="text-align:center"></div></div>`;
    const g = el.querySelector('.ck-pgrid'), more = el.querySelector('.ck-more'), sel = el.querySelector('select');
    let lim = 20;
    const asked = new Set();
    const card = (p, i) => {
      const old = oldBy.get(String(p.id));
      const badge = prevOk ? (old && old.gmv ? delta(p.gmv, old.gmv, false, true) : '<span class="ck-pill pk" style="font-size:11px;padding:1px 8px">novo</span>') : '';
      return `<div class="ck-card" style="padding:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px">${pill('#' + (i + 1), i < 3 ? 'pp' : 'gy')}<span style="font-size:12px">${badge}</span></div>
        ${foto(p.image, 'big', p.title)}<b class="ck-one" title="${esc(p.title)}" style="margin-top:12px">${esc(shortName(p.title))}</b><span class="ck-mut ck-one" style="font-size:12px" title="${esc(p.variacaoTop || '')}">${p.variacaoTop ? '+ vendida: ' + esc(p.variacaoTop) : '&nbsp;'}</span>
        <div style="margin-top:10px;min-height:34px">${spark(dates, seriesFor(p, dates), { w: 200, h: 34, color: i < 3 ? 'var(--p)' : 'var(--c)' })}</div>
        <div class="ck-mut" style="font-size:12.5px;padding-top:8px">${num(p.units)} un · ${num(p.pedidos)} ped.</div>
        <div class="ck-push" style="display:flex;justify-content:space-between;align-items:baseline;padding-top:8px;gap:8px"><span class="ck-mut" style="font-size:12px">valor vendido</span><span class="ck-money" style="font-size:16px">${brl(p.gmv)}</span></div></div>`;
    };
    const paint = () => {
      const k = sel.value, arr = list.slice().sort((a, b) => (b[k] || 0) - (a[k] || 0) || (b.gmv || 0) - (a.gmv || 0));
      const shown = arr.slice(0, lim);
      g.innerHTML = arr.length ? shown.map(card).join('') : '<p class="ck-cap">Nenhum produto vendido no período.</p>'; fixImgs(g);
      more.innerHTML = arr.length > lim ? `<button type="button" class="ck-btn ghost sm" style="margin-top:16px">Ver mais (${num(arr.length - lim)})</button>` : '';
      const b = more.querySelector('button'); if (b) b.onclick = () => { lim += 20; paint(); };
      // fotos que faltam: pede ao canal (se ele souber buscar)
      if (typeof o.loadImages === 'function') {
        const need = shown.filter(p => !p.image && !asked.has(p.id)).map(p => p.id);
        need.forEach(id => asked.add(id));
        if (need.length) Promise.resolve().then(() => o.loadImages(need)).then(m => {
          let hit = false;
          for (const p of list) { const u = safeUrl(m && m[p.id]); if (!p.image && u) { p.image = u; hit = true; } }
          if (hit && el.isConnected) paint();
        }).catch(() => {});
      }
    };
    sel.onchange = () => { lim = 20; paint(); };
    paint();
    if (target) target.append(el);
    return el;
  }

  // ---------- Devoluções ----------
  // o: { n, valor (centavos), paid (pedidos pagos), prev: {n, valor, paid} | null (sem base) | undefined (consultando),
  //      reasons: [{label, n}], statuses: [{label, tone ('g'|'am'|'rd'|'gy'|'cy'), color?, n, open}],
  //      list: [{product, image, variation, date, orderId, reason, reasonTitle, refund, statusLabel, statusTone}],
  //      listCaption, accent, accent2, bar, accentText }
  function returnsView(target, o = {}) {
    const el = rootEl(o);
    const n0 = Number(o.n) || 0, paid = Number(o.paid) || 0, pv = o.prev;
    const old = f => pv === undefined ? undefined : (pv ? (Number(f(pv)) || 0) : 0);
    const taxa = paid > 0 ? n0 / paid * 100 : 0;
    const taxaOld = pv === undefined ? undefined : (pv && pv.paid > 0 ? (Number(pv.n) || 0) / pv.paid * 100 : 0);
    const statuses = (o.statuses || []).filter(s => (Number(s.n) || 0) > 0);
    const andamento = statuses.reduce((a, s) => a + (s.open ? Number(s.n) || 0 : 0), 0);
    const colorOf = s => hex(s.color) || TONE[s.tone] || 'var(--c)';
    const kpis = `<div class="ck-grid ck-k4" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[
      kc('Devoluções', 'ph-arrow-u-up-left', num(n0), delta(n0, old(p => p.n), true)),
      kc('Taxa de devolução', 'ph-percent', pct(taxa, 2), delta(taxa, taxaOld, true), { alt: true }),
      kc('Valor devolvido', 'ph-currency-circle-dollar', brl(o.valor), delta(Number(o.valor) || 0, old(p => p.valor), true)),
      kc('Em andamento', 'ph-hourglass', num(andamento), muted('aguardando conclusão'), { alt: true }),
    ].join('')}</div>`;
    const mot = new Map(); for (const m of o.reasons || []) { const k = String(m.label || 'Sem motivo'); mot.set(k, (mot.get(k) || 0) + (Number(m.n) || 0)); }
    const motList = [...mot].filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const motTot = motList.reduce((a, x) => a + x[1], 0);
    const shade = i => i === 0 ? 'var(--p)' : i < 3 ? 'color-mix(in srgb,var(--p) 62%,#fff)' : 'color-mix(in srgb,var(--p) 30%,#fff)';
    const motivos = `<div class="ck-card">${chead('Motivos', num(motTot) + ' devoluções com motivo informado')}<div class="ck-fill">${motList.length ? `<div>${hbars(motList.map(([k, v], i) => [k, v, shade(i)]), 170)}</div>` : '<p class="ck-cap">Sem devoluções no período.</p>'}<div class="ck-note" style="margin-top:12px"><i class="ph ph-info"></i><span>Taxa de devolução = devoluções ÷ pedidos pagos (${num(paid)})</span></div></div></div>`;
    const stl = new Map(); for (const s of statuses) { const l = String(s.label || '—'); const cur = stl.get(l) || [l, 0, colorOf(s)]; cur[1] += Number(s.n) || 0; stl.set(l, cur); }
    const stList = [...stl.values()].sort((a, b) => b[1] - a[1]);
    const stTot = stList.reduce((a, x) => a + x[1], 0);
    const status = `<div class="ck-card">${chead('Por status', 'Situação das ' + num(stTot) + ' devoluções')}${stList.length ? `<div class="ck-fill ck-donut" style="flex-direction:row;align-items:center;gap:18px;justify-content:flex-start">${donut(stList, 'devoluções', 140)}<div style="flex:1;min-width:0">${legend(stList)}</div></div>` : '<p class="ck-cap">Sem devoluções no período.</p>'}</div>`;
    const lst = (o.list || []).slice();
    const labels = [...new Set(lst.map(d => String(d.statusLabel || '—')))];
    const cntBy = l => lst.filter(d => String(d.statusLabel || '—') === l).length;
    const chips = ['Todas', ...labels.sort((a, b) => cntBy(b) - cntBy(a))];
    el.innerHTML = kpis + `<div class="ck-grid ck-cols ck-mt" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">${motivos}${status}</div>`
      + `<div class="ck-card ck-mt">${chead('Devoluções', esc(o.listCaption || ('Últimas ' + num(lst.length) + ' solicitações do período')))}<div class="ck-chead" style="align-items:center;flex-wrap:wrap;margin-bottom:12px"><div class="ck-chips">${chips.map((c, i) => `<button type="button" class="ck-chip${i ? '' : ' on'}" data-c="${esc(c)}">${esc(c)}${i ? ' · ' + num(cntBy(c)) : ''}</button>`).join('')}</div><label class="ck-search"><i class="ph ph-magnifying-glass"></i><input type="search" placeholder="Buscar pedido ou produto" aria-label="Buscar pedido ou produto"></label></div><div class="ck-scroll ck-dtbl"></div></div>`;
    const tb = el.querySelector('.ck-dtbl'), inp = el.querySelector('input'); let chip = 'Todas';
    const paint = () => {
      const q = inp.value.trim().toLowerCase();
      const arr = lst.filter(d => (chip === 'Todas' || String(d.statusLabel || '—') === chip) && (!q || String(d.orderId || '').toLowerCase().includes(q) || String(d.product || '').toLowerCase().includes(q) || String(d.reason || '').toLowerCase().includes(q)));
      tb.innerHTML = arr.length ? `<table class="ck-tbl"><thead><tr><th>Produto</th><th>Pedido</th><th>Motivo</th><th class="r">Valor</th><th>Status</th></tr></thead><tbody>${arr.map(d => `<tr><td><span class="ck-pn">${foto(d.image)}${pname(d.product || 'Produto', 300, [d.variation, d.date].filter(Boolean).map(esc).join(' · '))}</span></td><td class="nw" style="font-size:12.5px">${esc(d.orderId || '—')}</td><td class="nw" title="${esc(d.reasonTitle || d.reason || '')}">${esc(d.reason || 'Sem motivo')}</td><td class="r"><b>${brl(d.refund)}</b></td><td>${pill(d.statusLabel || '—', d.statusTone || 'gy')}</td></tr>`).join('')}</tbody></table>` : '<div class="ck-wait">Nenhuma devolução neste filtro.</div>';
      fixImgs(tb);
    };
    el.querySelectorAll('.ck-chip').forEach(b => b.onclick = () => { chip = b.dataset.c; el.querySelectorAll('.ck-chip').forEach(x => x.classList.toggle('on', x === b)); paint(); });
    inp.oninput = paint; paint();
    fixImgs(el);
    if (target) target.append(el);
    return el;
  }

  // mensagem simples (carregando / erro) no mesmo visual
  function message(target, text, o = {}) { const el = rootEl(o); el.innerHTML = `<div class="ck-card"><div class="ck-wait">${esc(text)}</div></div>`; if (target) target.append(el); return el; }

  root.ChannelKit = { productsView, returnsView, message, aggregate, shortName, esc, safeUrl };
})(window);
