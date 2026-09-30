const test = require('node:test'), assert = require('node:assert/strict');
const { createWhatsApp } = require('./whatsapp-atd');

const TOKEN = 'tok-secreto-1234567890';
function fake(routes) {
  const calls = [];
  const fetchImpl = async (url, opt) => {
    calls.push({ url, opt, body: opt.body ? JSON.parse(opt.body) : null });
    const path = new URL(url).pathname, h = routes[path];
    if (!h) return { ok: false, status: 404, json: async () => ({}) };
    const out = await h(calls[calls.length - 1].body);
    return { ok: true, status: 200, json: async () => out };
  };
  return { calls, fetchImpl };
}
const chat = (o) => ({ wa_chatid: '5511999998888@s.whatsapp.net', name: 'Ana', wa_isGroup: false, wa_unreadCount: 2, wa_lastMsgTimestamp: 1790728514438, wa_lastMessageType: 'Conversation', wa_lastMessageTextVote: 'Oi', imagePreview: 'https://pps.whatsapp.net/x.jpg', ...o });

test('chats: só conversas 1:1, filtros na Uazapi e campos normalizados', async () => {
  const f = fake({ '/chat/find': () => ({ chats: [chat(), chat({ wa_chatid: '120363043231867595@g.us', name: 'Team Cacife', wa_isGroup: true }), chat({ wa_chatid: '5511944694412-1617576796@g.us' }), chat({ wa_chatid: '5521988887777@s.whatsapp.net', name: '', wa_name: '', imagePreview: 'javascript:alert(1)', wa_lastMessageType: 'ImageMessage', wa_lastMessageTextVote: '' })], pagination: { totalRecords: 90 } }) });
  const wa = createWhatsApp({ server: 'https://quantic.uazapi.com', token: TOKEN, fetchImpl: f.fetchImpl });
  const d = await wa.chats({ page: '2', filtro: 'nao_lidas', q: 'Ana' });
  assert.deepEqual(d.conversas.map(c => c.id), ['5511999998888@s.whatsapp.net', '5521988887777@s.whatsapp.net']);
  assert.equal(d.conversas[0].telefone, '5511999998888'); assert.equal(d.conversas[0].naoLidas, 2); assert.equal(d.conversas[0].quando, '2026-09-30T00:35:14.438Z');
  assert.equal(d.conversas[1].foto, null); assert.equal(d.conversas[1].nome, '5521988887777'); assert.equal(d.conversas[1].ultimaMsg, '📷 Foto');
  const b = f.calls[0].body;
  assert.equal(b.wa_isGroup, false); assert.equal(b.offset, 30); assert.equal(b.wa_unreadCount, '>0'); assert.equal(b.name, '~Ana');
  assert.equal(f.calls[0].opt.headers.token, TOKEN);
  assert.equal(d.temMais, true);
  await wa.chats({ q: '11 99999' }); assert.equal(f.calls[1].body.wa_chatid, '~1199999');
});

test('entradas inválidas são recusadas antes de chamar a Uazapi', async () => {
  const f = fake({}); const wa = createWhatsApp({ server: 'https://quantic.uazapi.com', token: TOKEN, fetchImpl: f.fetchImpl });
  for (const q of ["x' or 1=1", '<img src=x>', 'a'.repeat(61)]) await assert.rejects(wa.chats({ q }), e => e.status === 400);
  for (const page of ['0', '-1', 'abc', '999', '1.5']) await assert.rejects(wa.chats({ page }), e => e.status === 400);
  for (const chat of ['120363043231867595@g.us', 'abc', '55@s.whatsapp.net', '5511999998888@s.whatsapp.net?x']) await assert.rejects(wa.messages({ chat }), e => e.status === 400);
  assert.equal(f.calls.length, 0);
});

test('mensagens: tipos de mídia viram rótulo, resposta automática marcada; erros não vazam o token', async () => {
  const f = fake({ '/message/find': () => ({ hasMore: true, messages: [
    { messageid: 'a', chatid: '5511999998888@s.whatsapp.net', fromMe: true, wasSentByApi: true, messageType: 'ExtendedTextMessage', text: 'Olá!', messageTimestamp: 1790728513978, senderName: 'Cacife' },
    { messageid: 'b', chatid: '5511999998888@s.whatsapp.net', fromMe: false, messageType: 'DocumentMessage', text: 'Segue', content: { fileName: 'comprovante.pdf' }, messageTimestamp: 1790728502000 },
    { messageid: 'c', chatid: '5511999998888@s.whatsapp.net', fromMe: false, messageType: 'AudioMessage', text: '', messageTimestamp: 1790728502000 },
    { messageid: 'd', chatid: 'outra@s.whatsapp.net', fromMe: false, messageType: 'Conversation', text: 'não é desta conversa' },
  ] }) });
  const wa = createWhatsApp({ server: 'https://quantic.uazapi.com', token: TOKEN, fetchImpl: f.fetchImpl });
  const d = await wa.messages({ chat: '5511999998888@s.whatsapp.net', page: '1' });
  assert.equal(d.mensagens.length, 3); assert.equal(d.temMais, true);
  assert.deepEqual([d.mensagens[0].deMim, d.mensagens[0].auto], [true, true]);
  assert.deepEqual([d.mensagens[1].tipo, d.mensagens[1].rotulo, d.mensagens[1].arquivo], ['documento', '📄 Documento', 'comprovante.pdf']);
  assert.equal(d.mensagens[2].rotulo, '🎤 Áudio');
  assert.deepEqual(f.calls[0].body, { chatid: '5511999998888@s.whatsapp.net', limit: 50, offset: 0 });
  const down = createWhatsApp({ server: 'https://quantic.uazapi.com', token: TOKEN, fetchImpl: async () => { throw new Error('falhou com token ' + TOKEN); } });
  await assert.rejects(down.chats({}), e => e.status === 502 && !String(e.message).includes(TOKEN));
  const none = createWhatsApp({ server: 'https://quantic.uazapi.com', token: '' });
  await assert.rejects(none.status(), e => e.status === 503);
});

test('status não repassa o token nem campos internos da instância', async () => {
  const f = fake({
    '/instance/status': () => ({ instance: { token: TOKEN, status: 'connected', owner: '5511915390708', profileName: 'Cacife Brand', openai_apikey: 'sk-x' }, status: { connected: true } }),
    '/chat/find': (b) => ({ chats: [chat()], pagination: { totalRecords: b.wa_unreadCount ? 7 : 120 } }),
  });
  const wa = createWhatsApp({ server: 'https://quantic.uazapi.com', token: TOKEN, fetchImpl: f.fetchImpl });
  const s = await wa.status();
  assert.deepEqual(s, { connected: true, numero: '+55 (11) 9••••-0708', nome: 'Cacife Brand', conversas: 120, naoLidas: 7, ultimaMsgEm: '2026-09-30T00:35:14.438Z' });
  assert(!JSON.stringify(s).includes(TOKEN));
});

test('envio: valida, chama /send/text com rastreio do painel, sem vazar texto/token no log', async () => {
  const logs = [];
  const f = fake({
    '/send/text': (b) => ({ id: 'r1234567', messageid: 'MSG-' + b.text.length, status: 'Sent', fromMe: true, messageTimestamp: 1790728600000 }),
    '/chat/find': () => ({ chats: [chat()], pagination: { totalRecords: 1 } }),
  });
  let t = 1790728600000;
  const wa = createWhatsApp({ server: 'https://quantic.uazapi.com', token: TOKEN, fetchImpl: f.fetchImpl, log: (...a) => logs.push(a.join(' ')), now: () => t });
  for (const bad of [{ chat: '120363043231867595@g.us', text: 'oi' }, { chat: '5511999998888@s.whatsapp.net', text: '   ' }, { chat: '5511999998888@s.whatsapp.net', text: 'x'.repeat(4001) }, { chat: '5511999998888@s.whatsapp.net', text: 42 }]) {
    await assert.rejects(wa.send({ ...bad, who: 'u:1' }), e => e.status === 400);
  }
  await assert.rejects(wa.send({ chat: '5511999998888@s.whatsapp.net', text: 'oi' }), e => e.status === 401);
  assert.equal(f.calls.length, 0);
  await wa.chats({}); const antes = f.calls.length;
  const r = await wa.send({ chat: '5511999998888@s.whatsapp.net', text: '  Olá, <b>tudo bem</b>?\r\nSegue.  ', who: 'u:1' });
  assert.deepEqual(r, { ok: true, id: 'MSG-28', quando: '2026-09-30T00:36:40.000Z', status: 'Sent' });
  const call = f.calls[antes];
  assert.equal(new URL(call.url).pathname, '/send/text'); assert.equal(call.opt.method, 'POST'); assert.equal(call.opt.headers.token, TOKEN);
  assert.equal(call.body.number, '5511999998888@s.whatsapp.net'); assert.equal(call.body.text, 'Olá, <b>tudo bem</b>?\nSegue.');
  assert.equal(call.body.track_source, 'painel-cacife'); assert.match(call.body.track_id, /^pc-/);
  assert.equal(logs.length, 1); assert(!logs[0].includes('tudo bem') && !logs[0].includes(TOKEN) && !logs[0].includes('5511999998888') && logs[0].includes('8888'));
  // duplo clique: mesmo texto em 5s devolve o primeiro envio sem chamar de novo
  const r2 = await wa.send({ chat: '5511999998888@s.whatsapp.net', text: 'Olá, <b>tudo bem</b>?\nSegue.', who: 'u:1' });
  assert.equal(r2.id, 'MSG-28'); assert.equal(f.calls.filter(c => c.url.endsWith('/send/text')).length, 1);
  // a lista em cache foi invalidada pelo envio
  const n0 = f.calls.length; await wa.chats({}); assert.equal(f.calls.length, n0 + 1);
  // limite: 20 envios por minuto por usuário
  for (let i = 1; i < 20; i++) await wa.send({ chat: '5511999998888@s.whatsapp.net', text: 'msg ' + i, who: 'u:1' });
  await assert.rejects(wa.send({ chat: '5511999998888@s.whatsapp.net', text: 'msg 21', who: 'u:1' }), e => e.status === 429);
  await wa.send({ chat: '5511999998888@s.whatsapp.net', text: 'outro usuário', who: 'u:2' });
  t += 61000; await wa.send({ chat: '5511999998888@s.whatsapp.net', text: 'depois de 1 min', who: 'u:1' });
});

test('envio que falha pode ser repetido na hora e não vaza o token', async () => {
  let n = 0;
  const wa = createWhatsApp({ server: 'https://quantic.uazapi.com', token: TOKEN, log: () => {}, fetchImpl: async () => { n++; if (n === 1) throw new Error('rede ' + TOKEN); return { ok: true, status: 200, json: async () => ({ messageid: 'OK1', status: 'Sent' }) }; } });
  await assert.rejects(wa.send({ chat: '5511999998888@s.whatsapp.net', text: 'oi', who: 'u:1' }), e => e.status === 502 && !e.message.includes(TOKEN));
  const r = await wa.send({ chat: '5511999998888@s.whatsapp.net', text: 'oi', who: 'u:1' });
  assert.equal(r.id, 'OK1'); assert.equal(n, 2);
});

test('respostas do painel: marcadas pelo track_source ou pelo id devolvido no envio', async () => {
  const f = fake({
    '/send/text': () => ({ messageid: 'SENT-1', status: 'Sent' }),
    '/message/find': () => ({ hasMore: false, messages: [
      { messageid: 'A', chatid: '5511999998888@s.whatsapp.net', fromMe: true, wasSentByApi: true, track_source: 'painel-cacife', messageType: 'Conversation', text: 'pelo painel' },
      { messageid: 'SENT-1', chatid: '5511999998888@s.whatsapp.net', fromMe: true, wasSentByApi: true, track_source: '', messageType: 'Conversation', text: 'id conhecido' },
      { messageid: 'B', chatid: '5511999998888@s.whatsapp.net', fromMe: true, wasSentByApi: true, track_source: '', messageType: 'Conversation', text: 'robô' },
      { messageid: 'C', chatid: '5511999998888@s.whatsapp.net', fromMe: true, messageType: 'Conversation', text: 'celular' },
    ] }),
  });
  const wa = createWhatsApp({ server: 'https://quantic.uazapi.com', token: TOKEN, fetchImpl: f.fetchImpl, log: () => {} });
  await wa.send({ chat: '5511999998888@s.whatsapp.net', text: 'id conhecido', who: 'u:1' });
  const d = await wa.messages({ chat: '5511999998888@s.whatsapp.net' });
  assert.deepEqual(d.mensagens.map(m => [m.id, m.painel, m.auto]), [['A', true, false], ['SENT-1', true, false], ['B', false, true], ['C', false, false]]);
});
