'use strict';
let csrf;
const $ = id => document.getElementById(id);
const currency = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
async function api(route, body) {
  const response = await fetch('/api/shopee/' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Cacife-Local': csrf }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'A consulta falhou. Recarregue a página.'); return data;
}
async function run(button, work) {
  button.disabled = true;
  $('notice').textContent = 'Executando teste…';
  try { await work(); } catch (error) { $('notice').textContent = error.message; }
  finally { button.disabled = false; }
}
function show(data) {
  $('results').hidden = false;
  $('result-title').textContent = data.simulated ? 'Simulação local · pedidos fictícios' : 'Sandbox Shopee · pedidos de teste';
  $('orders').replaceChildren(); $('checks').replaceChildren();
  for (const order of data.orders) {
    const tr = document.createElement('tr');
    for (const value of [order.id_pedido, order.status, currency(order.total)]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
    $('orders').append(tr);
  }
  const names = { tokenRenewed: 'Acesso renovado', pagination: 'Todas as páginas consultadas', idempotent: 'Sem duplicação', cancelledExcluded: 'Cancelados excluídos' };
  for (const [name, passed] of Object.entries(data.checks || {})) { const span = document.createElement('span'); span.className = 'check'; span.textContent = (passed ? '✓ ' : 'Falhou: ') + names[name]; $('checks').append(span); }
  const paid = data.orders.filter(o => o.payment_status === 'paid');
  $('summary').textContent = `${data.orders.length} pedidos de teste · ${paid.length} pagos · ${currency(paid.reduce((s, o) => s + Math.round(o.total * 100), 0) / 100)} em vendas de teste.`;
}
async function status() {
  const data = await api('status');
  $('connection').textContent = data.configured ? (data.redirectReady ? `Aplicativo de teste ${data.partnerId} configurado. Autorize somente uma loja sandbox.` : 'Chave de teste configurada. A Shopee recusou o endereço de retorno local; a criação da loja sandbox ainda não foi confirmada no portal.') : 'Aplicativo Cacife criado. Chave de teste e loja sandbox ainda pendentes de configuração local.';
  $('authorize').disabled = !data.configured || !data.redirectReady;
  if (data.shops.length) {
    $('shop').replaceChildren(...data.shops.map(shop => new Option(`Loja ${shop.id} · ${shop.orders} pedidos`, shop.id)));
    $('shop').disabled = false; $('sync').disabled = false;
  }
}
$('simulate').onclick = () => run($('simulate'), async () => { const result = await api('simulate', {}); show(result); $('notice').textContent = 'Simulação concluída. Nenhum pedido foi gravado na base real.'; });
$('authorize').onclick = () => run($('authorize'), async () => { const { url } = await api('authorize', {}); location.assign(url); });
$('sync').onclick = () => run($('sync'), async () => { await api('sync', { shopId: $('shop').value }); show(await api('orders')); await status(); $('notice').textContent = 'Pedidos do sandbox consultados e salvos apenas neste computador.'; });
(async () => { try { const session = await fetch('/api/session').then(r => r.json()); csrf = session.csrf; await status(); $('notice').textContent = 'Pronto para testes locais. Nuvemshop e Mercado Livre continuam na visão geral.'; } catch { $('notice').textContent = 'Inicie o servidor de testes locais para usar esta página.'; } })();
