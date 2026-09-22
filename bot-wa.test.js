'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseInbound, sendText } = require('./bot-wa');

test('parseInbound lê o telefone real de sender_pn e marca chat direto', () => {
  const body = { EventType: 'messages', message: { sender: '63707803611181@lid', sender_pn: '5511938034714@s.whatsapp.net', chatid: '5511938034714@s.whatsapp.net', isGroup: false, fromMe: false, text: 'quanto vendi hoje?' } };
  const r = parseInbound(body);
  assert.strictEqual(r.phone, '5511938034714');
  assert.strictEqual(r.isGroup, false);
  assert.strictEqual(r.text, 'quanto vendi hoje?');
});

test('parseInbound marca isGroup em mensagem de grupo', () => {
  const body = { message: { sender: '63707803611181:41@lid', sender_pn: '5511938034714@s.whatsapp.net', chatid: '120363425854740341@g.us', isGroup: true, fromMe: false, text: 'Novo cliente provou!' } };
  const r = parseInbound(body);
  assert.strictEqual(r.isGroup, true);
  assert.strictEqual(r.phone, '5511938034714');
});

test('parseInbound cai pro sender quando não há sender_pn', () => {
  const body = { message: { sender: '5511999999999@s.whatsapp.net', fromMe: false, text: 'oi' } };
  const r = parseInbound(body);
  assert.strictEqual(r.phone, '5511999999999');
});

test('parseInbound ignora mensagens enviadas por nós (fromMe)', () => {
  assert.strictEqual(parseInbound({ message: { sender: 'x', fromMe: true, text: 'oi' } }), null);
});

test('parseInbound retorna null sem texto', () => {
  assert.strictEqual(parseInbound({ message: { sender: 'x' } }), null);
  assert.strictEqual(parseInbound({}), null);
});

test('sendText chama /send/text com header token e body correto', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, text: async () => '{}' }; };
  await sendText({ serverUrl: 'https://quantic.uazapi.com', token: 'TK', fetchImpl }, '5511938034714', 'olá');
  assert.strictEqual(calls[0].url, 'https://quantic.uazapi.com/send/text');
  assert.strictEqual(calls[0].init.method, 'POST');
  assert.strictEqual(calls[0].init.headers.token, 'TK');
  assert.deepStrictEqual(JSON.parse(calls[0].init.body), { number: '5511938034714', text: 'olá' });
});
