'use strict';
function parseInbound(body) {
  const m = body && (body.message || body.data || body);
  if (!m) return null;
  if (m.fromMe === true) return null;
  const sender = m.sender || m.chatid || m.from || m.jid;
  const text = m.text || m.content || (m.message && m.message.conversation);
  if (!sender || !text || typeof text !== 'string') return null;
  return { sender: String(sender), text };
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
