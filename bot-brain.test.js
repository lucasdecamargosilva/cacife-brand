'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { answer } = require('./bot-brain');

test('answer chama a tool pedida pelo modelo e devolve o texto final', async () => {
  let step = 0;
  const chat = async ({ messages }) => {
    step++;
    if (step === 1) {
      return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'resumo_geral', arguments: JSON.stringify({ period: 'hoje' }) } }] } }] };
    }
    const toolMsg = messages.find((m) => m.role === 'tool');
    assert.ok(toolMsg, 'resultado da tool deve entrar no histórico');
    return { choices: [{ message: { role: 'assistant', content: 'Hoje você vendeu R$ 150,00.' } }] };
  };
  const tools = { resumo_geral: async ({ period }) => ({ total: { revenue: 15000 }, period }) };
  const out = await answer({ chat, tools, model: 'x', history: [], text: 'quanto vendi hoje?' });
  assert.strictEqual(out, 'Hoje você vendeu R$ 150,00.');
});

test('answer injeta a data de hoje (fuso BR) no system prompt', async () => {
  let systemSeen = '';
  const chat = async ({ messages }) => { systemSeen = messages[0].content; return { choices: [{ message: { role: 'assistant', content: 'ok' } }] }; };
  // 2026-09-21 23:30 UTC = 2026-09-21 20:30 BR (ainda dia 21)
  await answer({ chat, tools: {}, model: 'x', history: [], text: 'oi', now: new Date('2026-09-21T23:30:00.000Z') });
  assert.ok(systemSeen.includes('DATA DE HOJE (Brasil): 2026-09-21'));
  assert.ok(systemSeen.includes('Ano corrente: 2026'));
  // 2026-09-22 01:00 UTC = 2026-09-21 22:00 BR (ainda dia 21, não 22)
  await answer({ chat, tools: {}, model: 'x', history: [], text: 'oi', now: new Date('2026-09-22T01:00:00.000Z') });
  assert.ok(systemSeen.includes('DATA DE HOJE (Brasil): 2026-09-21'));
});

test('answer sem tool_call devolve o content direto', async () => {
  const chat = async () => ({ choices: [{ message: { role: 'assistant', content: 'Oi! Pergunte sobre suas vendas.' } }] });
  const out = await answer({ chat, tools: {}, model: 'x', history: [], text: 'oi' });
  assert.strictEqual(out, 'Oi! Pergunte sobre suas vendas.');
});

test('answer trata erro da tool sem quebrar', async () => {
  let step = 0;
  const chat = async () => {
    step++;
    if (step === 1) return { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 't1', function: { name: 'resumo_geral', arguments: '{}' } }] } }] };
    return { choices: [{ message: { role: 'assistant', content: 'Não consegui buscar agora.' } }] };
  };
  const tools = { resumo_geral: async () => { throw new Error('api caiu'); } };
  const out = await answer({ chat, tools, model: 'x', history: [], text: 'e aí?' });
  assert.strictEqual(out, 'Não consegui buscar agora.');
});
