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
    .ck .ck-empty{padding:26px;color:var(--mut);font-size:13px;text-align:center}
    .ck .ck-red{color:#dc2626!important}
    .ck .ck-stack{display:flex;flex-direction:column;gap:16px;min-width:0}
    .ck .ck-link,.ck .ck-link:hover:not(:disabled){background:none;border:0;padding:0;color:var(--p3);font:600 13px "DM Sans",system-ui,sans-serif;cursor:pointer;white-space:nowrap;text-decoration:none}
    .ck .ck-link:hover:not(:disabled){text-decoration:underline}
    .ck .ck-tbl tr.ck-click{cursor:pointer}.ck .ck-tbl tr.ck-click:hover td{background:#fafafa}
    .ck .ck-tbl td small,.ck .ck-sm{display:block;font-size:12px;color:var(--mut);white-space:nowrap}
    .ck .ck-stt,.ck .ck-stt:hover:not(:disabled){border:1px solid var(--ln);background:#fff;border-radius:12px;padding:12px 14px;min-width:0;cursor:pointer;text-align:left;font:inherit;color:inherit}
    .ck .ck-stt .ck-lbl{display:flex;align-items:center;gap:6px}.ck .ck-stt .ck-lbl i{width:8px;height:8px;border-radius:3px;flex:none}
    .ck .ck-stt b{display:block;font-size:21px;margin-top:6px}
    .ck .ck-stt:hover:not(:disabled){border-color:#d1d5db}
    .ck .ck-stt.on,.ck .ck-stt.on:hover:not(:disabled){background:#111827;border-color:#111827}.ck .ck-stt.on .ck-lbl{color:#cbd5e1}.ck .ck-stt.on b{color:#fff!important}
    .ck .ck-pag{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;font-size:12.5px;color:var(--mut);flex-wrap:wrap}
    .ck .ck-pg{display:flex;gap:4px;flex-wrap:wrap}.ck .ck-pg button,.ck .ck-pg button:hover:not(:disabled){min-width:30px;height:30px;border:1px solid var(--ln);border-radius:8px;display:grid;place-items:center;font:600 12.5px "DM Sans",system-ui,sans-serif;color:#374151;background:#fff;padding:0 6px;cursor:pointer}.ck .ck-pg button.on,.ck .ck-pg button.on:hover:not(:disabled){background:#111827;color:#fff;border-color:#111827}.ck .ck-pg button:disabled{opacity:.45;cursor:default}.ck .ck-pg span{min-width:20px;height:30px;display:grid;place-items:center}
    .ck .ck-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .ck .ck-prog{height:8px;background:#f3f4f6;border-radius:9px;overflow:hidden;display:block}.ck .ck-prog i{display:block;height:100%;border-radius:9px}
    .ck .ck-stackbar{display:flex;height:12px;border-radius:99px;overflow:hidden;margin:4px 0 10px;gap:2px}.ck .ck-stackbar i{display:block;cursor:crosshair}
    .ck .ck-dark{background:#111827;color:#fff;border-radius:14px;padding:18px 22px;display:flex;flex-direction:column;justify-content:center;gap:10px;min-width:0;position:relative;overflow:hidden}
    .ck .ck-dark .ck-acc{position:absolute;top:0;left:22px;width:46px;height:4px;border-radius:0 0 6px 6px;background:linear-gradient(90deg,var(--c),var(--b1))}
    .ck .ck-dark-h{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px}
    .ck .ck-logo{width:30px;height:30px;flex:0 0 30px;border-radius:8px;background:#fff;display:grid;place-items:center;overflow:hidden}.ck .ck-logo img{width:22px;height:22px;object-fit:contain}
    .ck .ck-dark-v{font-size:clamp(24px,2.3vw,32px);font-weight:700;letter-spacing:-.03em;white-space:nowrap;color:#4ade80;overflow:hidden;text-overflow:ellipsis}
    .ck .ck-dark .ck-up{color:#4ade80}.ck .ck-dark .ck-down{color:#fca5a5}.ck .ck-dark .ck-mut{color:#ffffffa6}
    .ck .ck-fin{display:grid;gap:16px;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(0,1.3fr)}
    .ck .ck-svg{width:100%;height:auto;display:block}
    .ck .hv .gl{opacity:0}.ck .hv:hover .gl{opacity:1}.ck .hv:hover .bb{opacity:1!important}
    .ck .ck-legend{display:flex;gap:14px;font-size:12.5px;white-space:nowrap;flex-wrap:wrap}.ck .ck-legend span{display:flex;gap:6px;align-items:center}
    .ck .ck-rcard{border:1px solid var(--ln);border-radius:12px;padding:12px;min-width:0;display:flex;flex-direction:column}
    /* atendimento: lista | conversa | painel */
    .ck .ck-chat{display:grid;grid-template-columns:290px minmax(0,1fr) 300px;height:680px;padding:0;overflow:hidden}
    .ck .ck-chat.two{grid-template-columns:290px minmax(0,1fr)}
    .ck .ck-clist{border-right:1px solid var(--ln);display:flex;flex-direction:column;min-width:0;min-height:0}
    .ck .ck-clist .hd{padding:14px;border-bottom:1px solid var(--ln)}
    .ck .ck-clist .items{overflow-y:auto;flex:1;min-height:0}
    .ck .ck-clist .ft{border-top:1px solid var(--ln);padding:8px 14px}
    .ck .ck-ci,.ck .ck-ci:hover:not(:disabled){display:flex;gap:10px;padding:12px 14px;border:0;border-bottom:1px solid #f5f5f5;cursor:pointer;min-width:0;width:100%;background:transparent;text-align:left;font:inherit;color:inherit;border-radius:0}
    .ck .ck-ci:hover:not(:disabled){background:#fafafa}.ck .ck-ci.on,.ck .ck-ci.on:hover:not(:disabled){background:var(--p2)}
    .ck .ck-ci .tx{flex:1;min-width:0}.ck .ck-ci .top{display:flex;justify-content:space-between;gap:8px}.ck .ck-ci .top b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13.5px}.ck .ck-ci .top small{color:var(--mut);white-space:nowrap;font-size:11.5px}
    .ck .ck-ci .pv{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:3px}.ck .ck-ci .pv span{font-size:12.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ck .ck-badge{background:var(--p);color:var(--pt,#fff);font-size:11px;font-weight:700;border-radius:999px;min-width:19px;height:19px;padding:0 6px;display:grid;place-items:center;flex:none}
    .ck .ck-av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px;flex:0 0 38px;color:#fff;background:linear-gradient(135deg,var(--p),var(--c));object-fit:cover;text-transform:uppercase}
    .ck .ck-thread{display:flex;flex-direction:column;min-width:0;min-height:0}
    .ck .ck-thread .hd{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--ln);min-height:59px}
    .ck .ck-msgs{flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px;background:#fafafa;min-height:0}
    .ck .ck-bub{max-width:66%;padding:9px 13px;font-size:13.5px;line-height:1.4;word-break:break-word;white-space:pre-wrap}
    .ck .ck-bub.c{background:#eef0f3;color:#111827;align-self:flex-start;border-radius:14px 14px 14px 4px}
    .ck .ck-bub.s{background:var(--p);color:var(--pt,#fff);align-self:flex-end;border-radius:14px 14px 4px 14px}
    .ck .ck-bub.bot{background:#e5e7eb;color:#374151;align-self:flex-end;border-radius:14px 14px 4px 14px}
    .ck .ck-bub em{display:block;font-style:normal;font-size:11px;font-weight:700;opacity:.75;margin-bottom:2px;white-space:normal}
    .ck .ck-bub small{display:block;font-size:10.5px;opacity:.65;margin-top:3px;text-align:right;white-space:normal}
    .ck .ck-sysn{align-self:center;font-size:11.5px;color:var(--mut);background:#fff;border:1px solid var(--ln);border-radius:999px;padding:3px 12px;text-align:center;max-width:90%}
    .ck .ck-comp{display:flex;gap:10px;align-items:flex-end;padding:12px 16px;border-top:1px solid var(--ln);background:#fff}
    .ck .ck-comp textarea{flex:1;border:1px solid var(--ln);border-radius:10px;padding:10px 12px;min-width:0;resize:none;font:inherit;font-size:13.5px;color:var(--ink);max-height:110px;min-height:0;background:#fff}
    .ck .ck-senderr{color:#dc2626;font-size:12px;padding:0 16px 8px;background:#fff}
    .ck .ck-btn:disabled{opacity:.55;cursor:not-allowed}
    .ck .ck-cpanel{border-left:1px solid var(--ln);overflow-y:auto;padding:16px;min-width:0}
    .ck .ck-cpanel .ck-kv{font-size:13px;padding:8px 0}
    .ck .ck-cpanel h4{margin:16px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
    .ck .ck-cpanel a{color:var(--p3);font-weight:600;font-size:13px;text-decoration:none}
    @media(max-width:1100px){.ck .ck-cols{grid-template-columns:minmax(0,1fr)!important}.ck .ck-k4{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ck label.ck-search{min-width:0;flex:1}
      .ck .ck-fin{grid-template-columns:repeat(3,minmax(0,1fr))}.ck .ck-fin>.ck-dark{grid-column:1/-1}.ck .ck-tiles{grid-template-columns:repeat(3,minmax(0,1fr))!important}.ck .ck-r5{grid-template-columns:repeat(3,minmax(0,1fr))!important}
      .ck .ck-chat,.ck .ck-chat.two{grid-template-columns:minmax(0,1fr);height:auto}.ck .ck-clist{border-right:0;border-bottom:1px solid var(--ln);max-height:340px}.ck .ck-thread{height:520px}.ck .ck-cpanel{border-left:0;border-top:1px solid var(--ln)}}
    @media(max-width:620px){.ck .ck-fin,.ck .ck-k4,.ck .ck-k3{grid-template-columns:minmax(0,1fr)!important}.ck .ck-tiles,.ck .ck-r5{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ck .ck-bub{max-width:85%}.ck .ck-pgrid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.ck .ck-foto.big{height:130px}.ck .ck-donut{flex-direction:column!important;align-items:stretch!important}.ck .ck-donut>svg{align-self:center}}`;
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

  // ---------- peças reutilizáveis (Pedidos, Financeiro, Estoque, Atendimento) ----------
  const dtBr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const dateBr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  const when = v => { if (!v) return '—'; const d = new Date(v); return Number.isFinite(d.getTime()) ? dtBr.format(d).replace(',', '') : '—'; };
  const whenDate = v => { if (!v) return '—'; const d = new Date(v); return Number.isFinite(d.getTime()) ? dateBr.format(d) : '—'; };
  const compactBrl = c => 'R$ ' + new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format((Number(c) || 0) / 100);
  const compactNum = v => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v) || 0);
  const openBtn = (text, i) => `<button type="button" class="ck-link ck-open" data-i="${Number(i) || 0}">${esc(text)}</button>`;
  // kpis: [[rótulo, ícone, valor (html já seguro), sub (html já seguro), {alt, money}]]
  const kpis = (items, cols) => `<div class="ck-grid ${(cols || items.length) >= 4 ? 'ck-k4' : 'ck-k3'}" style="grid-template-columns:repeat(${cols || items.length},minmax(0,1fr))">${items.map(([l, ic, v, s, op], i) => kc(l, ic, v, s, { alt: i % 2 === 1, ...(op || {}) })).join('')}</div>`;
  const donutBlock = (entries, unit) => { const es = (entries || []).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]); return es.length ? `<div class="ck-fill ck-donut" style="flex-direction:row;align-items:center;gap:18px;justify-content:flex-start">${donut(es, unit || 'pedidos', 140)}<div style="flex:1;min-width:0">${legend(es)}</div></div>` : '<p class="ck-cap">Nenhum registro para este gráfico.</p>'; };
  function stackBar(items) { const tot = items.reduce((s, x) => s + x[1], 0) || 1; return `<div class="ck-stackbar">${items.filter(x => x[1] > 0).map(([l, v, c]) => `<i data-tip="${esc(l)}|${num(v)} · ${pct(v / tot * 100)}" style="flex:${v};background:${esc(c)}"></i>`).join('')}</div>`; }
  function csv(name, rows) {
    const text = rows.map(r => r.map(v => { let s = String(v == null ? '' : v); if (/^[=+@-]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })); a.download = name;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  const csvMoney = c => ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');
  const fmtAx = (v, kind) => kind === 'brl' ? compactBrl(v) : compactNum(Math.round(v));
  const fmtV = (v, kind) => kind === 'brl' ? brl(v) : num(v);
  function axis(w, h, l, r, t, b, max, X, dates, kind) {
    let g = '';
    for (let i = 0; i <= 4; i++) { const y = t + (h - t - b) * i / 4; g += `<line x1="${l}" x2="${w - r}" y1="${y}" y2="${y}" stroke="#f0f1f4"/><text x="${l - 8}" y="${y + 4}" text-anchor="end">${fmtAx(max * (1 - i / 4), kind)}</text>`; }
    const L = dates.length, idx = L <= 1 ? [0] : [...new Set([0, 1, 2, 3, 4].map(k => Math.round(k * (L - 1) / 4)))];
    idx.forEach(i => { if (dates[i]) g += `<text x="${X(i)}" y="${h - 7}" text-anchor="${i === 0 && L > 1 ? 'start' : i === L - 1 && L > 1 ? 'end' : 'middle'}">${ddmm(dates[i])}</text>`; });
    return g;
  }
  const svgWrap = (w, h, g) => `<svg class="ck-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
  function barChart(dates, vals, { w = 1300, h = 240, kind = 'brl', name = 'Valor', empty = 'Sem valor' } = {}) {
    if (!dates.length) return '<p class="ck-cap">Sem dados no período.</p>';
    const l = 64, r = 14, t = 10, b = 26, max = Math.max(1, ...vals) * 1.12, st = (w - l - r) / dates.length, X = i => l + (i + .5) * st, Y = v => h - b - v / max * (h - t - b), bw = st * .6;
    let g = axis(w, h, l, r, t, b, max, X, dates, kind);
    vals.forEach((v, i) => { g += `<g class="hv" data-tip="${ddmm(dates[i])}|${v ? esc(name) + ': ' + fmtV(v, kind) : esc(empty)}"><rect x="${X(i) - st / 2}" y="${t}" width="${st}" height="${h - t - b}" fill="transparent"/><rect class="bb" x="${X(i) - bw / 2}" y="${Y(v)}" width="${bw}" height="${Math.max(0, h - b - Y(v))}" rx="3" fill="var(--c)" opacity=".85"/></g>`; });
    return svgWrap(w, h, g);
  }
  // cascata: steps = [[nome, centavos, total?]] (total = barra cheia; senão é variação)
  function waterfall(steps, { w = 900, h = 380 } = {}) {
    const l = 64, r = 14, t = 24, b = 30, max = Math.max(1, ...steps.map(s => Math.abs(s[1]))) * 1.08, st = (w - l - r) / steps.length, bw = st * .56, Y = v => h - b - v / max * (h - t - b);
    let g = ''; for (let i = 0; i <= 4; i++) { const y = t + (h - t - b) * i / 4; g += `<line x1="${l}" x2="${w - r}" y1="${y}" y2="${y}" stroke="#f0f1f4"/><text x="${l - 8}" y="${y + 4}" text-anchor="end">${fmtAx(max * (1 - i / 4), 'brl')}</text>`; }
    let run = 0;
    steps.forEach(([nm, v, tp], i) => {
      const x = l + i * st + (st - bw) / 2; let y0, y1, c;
      if (tp) { y0 = 0; y1 = v; run = v; c = i ? GREEN : '#111827'; } else { y0 = run + v; y1 = run; run += v; c = v < 0 ? 'var(--p)' : GREEN; }
      const top = Y(Math.max(y0, y1)), hh = Math.max(2, Math.abs(Y(y0) - Y(y1)));
      const lab = tp ? fmtAx(v, 'brl') : (v < 0 ? '−' : '+') + fmtAx(Math.abs(v), 'brl').replace('R$ ', '');
      g += `<g class="hv" data-tip="${esc(nm)}|${tp ? '' : v < 0 ? '− ' : '+ '}${brl(Math.abs(v))}"><rect x="${l + i * st}" y="${t}" width="${st}" height="${h - t - b}" fill="transparent"/><rect class="bb" x="${x}" y="${top}" width="${bw}" height="${hh}" rx="4" fill="${c}" opacity=".92"/><text x="${x + bw / 2}" y="${top - 6}" text-anchor="middle" style="font-size:10.5px;fill:#374151;font-weight:600">${lab}</text><text x="${x + bw / 2}" y="${h - 10}" text-anchor="middle">${esc(nm)}</text></g>`;
      if (i < steps.length - 1) g += `<line x1="${x + bw}" x2="${x + st}" y1="${Y(run)}" y2="${Y(run)}" stroke="#cbd5e1" stroke-dasharray="3 3"/>`;
    });
    return svgWrap(w, h, g);
  }

  // Lista no desenho de Pedidos do TikTok: quadros de status (tiles) ou chips, busca, filtros, tabela e paginação.
  // o: { groups: [{key, label, color}] (1º = todos, key ''), groupOf(row), tiles (true = quadros acima; false = chips no card),
  //      counts (opcional, contagens fixas), title, caption, search (placeholder | null), selects: [{label, options:[[v,t]], test(row, v)}],
  //      columns: [{h, cls, cell(row, i) -> html seguro}], rows | fetch({group, q, page}) -> Promise<{rows, total, counts}>,
  //      pageSize, state {group, q, page, sel}, onOpen(row), afterPaint(rows, trs), onFilter(rows), csv: {name, rows(filtered) -> [[...]]},
  //      above(node) (monta gráficos entre os quadros e a tabela), emptyText, rowClick }
  function mountList(el, o) {
    const st = o.state || {}; st.group = st.group || ''; st.q = st.q || ''; st.page = st.page || 1; st.sel = st.sel || {};
    const per = o.pageSize || 10, groups = o.groups || [], remote = typeof o.fetch === 'function';
    const tiles = document.createElement('div');
    if (groups.length && o.tiles !== false) { tiles.className = 'ck-grid ck-tiles'; tiles.style.cssText = `grid-template-columns:repeat(${Math.min(6, groups.length)},minmax(0,1fr));gap:10px;margin-bottom:16px`; el.append(tiles); }
    if (typeof o.above === 'function') { const a = document.createElement('div'); el.append(a); o.above(a); }
    const card = document.createElement('div'); card.className = 'ck-card';
    const selHtml = (o.selects || []).map((s, i) => `<select class="ck-select" data-s="${i}" aria-label="${esc(s.label)}">${s.options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>`).join('');
    const right = `${o.search !== null ? `<label class="ck-search"><i class="ph ph-magnifying-glass"></i><input type="search" placeholder="${esc(o.search || 'Buscar')}" aria-label="${esc(o.search || 'Buscar')}"></label>` : ''}${selHtml}${o.csv ? '<button type="button" class="ck-btn ghost sm ck-csv"><i class="ph ph-download-simple"></i>Exportar CSV</button>' : ''}`;
    card.innerHTML = `<div class="ck-chead" style="align-items:center;flex-wrap:wrap;margin-bottom:12px"><div class="ck-min0"><h3>${esc(o.title || '')}</h3>${o.caption ? `<p class="ck-cap" style="margin:0">${esc(o.caption)}</p>` : ''}</div><div class="ck-filters">${right}</div></div>${groups.length && o.tiles === false ? '<div class="ck-chips" style="margin-bottom:12px"></div>' : ''}<div class="ck-scroll ck-ltbl"></div><div class="ck-pag"></div>`;
    el.append(card);
    const tbl = card.querySelector('.ck-ltbl'), pag = card.querySelector('.ck-pag'), inp = card.querySelector('input[type=search]'), chipsEl = card.querySelector('.ck-chips');
    if (inp) inp.value = st.q;
    card.querySelectorAll('select[data-s]').forEach(s => { s.value = st.sel[s.dataset.s] || ''; s.onchange = () => { st.sel[s.dataset.s] = s.value; st.page = 1; load(); }; });
    let token = 0, last = null;
    const paintGroups = (counts) => {
      const html = groups.map((g, i) => { const v = counts[g.key] || 0; return o.tiles === false
        ? `<button type="button" class="ck-chip${st.group === g.key ? ' on' : ''}" data-g="${esc(g.key)}">${esc(g.label)} · ${num(v)}</button>`
        : `<button type="button" class="ck-stt${st.group === g.key ? ' on' : ''}" data-g="${esc(g.key)}"><div class="ck-lbl"><i style="background:${esc(g.color || 'var(--p)')}"></i><span class="ck-one">${esc(g.label)}</span></div><b${g.red ? ' class="ck-red"' : ''}>${num(v)}</b></button>`; }).join('');
      const host = o.tiles === false ? chipsEl : tiles; if (!host) return;
      host.innerHTML = html;
      host.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { st.group = b.dataset.g; st.page = 1; load(); });
    };
    function paintPag(total, page) {
      const pages = Math.max(1, Math.ceil(total / per)), a = total ? (page - 1) * per + 1 : 0, b = Math.min(total, page * per);
      const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter(x => x >= 1 && x <= pages).sort((x, y) => x - y);
      let h = `<button type="button" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Anterior"><i class="ph ph-caret-left"></i></button>`, lastN = 0;
      for (const x of nums) { if (x - lastN > 1) h += '<span>…</span>'; h += `<button type="button" data-p="${x}" class="${x === page ? 'on' : ''}">${num(x)}</button>`; lastN = x; }
      h += `<button type="button" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Próxima"><i class="ph ph-caret-right"></i></button>`;
      pag.innerHTML = total > 0 ? `<span>Mostrando ${num(a)}–${num(b)} de ${num(total)}</span><div class="ck-pg">${h}</div>` : '';
      pag.querySelectorAll('button[data-p]').forEach(bt => bt.onclick = () => { const p = +bt.dataset.p; if (p >= 1 && p <= pages && p !== st.page) { st.page = p; load(); } });
    }
    function paintRows(list, total) {
      const pageRows = list;
      tbl.innerHTML = pageRows.length ? `<table class="ck-tbl"><thead><tr>${o.columns.map(c => `<th class="${esc(c.cls || '')}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${pageRows.map((r, i) => `<tr data-i="${i}"${o.rowClick && o.onOpen ? ' class="ck-click"' : ''}>${o.columns.map(c => `<td class="${esc(c.cls || '')}">${c.cell(r, i)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<div class="ck-wait">${esc(st.q ? 'Nada encontrado para essa busca.' : (o.emptyText || 'Nenhum registro neste filtro.'))}</div>`;
      fixImgs(tbl); paintPag(total, st.page);
      if (o.onOpen) {
        tbl.querySelectorAll('.ck-open').forEach(b => b.onclick = (e) => { e.stopPropagation(); const r = pageRows[+b.dataset.i]; if (r) o.onOpen(r); });
        if (o.rowClick) tbl.querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('a,button')) return; const r = pageRows[+tr.dataset.i]; if (r) o.onOpen(r); });
      }
      if (o.afterPaint) o.afterPaint(pageRows, [...tbl.querySelectorAll('tbody tr')]);
    }
    let filteredNow = [];
    function load() {
      const my = ++token;
      if (remote) {
        tbl.style.opacity = '.55'; if (!last) { tbl.innerHTML = '<div class="ck-wait">Carregando…</div>'; paintGroups(o.counts || {}); }
        Promise.resolve(o.fetch({ group: st.group, q: st.q, page: st.page })).catch(() => null).then(d => {
          if (my !== token) return; tbl.style.opacity = '';
          if (!d) { tbl.innerHTML = '<div class="ck-wait">Não consegui carregar agora. Tente Atualizar.</div>'; pag.innerHTML = ''; return; }
          last = d; paintGroups(d.counts || o.counts || {}); filteredNow = d.rows || []; paintRows(d.rows || [], Number(d.total) || 0);
        });
        return;
      }
      const q = st.q.toLowerCase();
      const base = (o.rows || []).filter(r => (!q || String(o.text ? o.text(r) : '').toLowerCase().includes(q)) && (o.selects || []).every((s, i) => !st.sel[i] || s.test(r, st.sel[i])));
      const counts = o.counts || {}; if (!o.counts) { counts[''] = base.length; for (const r of base) { const k = o.groupOf ? o.groupOf(r) : ''; if (k) counts[k] = (counts[k] || 0) + 1; } }
      paintGroups(counts);
      const arr = st.group ? base.filter(r => o.groupOf && o.groupOf(r) === st.group) : base;
      filteredNow = arr;
      const pages = Math.max(1, Math.ceil(arr.length / per)); if (st.page > pages) st.page = pages;
      if (o.onFilter) o.onFilter(arr);
      paintRows(arr.slice((st.page - 1) * per, st.page * per), arr.length);
    }
    let t; if (inp) inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { const q = inp.value.trim(); if (q === st.q) return; st.q = q; st.page = 1; load(); }, remote ? 400 : 150); };
    const cb = card.querySelector('.ck-csv'); if (cb) cb.onclick = () => csv(o.csv.name, o.csv.rows(filteredNow));
    load();
    return { reload: load };
  }
  function ordersView(target, o = {}) {
    const el = rootEl(o);
    if (o.before) el.insertAdjacentHTML('beforeend', o.before);
    const api = mountList(el, o);
    fixImgs(el); if (target) target.append(el); el.ckList = api; return el;
  }

  // Financeiro: destaque escuro + KPIs, cascata do bruto ao líquido, quebra por grupo, barras por dia e lista.
  // o: { logo, hero: {title, value, sub (html seguro), foot (html seguro)}, kpis: [...como kpis()], waterfall: {title, caption, steps},
  //      side: {title, caption, rows: [{label, sub, value, n, color}], total: {label, value}, note}, bars: {title, caption, dates, vals, name, kind},
  //      list: {...opções de mountList} }
  function financeView(target, o = {}) {
    const el = rootEl(o);
    const h = o.hero || {};
    const logo = safeUrl(o.logo) || (/^[\w.-]+\.(png|ico|svg)$/i.test(String(o.logo || '')) ? o.logo : '');
    const hero = `<div class="ck-dark"><i class="ck-acc"></i><div class="ck-dark-h">${logo ? `<span class="ck-logo"><img src="${esc(logo)}" alt=""></span>` : ''}${esc(h.title || '')}</div><div class="ck-dark-v" title="${esc(brl(h.value))}">${brl(h.value)}</div>${h.sub ? `<div style="font-size:12.5px">${h.sub}</div>` : ''}${h.foot ? `<div style="font-size:12px;color:#9ca3af">${h.foot}</div>` : ''}</div>`;
    let html = `<div class="ck-fin">${(o.kpis || []).map(([l, ic, v, s, op], i) => kc(l, ic, v, s, { alt: i % 2 === 0, ...(op || {}) })).join('')}${hero}</div>`;
    const blocks = [];
    if (o.waterfall) blocks.push(`<div class="ck-card">${chead(esc(o.waterfall.title), esc(o.waterfall.caption || ''))}<div class="ck-push">${o.waterfall.steps && o.waterfall.steps[0] && o.waterfall.steps[0][1] ? waterfall(o.waterfall.steps.filter(x => x[2] || x[1])) : '<p class="ck-cap">Sem valores no período.</p>'}</div></div>`);
    if (o.side) {
      const s = o.side, tot = s.rows.reduce((a, r) => a + (Number(r.value) || 0), 0);
      blocks.push(`<div class="ck-card">${chead(esc(s.title), esc(s.caption || ''))}<div class="ck-fill">${s.rows.length ? s.rows.map(r => `<div style="padding:12px 0;border-bottom:1px solid #f3f4f6"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><span style="display:flex;gap:8px;align-items:center;min-width:0">${legendDot(r.color || 'var(--p)')}<b class="ck-one">${esc(r.label)}</b></span><b class="${r.red ? 'ck-red' : 'ck-money'}">${brl(r.value)}</b></div><div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--mut);margin:3px 0 6px 18px"><span class="ck-one">${esc(r.sub || '')}</span><span style="white-space:nowrap">${esc(r.n || '')}</span></div><span class="ck-prog" style="height:6px;margin-left:18px"><i style="width:${tot > 0 ? Math.max(0, (Number(r.value) || 0) / tot * 100) : 0}%;background:${esc(r.color || 'var(--p)')}"></i></span></div>`).join('') : '<p class="ck-cap">Sem valores no período.</p>'}
        ${s.total ? `<div class="ck-kv" style="font-size:14.5px"><span><b>${esc(s.total.label)}</b></span><b class="ck-money">${brl(s.total.value)}</b></div>` : ''}${s.note ? `<p class="ck-cap" style="margin:4px 0 0">${esc(s.note)}</p>` : ''}</div></div>`);
    }
    if (blocks.length) html += `<div class="ck-grid ck-cols ck-mt" style="grid-template-columns:${blocks.length > 1 ? 'minmax(0,1.7fr) minmax(0,1fr)' : 'minmax(0,1fr)'}">${blocks.join('')}</div>`;
    if (o.bars) html += `<div class="ck-mt"><div class="ck-card">${chead(esc(o.bars.title), esc(o.bars.caption || ''))}<div class="ck-push">${barChart(o.bars.dates || [], o.bars.vals || [], { name: o.bars.name, kind: o.bars.kind || 'brl', empty: o.bars.empty })}</div></div></div>`;
    el.innerHTML = html;
    if (o.list) { const w = document.createElement('div'); w.className = 'ck-mt'; el.append(w); mountList(w, o.list); }
    fixImgs(el); if (target) target.append(el); return el;
  }

  // Estoque: KPIs, "Repor primeiro" (5 cards) e a tabela do catálogo (via mountList).
  // o: { kpis: [...], repor: {title, caption, items: [{title, image, sub, pillText, pillTone}], csv: {name, rows()}}, list: {...mountList} }
  function stockView(target, o = {}) {
    const el = rootEl(o);
    let html = o.kpis ? kpis(o.kpis, 4) : '';
    if (o.repor) {
      const r = o.repor, it = (r.items || []).slice(0, 5);
      html += `<div class="ck-card ck-mt"><div class="ck-chead"><div class="ck-min0"><h3>${esc(r.title)}</h3><p class="ck-cap">${esc(r.caption || '')}</p></div>${r.csv ? `<button type="button" class="ck-btn sm ck-rcsv"${it.length ? '' : ' disabled'}><i class="ph ph-download-simple"></i>Exportar lista</button>` : ''}</div>
        ${it.length ? `<div class="ck-grid ck-r5" style="grid-template-columns:repeat(5,minmax(0,1fr));gap:12px">${it.map((x, i) => `<div class="ck-rcard"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px"><b style="color:${i < 3 ? 'var(--p)' : '#9ca3af'};font-size:18px">${i + 1}</b>${pill(x.pillText, x.pillTone || 'am')}</div>${foto(x.image, 'big', x.title).replace('class="ck-foto big"', 'class="ck-foto big" style="height:96px"')}<span style="min-width:0;margin-top:8px"><b class="ck-one" title="${esc(x.title)}" style="font-size:13px">${esc(shortName(x.title))}</b><span class="ck-mut ck-one" style="font-size:12px">${esc(x.sub || '')}</span></span></div>`).join('')}</div>` : `<p class="ck-cap">${esc(r.empty || 'Nenhuma variação precisando de reposição agora.')}</p>`}</div>`;
    }
    el.innerHTML = html;
    const b = el.querySelector('.ck-rcsv'); if (b) b.onclick = () => csv(o.repor.csv.name, o.repor.csv.rows());
    if (o.list) { const w = document.createElement('div'); w.className = 'ck-mt'; el.append(w); mountList(w, o.list); }
    fixImgs(el); if (target) target.append(el); return el;
  }

  // Atendimento: lista de conversas | conversa | painel lateral (opcional).
  // o: { search, chips: [{key, label}], chip, onChip(key), onSearch(q, api) (busca no servidor), load() -> Promise<items|null>, open(item, ui), side (bool), footer(node), emptyText }
  //    item: {id, name, avatar, time, preview, unread}; ui: {head(name, avatar, pillHtml), messages([{side:'c'|'s'|'bot'|'sys', text, time, tag}]),
  //    composer({send(text) -> Promise<bool>} | {note, disabled}), side(html seguro), wait(text), current() }
  const avatar = (url, name, size = 38) => { const u = safeUrl(url); const st = size !== 38 ? ` style="width:${size}px;height:${size}px;flex-basis:${size}px"` : ''; return u ? `<img class="ck-av" src="${esc(u)}" alt=""${st}>` : `<span class="ck-av"${st}>${esc(String(name || '?').trim().slice(0, 2) || '?')}</span>`; };
  function chatView(target, o = {}) {
    const el = rootEl(o);
    el.innerHTML = `<div class="ck-card ck-chat${o.side ? '' : ' two'}"><div class="ck-clist"><div class="hd"><label class="ck-search" style="min-width:0"><i class="ph ph-magnifying-glass"></i><input type="search" placeholder="${esc(o.search || 'Buscar')}" aria-label="${esc(o.search || 'Buscar')}"></label>${(o.chips || []).length ? `<div class="ck-chips" style="margin-top:10px">${o.chips.map(c => `<button type="button" class="ck-chip${c.key === o.chip ? ' on' : ''}" data-k="${esc(c.key)}">${esc(c.label)}</button>`).join('')}</div>` : ''}</div><div class="items"><div class="ck-empty">Carregando…</div></div><div class="ft" hidden></div></div>
      <div class="ck-thread"><div class="ck-empty" style="margin:auto">Selecione uma conversa à esquerda.</div></div>${o.side ? '<div class="ck-cpanel"><div class="ck-empty">Os detalhes aparecem aqui.</div></div>' : ''}</div>`;
    const items = el.querySelector('.items'), thread = el.querySelector('.ck-thread'), cpanel = el.querySelector('.ck-cpanel'), inp = el.querySelector('input'), ft = el.querySelector('.ft');
    let list = [], sel = null;
    const paintList = () => {
      const q = o.onSearch ? '' : inp.value.trim().toLowerCase();
      const arr = list.filter(c => !q || (String(c.name || '') + ' ' + String(c.preview || '') + ' ' + String(c.search || '')).toLowerCase().includes(q));
      items.innerHTML = arr.length ? arr.map(c => `<button type="button" class="ck-ci${sel === c.id ? ' on' : ''}" data-id="${esc(c.id)}">${c.image !== undefined ? foto(c.image) : avatar(c.avatar, c.name)}<div class="tx"><div class="top"><b>${esc(c.name || 'Cliente')}</b><small>${esc(c.time || '')}</small></div><div class="pv"><span>${esc(String(c.preview || '').replace(/\s+/g, ' '))}</span>${c.unread > 0 ? `<span class="ck-badge">${num(c.unread)}</span>` : ''}</div></div></button>`).join('') : `<div class="ck-empty">${esc(list.length ? 'Nada encontrado.' : (o.emptyText || 'Nenhuma conversa.'))}</div>`;
      fixImgs(items);
      items.querySelectorAll('.ck-ci').forEach(bt => bt.onclick = () => { const c = list.find(x => String(x.id) === bt.dataset.id); if (c) open(c); });
    };
    let st; inp.oninput = o.onSearch ? () => { clearTimeout(st); st = setTimeout(() => o.onSearch(inp.value.trim(), api), 400); } : paintList;
    el.querySelectorAll('.ck-chip[data-k]').forEach(b => b.onclick = () => { el.querySelectorAll('.ck-chip[data-k]').forEach(x => x.classList.toggle('on', x === b)); if (o.onChip) o.onChip(b.dataset.k, api); });
    const ui = c => ({
      current: () => sel === c.id,
      head: (name, av, pillHtml) => { if (sel !== c.id) return; thread.innerHTML = `<div class="hd">${av !== undefined && av !== null && typeof av === 'object' ? foto(av.image) : avatar(av, name, 34)}<b class="ck-one">${esc(name || 'Cliente')}</b><span style="margin-left:auto">${pillHtml || ''}</span></div><div class="ck-msgs"><div class="ck-empty">Carregando mensagens…</div></div>`; fixImgs(thread); },
      wait: (text) => { if (sel !== c.id) return; const m = thread.querySelector('.ck-msgs'); if (m) m.innerHTML = `<div class="ck-empty">${esc(text)}</div>`; },
      messages: (msgs, opt = {}) => {
        if (sel !== c.id) return; const m = thread.querySelector('.ck-msgs'); if (!m) return; const fromBottom = m.scrollHeight - m.scrollTop; m.replaceChildren();
        if (opt.more) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ck-btn ghost sm'; b.style.alignSelf = 'center'; b.textContent = opt.more.label || 'Carregar mensagens anteriores'; b.onclick = () => { b.disabled = true; b.textContent = 'Carregando…'; opt.more.onClick(); }; m.append(b); }
        for (const x of msgs || []) {
          if (x.side === 'sys') { const s = document.createElement('span'); s.className = 'ck-sysn'; s.textContent = x.text + (x.time ? ' · ' + x.time : ''); m.append(s); continue; }
          const b = document.createElement('div'); b.className = 'ck-bub ' + (x.side === 's' ? 's' : x.side === 'bot' ? 'bot' : 'c');
          if (x.tag) { const em = document.createElement('em'); em.textContent = x.tag; b.append(em); }
          b.append(document.createTextNode(String(x.text || '')));
          if (x.time) { const sm = document.createElement('small'); sm.textContent = x.time; b.append(sm); }
          m.append(b);
        }
        if (!m.querySelector('.ck-bub,.ck-sysn')) m.insertAdjacentHTML('beforeend', '<div class="ck-empty">Sem mensagens.</div>');
        m.scrollTop = opt.keep ? m.scrollHeight - fromBottom : m.scrollHeight;
      },
      composer: (cfg = {}) => {
        if (sel !== c.id) return; thread.querySelectorAll('.ck-comp,.ck-senderr').forEach(x => x.remove());
        const comp = document.createElement('div'); comp.className = 'ck-comp';
        comp.innerHTML = `<textarea rows="1" placeholder="${esc(cfg.placeholder || 'Escreva uma resposta…')}" aria-label="Mensagem"></textarea><button type="button" class="ck-btn"><i class="ph-fill ph-paper-plane-tilt"></i>${esc(cfg.label || 'Enviar')}</button>`;
        const err = document.createElement('div'); err.className = 'ck-senderr'; if (cfg.note) err.style.color = 'var(--mut)'; err.textContent = cfg.note || '';
        const ta = comp.querySelector('textarea'), btn = comp.querySelector('button');
        if (cfg.draft) { ta.value = cfg.draft.get() || ''; ta.oninput = () => cfg.draft.set(ta.value); }
        if (cfg.disabled || !cfg.send) btn.disabled = true;
        const send = async () => {
          const text = ta.value.trim(); if (!text || !cfg.send || btn.disabled) return; btn.disabled = true; err.style.color = ''; err.textContent = '';
          try { if (!(await cfg.send(text))) err.textContent = 'Não consegui enviar. Tente de novo.'; else { ta.value = ''; if (cfg.draft) cfg.draft.set(''); const m = thread.querySelector('.ck-msgs'); if (m) { m.querySelector('.ck-empty')?.remove(); const b = document.createElement('div'); b.className = 'ck-bub s'; b.textContent = text; const sm = document.createElement('small'); sm.textContent = 'agora'; b.append(sm); m.append(b); m.scrollTop = m.scrollHeight; } } }
          catch (e) { err.textContent = 'Não consegui enviar. Tente de novo.'; }
          btn.disabled = false;
        };
        btn.onclick = send; ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
        thread.append(comp, err);
      },
      readonly: (text) => { if (sel !== c.id) return; thread.querySelectorAll('.ck-comp,.ck-senderr').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'ck-comp'; d.style.cssText = 'justify-content:center;color:var(--mut);font-size:12.5px;gap:8px;align-items:center'; d.innerHTML = '<i class="ph ph-lock-simple"></i>'; d.append(document.createTextNode(text || 'Somente leitura')); const m = thread.querySelector('.ck-msgs'), atB = m && m.scrollHeight - m.scrollTop - m.clientHeight < 40; thread.append(d); if (atB) m.scrollTop = m.scrollHeight; },
      side: (html) => { if (sel !== c.id || !cpanel) return; cpanel.innerHTML = html; fixImgs(cpanel); },
    });
    function open(c) {
      sel = c.id; items.querySelectorAll('.ck-ci').forEach(b => b.classList.toggle('on', b.dataset.id === String(c.id)));
      thread.innerHTML = '<div class="ck-empty" style="margin:auto">Carregando…</div>';
      if (o.open) o.open(c, ui(c));
    }
    const api = {
      reload: (opt = {}) => { if (!opt.quiet) items.innerHTML = '<div class="ck-empty">Carregando…</div>'; return Promise.resolve(o.load ? o.load() : []).catch(() => null).then(d => {
        if (!d) { if (!opt.quiet) items.innerHTML = '<div class="ck-empty">Não consegui carregar agora.</div>'; return; }
        const top = items.scrollTop; list = d; const had = list.some(c => c.id === sel); if (!had) sel = null; paintList(); if (opt.quiet) items.scrollTop = top;
        if (opt.keepOpen && had) return;
        if (list.length) open(list.find(c => c.id === sel) || list.find(c => c.id === o.selected) || list[0]); else { thread.innerHTML = `<div class="ck-empty" style="margin:auto">${esc(o.emptyText || 'Nenhuma conversa.')}</div>`; if (cpanel) cpanel.innerHTML = ''; }
      }); },
      footer: (node) => { ft.replaceChildren(); if (node) { ft.append(node); ft.hidden = false; } else ft.hidden = true; },
      chipLabel: (key, text) => { const b = el.querySelector(`.ck-chip[data-k="${CSS.escape(key)}"]`); if (b) b.textContent = text; },
    };
    api.reload();
    if (target) target.append(el); el.ckChat = api; return el;
  }

  const h = { esc, safeUrl, brl, num, pct, ddmm, when, whenDate, pill, foto, pname, delta, muted, legendDot, openBtn, shortName, chead, csvMoney, stackBar, avatar };
  root.ChannelKit = { productsView, returnsView, message, ordersView, financeView, stockView, chatView, kpis, donutBlock, csv, aggregate, dayList, toDay, shortName, esc, safeUrl, h };
})(window);
