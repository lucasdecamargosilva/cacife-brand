'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { guardSelect } = require('./bot-sql');

test('permite SELECT simples e força LIMIT', () => {
  assert.strictEqual(guardSelect('select 1'), 'select 1 limit 200');
  assert.strictEqual(guardSelect('SELECT count(*) from cacife_orders'), 'SELECT count(*) from cacife_orders limit 200');
});

test('mantém LIMIT existente e remove ; final', () => {
  assert.strictEqual(guardSelect('select * from shopee_orders limit 5;'), 'select * from shopee_orders limit 5');
});

test('permite CTE (WITH ... SELECT)', () => {
  const out = guardSelect("with x as (select 1 a) select a from x");
  assert.ok(out.startsWith('with x'));
});

test('bloqueia escrita e múltiplas consultas', () => {
  assert.throws(() => guardSelect("update cacife_orders set total=0"), /apenas SELECT/);
  assert.throws(() => guardSelect("delete from cacife_orders"), /apenas SELECT/);
  assert.throws(() => guardSelect("select 1; drop table cacife_orders"), /apenas uma consulta/);
  assert.throws(() => guardSelect("with x as (delete from cacife_orders returning 1) select * from x"), /não permitida/);
  assert.throws(() => guardSelect("select * into nova from cacife_orders"), /não permitida/);
  assert.throws(() => guardSelect("select pg_sleep(10)"), /não permitida/);
});

test('rejeita vazio e não-select', () => {
  assert.throws(() => guardSelect(''), /vazio/);
  assert.throws(() => guardSelect('drop table x'), /apenas SELECT/);
});
