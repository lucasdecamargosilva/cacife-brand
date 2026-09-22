'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizeNumber, isAllowed } = require('./bot-gate');

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
