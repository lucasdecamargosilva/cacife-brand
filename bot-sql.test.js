'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { guardSelect } = require('./bot-sql');

test('permite SELECT numa tabela da allowlist e força LIMIT', () => {
  assert.strictEqual(guardSelect('select count(*) from cacife_orders'), 'select count(*) from cacife_orders limit 200');
});

test('permite a view bot_vendas (faturamento já pago)', () => {
  const out = guardSelect("select channel, sum(valor) from bot_vendas group by 1");
  assert.ok(out.includes('bot_vendas'));
});

test('mantém LIMIT existente e remove ; final', () => {
  assert.strictEqual(guardSelect('select * from shopee_orders limit 5;'), 'select * from shopee_orders limit 5');
});

test('permite JOIN entre tabelas da allowlist', () => {
  const out = guardSelect('select i.item_name from shopee_order_items i join shopee_orders o on o.id_pedido=i.id_pedido');
  assert.ok(out.includes('shopee_order_items'));
});

test('permite CTE (WITH ... SELECT) com nome próprio', () => {
  const out = guardSelect('with x as (select total from cacife_orders) select sum(total) from x');
  assert.ok(out.startsWith('with x'));
});

test('permite unnest(string_to_array(...)) após a tabela', () => {
  const out = guardSelect("select trim(p) from cacife_orders, unnest(string_to_array(product_name, ',')) as p");
  assert.ok(out.includes('cacife_orders'));
});

test('bloqueia tabela fora da allowlist', () => {
  assert.throws(() => guardSelect('select * from tiktok_tokens'), /não permitida|dados não permitidos/);
  assert.throws(() => guardSelect('select * from lojistas'), /não permitida|dados não permitidos/);
  assert.throws(() => guardSelect('select * from cacife_orders join clientes c on true'), /não permitida/);
});

test('bloqueia esquemas e nomes sensíveis', () => {
  assert.throws(() => guardSelect('select * from auth.users'), /dados não permitidos|esquema não permitido/);
  assert.throws(() => guardSelect('select * from information_schema.columns'), /dados não permitidos/);
  assert.throws(() => guardSelect('select * from pg_catalog.pg_tables'), /dados não permitidos/);
  assert.throws(() => guardSelect('select access_token from shopee_tokens'), /dados não permitidos/);
});

test('bloqueia escrita, múltiplas consultas e funções perigosas', () => {
  assert.throws(() => guardSelect('update cacife_orders set total=0'), /apenas SELECT/);
  assert.throws(() => guardSelect('select 1; drop table cacife_orders'), /apenas uma consulta/);
  assert.throws(() => guardSelect('with x as (delete from cacife_orders returning 1) select * from x'), /não permitida/);
  assert.throws(() => guardSelect("select pg_read_file('/etc/passwd')"), /não permitida|tabela/);
});

test('comentário no fim não atrapalha uma consulta válida', () => {
  const out = guardSelect('select count(*) from cacife_orders -- total\n');
  assert.ok(out.includes('cacife_orders'));
});

test('comentário escondendo tabela sensível é pego após strip', () => {
  assert.throws(() => guardSelect('select * /* */ from /* */ ml_tokens'), /dados não permitidos|não permitida/);
});

test('rejeita vazio e não-select', () => {
  assert.throws(() => guardSelect(''), /vazio/);
  assert.throws(() => guardSelect('drop table x'), /apenas SELECT/);
});
