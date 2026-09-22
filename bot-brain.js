'use strict';
const SYSTEM = [
  'Você é o assistente de dados da loja Cacife no WhatsApp.',
  'Responda em português do Brasil, curto e direto.',
  'REGRA ABSOLUTA: você só sabe o que as FERRAMENTAS retornam. Para QUALQUER número, produto, pedido, faturamento, ranking ou status, você DEVE chamar a ferramenta apropriada ANTES de responder. É terminantemente PROIBIDO inventar, estimar ou chutar dados. Se você não chamou uma ferramenta, você NÃO tem a informação — então chame. Se a ferramenta falhar ou vier vazia, diga que não conseguiu buscar; nunca invente.',
  'Para "produtos mais vendidos"/"top produtos" chame SEMPRE top_produtos (ela já traz unidades, pedidos e VALOR em R$ de cada produto — não precisa de outra consulta para o valor). Nunca liste produtos de memória.',
  'Para "quanto vendi do produto X" / valor de um produto específico, chame vendas_produto com um trecho do nome (nunca use o nome cortado com "…"; use produto_completo se precisar).',
  'Se um valor vier marcado como "aproximado", diga isso na resposta (rateio em pedidos com vários itens).',
  'ORDEM DE PREFERÊNCIA: primeiro as ferramentas prontas (resumo_geral, resumo_canal, top_produtos, perguntas_ml, chat_shopee) — elas são garantidas. Use consulta_banco SÓ quando nenhuma pronta cobrir a pergunta (ex: por mês, por dia, status, ticket médio).',
  'Se TODOS os valores de um período vierem zero, NÃO apresente zeros como resultado: avise que não há registros nesse período e sugira conferir a data/ano.',
  'Se uma consulta voltar vazia ou nula, diga que não encontrou registros (não que "falhou"), e se for um produto que a loja não vende, diga isso.',
  'INTEGRIDADE: em toda resposta com números, diga o PERÍODO considerado. Use os valores exatamente como vieram (2 casas decimais). Se algum canal falhar, diga qual. Se o período pedido for maior que ~45 dias, avise que a Shopee só tem histórico desde agosto/2026 (conectada recentemente), então ela pode aparecer menor que o real.',
  'Os valores JÁ VÊM FORMATADOS em reais (ex: "R$ 823.584,01"). Apenas repita exatamente; NUNCA recalcule, divida ou multiplique.',
  'Ao comparar canais ou dar um total, use resumo_geral (traz todos de uma vez) e diga em qual vendeu mais.',
  'Para produtos mais vendidos use top_produtos (omita o canal para trazer de todos).',
  'Períodos aceitos no parâmetro period: hoje, ontem, 7d, 30d, 90d, mes, "Nd" (N dias), "Nm" (N meses, ex: 3m = 3 meses), ou "AAAA-MM-DD:AAAA-MM-DD".',
  'Se um canal vier com "erro", diga que aquele canal não respondeu agora, mas mostre os demais.',
  'Para qualquer outra pergunta sobre os dados (status de pedido, devoluções, ticket médio, por dia, por cliente, formas de pagamento, etc.) use consulta_banco escrevendo uma consulta SQL (só SELECT).',
  'No banco o dinheiro está em REAIS (não centavos): formate como R$ com pontos de milhar e vírgula decimal.',
  'Para perguntas sem resposta no Mercado Livre use perguntas_ml; para o chat da Shopee (conversas aguardando) use chat_shopee.',
  'Se a pergunta não for sobre a loja, explique gentilmente o que você faz.',
  'FORMATAÇÃO (sempre, em toda resposta, para WhatsApp): negrito é com UM asterisco só (*texto*), NUNCA dois (**texto**) nem markdown. Use *negrito* nos títulos/rótulos; uma informação por linha; listas numeradas (1., 2., 3.) para rankings; uma linha em branco entre seções/canais; nomes de produto curtos; poucos emojis. Nada de parágrafos longos ou itens grudados por vírgula. Enxuto e escaneável.',
].join(' ');

const SCHEMA = [
  'Tabelas Postgres para consulta_banco (só SELECT; dinheiro em REAIS; fuso Brasil -03:00, filtre created_at):',
  "FUSO: para agrupar por dia/mês use SEMPRE date_trunc('month', created_at at time zone 'America/Sao_Paulo') (ou 'day'), senão a virada do mês fica errada. Ex.: to_char(date_trunc('month', created_at at time zone 'America/Sao_Paulo'),'YYYY-MM').",
  "IMPORTANTE para FATURAMENTO/VENDAS/LÍQUIDO (por mês, por dia, por canal, etc.): use SEMPRE a view bot_vendas(channel ['shopee'|'mercadolivre'|'nuvemshop'], created_at, status, valor numeric (bruto R$), liquido numeric (R$), product_name, quantity_buyed). Ela JÁ contém somente pedidos PAGOS — não precisa (e não deve) filtrar payment_status. Ex.: select to_char(date_trunc('month',created_at),'YYYY-MM') mes, sum(valor) from bot_vendas where channel='mercadolivre' group by 1 order by 1.",
  "cacife_orders(channel text ['mercadolivre'|'nuvemshop'], created_at timestamptz, paid_at, status, payment_status, shipping_status, total numeric, sale_fee numeric, product_name text (lista 'A, B, C'), quantity_buyed text, customer_name, customer_phone, order_number). Pago: ML payment_status='paid'; NS payment_status in ('paid','Confirmado'). Comissão ML = sale_fee; NS não tem.",
  "shopee_orders(id_pedido, created_at, payment_status ['paid'|'pending'|'cancelled'], total numeric bruto, escrow_amount numeric (repasse líquido), commission_fee, service_fee, transaction_fee, shipping_carrier, payment_method, region). Pago: payment_status='paid'.",
  'shopee_order_items(id_pedido, shop_id, item_name, qty, price, image_url) — junte com shopee_orders por shop_id+id_pedido.',
  'shopee_returns(created_at, refund_amount, ...) — devoluções da Shopee.',
  'Para top produtos de ML/NS, separe product_name por vírgula: unnest(string_to_array(product_name, \',\')).',
].join('\n');

const PERIOD_DESC = "hoje|ontem|7d|30d|90d|mes, ou 'Nd'/'Nm' (ex: 3m = 3 meses), ou 'AAAA-MM-DD:AAAA-MM-DD'";
const TOOL_DEFS = [
  { type: 'function', function: { name: 'resumo_geral', description: 'Vendas (bruto), líquido e nº de pedidos de TODOS os canais (Shopee, Mercado Livre, Nuvemshop) + total, num período. Use para comparar canais.', parameters: { type: 'object', properties: { period: { type: 'string', description: PERIOD_DESC } }, required: ['period'] } } },
  { type: 'function', function: { name: 'resumo_canal', description: 'Mesmo que resumo_geral, mas de um canal só.', parameters: { type: 'object', properties: { canal: { type: 'string', enum: ['shopee', 'mercadolivre', 'nuvemshop'] }, period: { type: 'string', description: PERIOD_DESC } }, required: ['canal', 'period'] } } },
  { type: 'function', function: { name: 'top_produtos', description: 'Produtos mais vendidos (por unidades) num período. Omita "canal" para trazer os top de TODOS os canais de uma vez.', parameters: { type: 'object', properties: { canal: { type: 'string', enum: ['shopee', 'mercadolivre', 'nuvemshop'] }, period: { type: 'string', description: PERIOD_DESC }, limite: { type: 'integer', description: 'quantos por canal (padrão 3)' } }, required: ['period'] } } },
  { type: 'function', function: { name: 'vendas_produto', description: 'Busca um produto por parte do nome (ex: "madrid", "aviador") e devolve unidades, pedidos e VALOR vendido (R$, já formatado) por canal, num período. Omita "canal" para buscar em todos.', parameters: { type: 'object', properties: { produto: { type: 'string', description: 'trecho do nome do produto' }, canal: { type: 'string', enum: ['shopee', 'mercadolivre', 'nuvemshop'] }, period: { type: 'string', description: PERIOD_DESC }, limite: { type: 'integer', description: 'máx. de produtos por canal (padrão 5)' } }, required: ['produto', 'period'] } } },
  { type: 'function', function: { name: 'consulta_banco', description: 'Executa uma consulta SQL de LEITURA (SELECT) no banco da loja para responder qualquer pergunta sobre os dados. Veja o esquema das tabelas nas instruções.', parameters: { type: 'object', properties: { sql: { type: 'string', description: 'uma única consulta SELECT em Postgres' } }, required: ['sql'] } } },
  { type: 'function', function: { name: 'perguntas_ml', description: 'Quantas perguntas de clientes estão SEM RESPOSTA no Mercado Livre agora (ao vivo).', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'chat_shopee', description: 'Situação do chat da Shopee agora (ao vivo): quantas conversas e quantas aguardando resposta (não lidas).', parameters: { type: 'object', properties: {} } } },
];

// Data de hoje em fuso Brasil, para a IA não chutar o ano em "agosto", "esse mês", etc.
function hojeLine(now = new Date()) {
  const br = new Date(now.getTime() - 3 * 3600000);
  const iso = br.toISOString().slice(0, 10);
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  return `DATA DE HOJE (Brasil): ${iso} (${dias[br.getUTCDay()]}). Ano corrente: ${iso.slice(0, 4)}. Quando o usuário citar um mês sem dizer o ano, use o ano corrente (se esse mês ainda não chegou este ano, use o ano anterior). NUNCA use anos antigos como 2023 por conta própria.`;
}

async function answer({ chat, tools, model, history = [], text, now = new Date() }) {
  const messages = [{ role: 'system', content: SYSTEM + '\n\n' + hojeLine(now) + '\n\n' + SCHEMA }, ...history, { role: 'user', content: text }];
  for (let i = 0; i < 4; i++) {
    const resp = await chat({ model, messages, tools: TOOL_DEFS, tool_choice: 'auto', temperature: 0 });
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
