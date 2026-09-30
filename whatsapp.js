// WhatsApp de atendimento: KPIs + conversas no desenho do Atendimento do TikTok (channel-kit.js).
// O navegador só chama as rotas /api/whatsapp/* do nosso servidor; o token da Uazapi nunca chega aqui.
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  const K = window.ChannelKit, H = K.h, $ = id => document.getElementById(id);
  const KIT = { accent: '#128c7e', accent2: '#25d366', bar: '#25d366' };
  let client, csrfPromise;

  // ---------- acesso às rotas (produção: Bearer; painel local: também o cabeçalho anti-CSRF) ----------
  function csrf() {
    if (!csrfPromise) csrfPromise = fetch('/api/session').then(r => r.ok ? r.json() : {}).catch(() => ({}));
    return csrfPromise;
  }
  async function api(path, query = {}, retried = false, post) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) { location.href = 'login.html'; throw Error('Entre novamente.'); }
    const { csrf: token } = await csrf();
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const r = await fetch('/api/whatsapp/' + path + (String(qs) ? '?' + qs : ''), { method: post ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + session.access_token, ...(token ? { 'X-Cacife-Local': token } : {}), ...(post ? { 'Content-Type': 'application/json' } : {}) }, body: post ? JSON.stringify(post) : undefined });
    if (r.status === 403 && !retried && token) { csrfPromise = null; return api(path, query, true, post); }
    let d = null; try { d = await r.json(); } catch { /* sem corpo */ }
    if (!r.ok) throw Error((d && d.error) || 'WhatsApp indisponível no momento.');
    return d;
  }

  // ---------- formatação ----------
  const fone = d => { const s = String(d || ''); const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(s); return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : (s ? '+' + s : '—'); };
  const dayKey = iso => iso ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso)) : '';
  const hora = iso => iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '';
  const hoje = () => dayKey(new Date().toISOString());
  const quandoCurto = iso => { if (!iso) return ''; const k = dayKey(iso); if (k === hoje()) return hora(iso); const ontem = dayKey(new Date(Date.now() - 864e5).toISOString()); return k === ontem ? 'Ontem' : k.slice(8, 10) + '/' + k.slice(5, 7); };
  const diaLongo = iso => { const k = dayKey(iso); if (k === hoje()) return 'Hoje'; if (k === dayKey(new Date(Date.now() - 864e5).toISOString())) return 'Ontem'; return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso)); };
  const ha = iso => { if (!iso) return '—'; const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.floor(m / 60)} h` : `há ${Math.floor(m / 1440)} d`; };

  // ---------- estado ----------
  const st = { filtro: 'todas', q: '', pagina: 1, temMais: false, total: 0, itens: [], carregado: false, selecionada: null };
  let status = null, chat, kpiBox;
  const drafts = new Map(), painelIds = new Set(), enviadas = new Map(); // rascunho por conversa; ids das respostas enviadas daqui

  function paintStatus() {
    const c = $('wa-conn');
    if (!status) { c.textContent = 'Conexão indisponível'; c.className = 'wa-conn off'; }
    else { c.textContent = (status.connected ? 'Conectado' : 'Desconectado') + (status.numero ? ' · ' + status.numero : ''); c.className = 'wa-conn ' + (status.connected ? 'on' : 'off'); }
    if (!kpiBox) return;
    const s = status || {};
    kpiBox.innerHTML = K.kpis([
      ['Conversas', 'ph-chats-circle', status ? H.esc(H.num(s.conversas)) : '—', H.muted('conversas 1:1 com mensagem · sem grupos')],
      ['Não lidas', 'ph-envelope-simple', status ? `<span${s.naoLidas ? ' class="ck-red"' : ''}>${H.esc(H.num(s.naoLidas))}</span>` : '—', H.muted('conversas com mensagem não lida')],
      ['Última mensagem', 'ph-clock', H.esc(ha(s.ultimaMsgEm)), H.muted(s.ultimaMsgEm ? H.when(s.ultimaMsgEm) : 'sem mensagens')],
      ['Conexão', 'ph-plugs-connected', status ? (s.connected ? '<span style="color:#16a34a">Conectado</span>' : '<span class="ck-red">Desconectado</span>') : '—', H.muted([s.nome, s.numero].filter(Boolean).join(' · ') || 'número de atendimento')],
    ], 4);
  }
  async function loadStatus() { try { status = await api('status'); } catch { status = null; } paintStatus(); }

  async function fetchPage(p) {
    const d = await api('chats', { page: p, q: st.q, filtro: st.filtro === 'nao_lidas' ? 'nao_lidas' : undefined });
    st.pagina = d.pagina; st.temMais = !!d.temMais; st.total = d.total || 0;
    const novos = (d.conversas || []).filter(c => !st.itens.some(x => x.id === c.id));
    st.itens = p === 1 ? d.conversas || [] : st.itens.concat(novos);
    st.carregado = true;
  }
  const toItem = c => ({ id: c.id, c, name: c.nome, avatar: c.foto, time: quandoCurto(c.quando), preview: c.ultimaMsg || '', unread: c.naoLidas, search: c.telefone });
  function footer() {
    const d = document.createElement('div'); d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:#6b7280';
    const t = document.createElement('span'); t.textContent = `${H.num(st.itens.length)} de ${H.num(st.total)} conversas`; d.append(t);
    if (st.temMais) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ck-link'; b.textContent = 'Carregar mais';
      b.onclick = async () => { b.disabled = true; b.textContent = 'Carregando…'; try { await fetchPage(st.pagina + 1); } catch { b.textContent = 'Tente de novo'; b.disabled = false; return; } chat.ckChat.reload({ keepOpen: true, quiet: true }); };
      d.append(b);
    }
    return d;
  }

  function msgView(m) {
    let text = m.texto || '';
    if (m.tipo === 'reacao') text = 'Reagiu ' + (m.texto || '');
    else if (m.rotulo) text = [m.rotulo, m.arquivo, m.texto].filter(Boolean).join(' · ');
    const painel = m.deMim && (m.painel || painelIds.has(m.id));
    return { side: m.deMim ? (m.auto && !painel ? 'bot' : 's') : 'c', tag: painel ? 'Enviada pelo painel' : m.auto ? 'Resposta automática' : '', text: text || 'Mensagem', time: hora(m.quando) };
  }
  function openChat(it, ui) {
    const c = it.c; st.selecionada = c.id;
    ui.head(c.nome, c.foto, c.naoLidas > 0 ? H.pill(H.num(c.naoLidas) + ' não lidas', 'pk') : '');
    const wa = /^\d{10,15}$/.test(c.telefone || '') ? 'https://wa.me/' + c.telefone : '';
    ui.side(`<div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center">${H.avatar(c.foto, c.nome, 72)}<b style="font-size:15px;max-width:100%" class="ck-one" title="${H.esc(c.nome)}">${H.esc(c.nome)}</b><span class="ck-mut" style="font-size:13px">${H.esc(fone(c.telefone))}</span>${wa ? `<a class="ck-btn sm" style="text-decoration:none;color:#fff;margin-top:4px" href="${H.esc(wa)}" target="_blank" rel="noopener noreferrer"><i class="ph-fill ph-whatsapp-logo"></i>Abrir no WhatsApp</a>` : ''}</div>
      <h4>Conversa</h4><div class="ck-kv"><span class="ck-mut">Não lidas</span><b>${H.esc(H.num(c.naoLidas))}</b></div><div class="ck-kv"><span class="ck-mut">Última mensagem</span><b>${H.esc(H.when(c.quando))}</b></div><div class="ck-kv"><span class="ck-mut">Telefone</span><b>${H.esc(fone(c.telefone))}</b></div>
      <p class="ck-cap" style="margin-top:12px">As respostas enviadas daqui saem pelo número de atendimento da loja e aparecem como “Enviada pelo painel”.</p>`);
    const pages = [];
    const paint = (keep) => {
      if (!ui.current()) return;
      const got = pages.flatMap(p => p.mensagens), ids = new Set(got.map(m => m.id));
      // respostas enviadas daqui que a Uazapi ainda não devolveu na lista continuam visíveis
      const all = got.concat((enviadas.get(c.id) || []).filter(m => !ids.has(m.id))).sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
      const out = []; let last = '';
      for (const m of all) { const k = dayKey(m.quando); if (k && k !== last) { out.push({ side: 'sys', text: diaLongo(m.quando) }); last = k; } out.push(msgView(m)); }
      const more = pages.length && pages[pages.length - 1].temMais ? { label: 'Carregar mensagens anteriores', onClick: () => load(pages.length + 1, true) } : null;
      ui.messages(out, { more, keep });
    };
    const load = (p, keep) => api('messages', { chat: c.id, page: p }).then(d => { pages[p - 1] = d; paint(keep); }).catch(e => { if (ui.current()) { if (p === 1) ui.wait(e.message || 'Não consegui carregar as mensagens.'); else paint(true); } });
    load(1, false).then(() => ui.composer({
      placeholder: 'Escreva uma resposta… (Enter envia, Shift+Enter quebra linha)', max: 4000,
      draft: { get: () => drafts.get(c.id) || '', set: v => { if (v) drafts.set(c.id, v); else drafts.delete(c.id); } },
      send: async text => { const r = await api('send', {}, false, { chat: c.id, text }); if (r && r.id) { painelIds.add(r.id); const l = enviadas.get(c.id) || []; l.push({ id: r.id, deMim: true, painel: true, auto: false, texto: text, tipo: 'texto', rotulo: '', quando: r.quando || new Date().toISOString() }); enviadas.set(c.id, l.slice(-30)); } return r && r.ok ? r : null; },
      // depois de enviar: recarrega a conversa (a mensagem real vem da Uazapi) e a lista
      onSent: () => setTimeout(() => { if (!ui.current()) return; pages.length = 1; load(1, false); st.carregado = false; chat.ckChat.reload({ keepOpen: true, quiet: true }); }, 1500),
    }));
  }

  function build() {
    const content = $('content'); content.replaceChildren();
    const wrap = K.message(null, '', KIT); wrap.replaceChildren();
    kpiBox = document.createElement('div'); kpiBox.style.marginBottom = '16px'; wrap.append(kpiBox); content.append(wrap);
    paintStatus();
    chat = K.chatView(content, {
      ...KIT, side: true, search: 'Buscar nome ou telefone', emptyText: 'Nenhuma conversa encontrada.', selected: st.selecionada,
      chips: [{ key: 'todas', label: 'Todas' }, { key: 'nao_lidas', label: 'Não lidas' }], chip: st.filtro,
      onChip: (k, a) => { st.filtro = k; st.carregado = false; st.selecionada = null; a.reload(); },
      onSearch: (q, a) => { if (/[^\p{L}\p{N} -]/u.test(q) || q.length > 60) return; st.q = q; st.carregado = false; a.reload(); },
      load: async () => { if (!st.carregado) await fetchPage(1); chat?.ckChat?.footer(footer()); const nl = status ? status.naoLidas : null; if (nl != null) chat?.ckChat?.chipLabel('nao_lidas', 'Não lidas · ' + H.num(nl)); return st.itens.map(toItem); },
      open: openChat,
    });
  }

  try {
    client = window.supabase.createClient(window.SUPABASE_CONFIG.URL, window.SUPABASE_CONFIG.KEY);
    const { data: { session } } = await client.auth.getSession();
    if (!session) { location.href = 'login.html'; return; }
    $('logout').addEventListener('click', async () => { await client.auth.signOut(); location.href = 'login.html'; });
    build(); loadStatus();
    const refresh = () => { st.carregado = false; loadStatus(); chat.ckChat.reload({ keepOpen: true, quiet: true }); $('updated').textContent = 'Atualizado às ' + hora(new Date().toISOString()) + ' · WhatsApp de atendimento (somente leitura)'; };
    $('refresh').addEventListener('click', refresh);
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    $('updated').textContent = 'WhatsApp de atendimento · somente leitura · atualiza a cada minuto';
  } catch (e) { $('content').textContent = 'Não foi possível iniciar o painel. ' + (e && e.message ? e.message : ''); }
});
