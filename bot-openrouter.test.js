'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeChat } = require('./bot-openrouter');

test('makeChat posta no OpenRouter com Bearer e body', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }; };
  const chat = makeChat({ apiKey: 'sk-or', fetchImpl });
  const r = await chat({ model: 'm', messages: [{ role: 'user', content: 'oi' }] });
  assert.strictEqual(seen[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.strictEqual(seen[0].init.headers.Authorization, 'Bearer sk-or');
  assert.strictEqual(r.choices[0].message.content, 'ok');
});

test('makeChat lança erro em HTTP ruim', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, text: async () => 'rate' });
  const chat = makeChat({ apiKey: 'sk', fetchImpl });
  await assert.rejects(() => chat({ model: 'm', messages: [] }), /OpenRouter HTTP 429/);
});
