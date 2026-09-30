// WhatsApp de atendimento (Uazapi) — só leitura. Usado pelo server.js (produção) e pelo local/server.js.
// O token da instância fica só no servidor: nunca vai para o navegador, nem para logs ou mensagens de erro.
'use strict';

const JID = /^\d{8,15}@(s\.whatsapp\.net|c\.us|lid)$/;
const PER_CHATS = 30, PER_MSGS = 50, MAX_PAGE = 200;
const TIPOS = {
  Conversation: 'texto', ExtendedTextMessage: 'texto', ImageMessage: 'imagem', AudioMessage: 'audio', PttMessage: 'audio', VideoMessage: 'video',
  DocumentMessage: 'documento', DocumentWithCaptionMessage: 'documento', StickerMessage: 'figurinha', ReactionMessage: 'reacao',
  LocationMessage: 'localizacao', LiveLocationMessage: 'localizacao', ContactMessage: 'contato', ContactsArrayMessage: 'contato',
  PollCreationMessage: 'enquete', PollUpdateMessage: 'enquete',
};
const ROTULO = { imagem: '📷 Foto', audio: '🎤 Áudio', video: '🎥 Vídeo', documento: '📄 Documento', figurinha: '🏷️ Figurinha', localizacao: '📍 Localização', contato: '👤 Contato', enquete: '📊 Enquete', reacao: 'Reação', outro: 'Mensagem' };

class BadInput extends Error { constructor(m) { super(m); this.status = 400; } }
const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const https = u => { const s = String(u || ''); return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : null; };
const iso = t => { let n = Number(t) || 0; if (!n) return null; if (n < 1e12) n *= 1000; const d = new Date(n); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };
const digitsOf = jid => { const m = /^(\d{8,15})@(s\.whatsapp\.net|c\.us)$/.exec(String(jid || '')); return m ? m[1] : ''; };
const tipoOf = t => TIPOS[t] || (t ? 'outro' : 'texto');

function page(v) {
  if (v === undefined || v === null || v === '') return 1;
  if (!/^\d{1,4}$/.test(String(v))) throw new BadInput('Página inválida.');
  const n = Number(v); if (n < 1 || n > MAX_PAGE) throw new BadInput('Página inválida.');
  return n;
}
function query(v) {
  const s = String(v == null ? '' : v);
  if (s.length > 60 || /[^\p{L}\p{N} -]/u.test(s)) throw new BadInput('Busca inválida: use só letras, números, espaço e hífen.');
  return s.replace(/\s+/g, ' ').trim();
}
function chatId(v) { const s = String(v || ''); if (!JID.test(s)) throw new BadInput('Conversa inválida.'); return s; }

function normChat(c) {
  const tipo = tipoOf(c.wa_lastMessageType);
  const txt = str(c.wa_lastMessageTextVote, 120);
  return {
    id: String(c.wa_chatid),
    nome: str(c.wa_contactName || c.name || c.wa_name || c.lead_name || c.phone, 80) || digitsOf(c.wa_chatid) || 'Cliente',
    telefone: digitsOf(c.wa_chatid),
    foto: https(c.imagePreview) || https(c.image),
    ultimaMsg: tipo === 'texto' ? txt : (tipo === 'reacao' ? 'Reagiu ' + txt : ROTULO[tipo] + (txt ? ' · ' + txt : '')).slice(0, 120),
    quando: iso(c.wa_lastMsgTimestamp),
    naoLidas: Math.max(0, Number(c.wa_unreadCount) || 0),
  };
}
function normMsg(m) {
  const tipo = tipoOf(m.messageType), content = m.content && typeof m.content === 'object' ? m.content : {};
  const texto = tipo === 'reacao' ? str(m.text || content.text, 20) : str(m.text || content.caption || content.text, 4000);
  return {
    id: str(m.messageid || m.id, 120),
    deMim: m.fromMe === true,
    auto: m.fromMe === true && m.wasSentByApi === true,
    texto, tipo, rotulo: tipo === 'texto' ? '' : ROTULO[tipo],
    arquivo: tipo === 'documento' ? str(content.fileName || content.title, 80) || null : null,
    quando: iso(m.messageTimestamp),
    autor: str(m.senderName, 80) || null,
  };
}

function createWhatsApp({ server, token, fetchImpl = fetch, ttl = 25000, timeout = 15000 } = {}) {
  const base = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(String(server || '').replace(/\/+$/, '')) ? String(server).replace(/\/+$/, '') : '';
  const ok = Boolean(base && token && /^[\w-]{10,200}$/.test(String(token)));
  const cache = new Map();
  async function call(method, path, body) {
    if (!ok) { const e = new Error('WhatsApp de atendimento não configurado no servidor.'); e.status = 503; throw e; }
    let r;
    try { r = await fetchImpl(base + path, { method, headers: { token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout), redirect: 'error' }); }
    catch { const e = new Error('WhatsApp indisponível no momento.'); e.status = 502; throw e; }
    if (!r.ok) { const e = new Error('WhatsApp indisponível no momento.'); e.status = 502; throw e; }
    try { return await r.json(); } catch { const e = new Error('Resposta inválida do WhatsApp.'); e.status = 502; throw e; }
  }
  function cached(key, load) {
    const hit = cache.get(key); if (hit && Date.now() - hit.t < ttl) return hit.p;
    const p = load().catch(e => { cache.delete(key); throw e; });
    cache.set(key, { t: Date.now(), p });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return p;
  }
  // só conversas 1:1 com mensagem (grupos ficam fora)
  const baseFilter = { wa_isGroup: false, wa_lastMsgTimestamp: '>0' };
  async function status() {
    return cached('status', async () => {
      const [st, all, unread] = await Promise.all([
        call('GET', '/instance/status'),
        call('POST', '/chat/find', { ...baseFilter, limit: 1, offset: 0, sort: '-wa_lastMsgTimestamp' }),
        call('POST', '/chat/find', { ...baseFilter, wa_unreadCount: '>0', limit: 1, offset: 0, sort: '-wa_lastMsgTimestamp' }),
      ]);
      const inst = (st && st.instance) || {}, s = (st && st.status) || {};
      const num = String(inst.owner || '').replace(/\D/g, '');
      const last = ((all && all.chats) || [])[0];
      return {
        connected: s.connected === true && inst.status === 'connected',
        numero: num.length >= 12 ? `+${num.slice(0, 2)} (${num.slice(2, 4)}) ${num.slice(4, 5)}••••-${num.slice(-4)}` : null,
        nome: str(inst.profileName || inst.name, 60) || null,
        conversas: Number(all && all.pagination && all.pagination.totalRecords) || 0,
        naoLidas: Number(unread && unread.pagination && unread.pagination.totalRecords) || 0,
        ultimaMsgEm: last ? iso(last.wa_lastMsgTimestamp) : null,
      };
    });
  }
  async function chats({ page: pg, q, filtro } = {}) {
    const p = page(pg), term = query(q), f = filtro === 'nao_lidas' ? 'nao_lidas' : 'todas';
    return cached(`chats:${p}:${f}:${term.toLowerCase()}`, async () => {
      const body = { ...baseFilter, limit: PER_CHATS, offset: (p - 1) * PER_CHATS, sort: '-wa_lastMsgTimestamp' };
      if (f === 'nao_lidas') body.wa_unreadCount = '>0';
      if (term) { const dig = term.replace(/[\s-]/g, ''); if (/^\d{3,15}$/.test(dig)) body.wa_chatid = '~' + dig; else body.name = '~' + term; }
      const d = await call('POST', '/chat/find', body);
      const list = ((d && d.chats) || []).filter(c => c && c.wa_isGroup !== true && JID.test(String(c.wa_chatid || '')) && !/@g\.us$/.test(String(c.wa_chatid)));
      const total = Number(d && d.pagination && d.pagination.totalRecords) || 0;
      return { pagina: p, total, temMais: p * PER_CHATS < total, conversas: list.map(normChat) };
    });
  }
  async function messages({ chat, page: pg } = {}) {
    const id = chatId(chat), p = page(pg);
    const d = await call('POST', '/message/find', { chatid: id, limit: PER_MSGS, offset: (p - 1) * PER_MSGS });
    const list = ((d && d.messages) || []).filter(m => m && m.isGroup !== true && (!m.chatid || m.chatid === id));
    return { pagina: p, temMais: d && d.hasMore === true, mensagens: list.map(normMsg) };
  }
  return { configured: ok, status, chats, messages };
}

module.exports = { createWhatsApp, normChat, normMsg, JID, BadInput };
