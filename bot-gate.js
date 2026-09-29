'use strict';
function normalizeNumber(raw) {
  if (!raw) return '';
  let d = String(raw).split('@')[0].replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d;
}
function isAllowed(raw, allowed = '11938034714') {
  return normalizeNumber(raw) === normalizeNumber(allowed);
}
// Grupo: só o grupo configurado e só quando a mensagem chama o robô ("robô"/"robo", qualquer caixa).
// Devolve a pergunta sem a palavra-gatilho, ou null se não for para o robô responder.
const GATILHO = /\s*(?<![\p{L}\p{N}])rob[oô](?![\p{L}\p{N}])/iu;
function groupQuestion(inb, groupId) {
  if (!inb || !inb.isGroup || !groupId || String(inb.chatid || '') !== String(groupId)) return null;
  const t = String(inb.text || '');
  if (!GATILHO.test(t)) return null;
  const q = t.replace(GATILHO, '').replace(/^[\s,:;.!?-]+/, '').replace(/\s+/g, ' ').trim();
  return q || null;
}
module.exports = { normalizeNumber, isAllowed, groupQuestion };
