'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizeNumber, isAllowed, groupQuestion } = require('./bot-gate');

test('remove 55, sufixos de jid e zeros', () => {
  assert.strictEqual(normalizeNumber('5511938034714@s.whatsapp.net'), '11938034714');
  assert.strictEqual(normalizeNumber('+55 11 93803-4714'), '11938034714');
  assert.strictEqual(normalizeNumber('011938034714'), '11938034714');
  assert.strictEqual(normalizeNumber('11938034714'), '11938034714');
});

test('só o número permitido passa', () => {
  assert.strictEqual(isAllowed('5511938034714@s.whatsapp.net'), true);
  assert.strictEqual(isAllowed('11999999999'), false);
  assert.strictEqual(isAllowed(''), false);
  assert.strictEqual(isAllowed(null), false);
});

test('grupo: só o grupo configurado e só quando chamam o robô (com ou sem acento)', () => {
  const G = '120363404981793310@g.us';
  assert.strictEqual(groupQuestion({ isGroup: true, chatid: G, text: 'robô, quanto vendi hoje?' }, G), 'quanto vendi hoje?');
  assert.strictEqual(groupQuestion({ isGroup: true, chatid: G, text: 'Robo quanto vendi hoje' }, G), 'quanto vendi hoje');
  assert.strictEqual(groupQuestion({ isGroup: true, chatid: G, text: 'ROBÔ: top produtos' }, G), 'top produtos');
  assert.strictEqual(groupQuestion({ isGroup: true, chatid: G, text: 'oi robo, e o tiktok?' }, G), 'oi, e o tiktok?');
  assert.strictEqual(groupQuestion({ isGroup: true, chatid: G, text: 'bom dia pessoal' }, G), null);
  assert.strictEqual(groupQuestion({ isGroup: true, chatid: G, text: 'robótica é legal' }, G), null);
  assert.strictEqual(groupQuestion({ isGroup: true, chatid: '999@g.us', text: 'robô, vendas?' }, G), null);
  assert.strictEqual(groupQuestion({ isGroup: false, chatid: '5511938034714@s.whatsapp.net', text: 'robô, vendas?' }, G), null);
  assert.strictEqual(groupQuestion({ isGroup: true, chatid: G, text: 'robô' }, G), null);
});
