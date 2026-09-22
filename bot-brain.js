'use strict';
const SYSTEM = [
  'Você é o assistente de dados da loja Cacife no WhatsApp.',
  'Responda em português do Brasil, curto e direto.',
  'Os valores JÁ VÊM FORMATADOS em reais (ex: "R$ 823.584,01"). Apenas repita exatamente; NUNCA recalcule, divida ou multiplique.',
  'NUNCA invente números: use somente o que as ferramentas retornarem.',
  'Ao comparar canais ou dar um total, use resumo_geral (traz todos de uma vez) e diga em qual vendeu mais.',
  'Para produtos mais vendidos use top_produtos (omita o canal para trazer de todos).',
  'Períodos aceitos no parâmetro period: hoje, ontem, 7d, 30d, 90d, mes, "Nd" (N dias), "Nm" (N meses, ex: 3m = 3 meses), ou "AAAA-MM-DD:AAAA-MM-DD".',
  'Se um canal vier com "erro", diga que aquele canal não respondeu agora, mas mostre os demais.',
  'Se a pergunta não for sobre vendas/canais/produtos, explique gentilmente o que você faz.',
].join(' ');

const PERIOD_DESC = "hoje|ontem|7d|30d|90d|mes, ou 'Nd'/'Nm' (ex: 3m = 3 meses), ou 'AAAA-MM-DD:AAAA-MM-DD'";
const TOOL_DEFS = [
  { type: 'function', function: { name: 'resumo_geral', description: 'Vendas (bruto), líquido e nº de pedidos de TODOS os canais (Shopee, Mercado Livre, Nuvemshop) + total, num período. Use para comparar canais.', parameters: { type: 'object', properties: { period: { type: 'string', description: PERIOD_DESC } }, required: ['period'] } } },
  { type: 'function', function: { name: 'resumo_canal', description: 'Mesmo que resumo_geral, mas de um canal só.', parameters: { type: 'object', properties: { canal: { type: 'string', enum: ['shopee', 'mercadolivre', 'nuvemshop'] }, period: { type: 'string', description: PERIOD_DESC } }, required: ['canal', 'period'] } } },
  { type: 'function', function: { name: 'top_produtos', description: 'Produtos mais vendidos (por unidades) num período. Omita "canal" para trazer os top de TODOS os canais de uma vez.', parameters: { type: 'object', properties: { canal: { type: 'string', enum: ['shopee', 'mercadolivre', 'nuvemshop'] }, period: { type: 'string', description: PERIOD_DESC }, limite: { type: 'integer', description: 'quantos por canal (padrão 3)' } }, required: ['period'] } } },
];

async function answer({ chat, tools, model, history = [], text }) {
  const messages = [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: text }];
  for (let i = 0; i < 4; i++) {
    const resp = await chat({ model, messages, tools: TOOL_DEFS, tool_choice: 'auto' });
    const msg = resp.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return (msg.content || '').trim() || 'Não consegui responder agora.';
    }
    for (const call of msg.tool_calls) {
      const fn = tools[call.function.name];
      let result;
      try { result = fn ? await fn(JSON.parse(call.function.arguments || '{}')) : { error: 'ferramenta desconhecida' }; }
      catch (e) { console.error('tool erro:', e.message); result = { error: 'falha ao buscar dados' }; }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return 'Consultei bastante coisa, mas não fechei a resposta. Tenta perguntar de novo, mais específico?';
}

module.exports = { answer, SYSTEM, TOOL_DEFS };
