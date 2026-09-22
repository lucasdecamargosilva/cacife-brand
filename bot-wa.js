'use strict';
// Extrai a mensagem recebida do webhook do Uazapi.
// O número real do remetente vem em sender_pn (o WhatsApp esconde o telefone atrás de um @lid).
function parseInbound(body) {
  const m = body && (body.message || body.data || body);
  if (!m) return null;
  if (m.fromMe === true) return null;
  const text = m.text || m.content || (m.message && m.message.conversation);
  if (!text || typeof text !== 'string') return null;
  const pn = m.sender_pn || m.senderPn || '';
  const raw = pn ? String(pn) : String(m.sender || m.chatid || '');
  const phone = raw.split('@')[0].replace(/\D/g, '');
  if (!phone) return null;
  const isGroup = m.isGroup === true || /@g\.us/.test(String(m.chatid || ''));
  return { sender: String(m.sender || m.chatid || raw), phone, isGroup, text };
}

async function sendText({ serverUrl, token, fetchImpl = fetch }, number, text) {
  const res = await fetchImpl(`${serverUrl}/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Uazapi HTTP ${res.status}: ${t.slice(0, 120)}`);
  }
}

module.exports = { parseInbound, sendText };
