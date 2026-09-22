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
