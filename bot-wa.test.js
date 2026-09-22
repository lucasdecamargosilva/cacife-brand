'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseInbound, sendText } = require('./bot-wa');

test('parseInbound extrai remetente e texto de mensagem recebida', () => {
  const body = { event: 'messages', message: { sender: '5511938034714@s.whatsapp.net', fromMe: false, text: 'quanto vendi hoje?' } };
  assert.deepStrictEqual(parseInbound(body), { sender: '5511938034714@s.whatsapp.net', text: 'quanto vendi hoje?' });
});

test('parseInbound ignora mensagens enviadas por nós (fromMe)', () => {
  const body = { event: 'messages', message: { sender: 'x', fromMe: true, text: 'oi' } };
  assert.strictEqual(parseInbound(body), null);
});

test('parseInbound retorna null sem texto', () => {
  assert.strictEqual(parseInbound({ message: { sender: 'x' } }), null);
  assert.strictEqual(parseInbound({}), null);
});

test('sendText chama /send/text com header token e body correto', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, text: async () => '{}' }; };
  await sendText({ serverUrl: 'https://quantic.uazapi.com', token: 'TK', fetchImpl }, '11938034714', 'olá');
  assert.strictEqual(calls[0].url, 'https://quantic.uazapi.com/send/text');
  assert.strictEqual(calls[0].init.method, 'POST');
  assert.strictEqual(calls[0].init.headers.token, 'TK');
  assert.deepStrictEqual(JSON.parse(calls[0].init.body), { number: '11938034714', text: 'olá' });
});
