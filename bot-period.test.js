'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { resolvePeriod } = require('./bot-period');

// 2026-09-21 15:00 BR = 2026-09-21T18:00:00Z
const NOW = new Date('2026-09-21T18:00:00.000Z');

test('hoje = o dia local corrente, meia-noite BR até meia-noite BR seguinte', () => {
  const p = resolvePeriod('hoje', NOW);
  assert.strictEqual(p.start, '2026-09-21');
  assert.strictEqual(p.end, '2026-09-21');
  assert.strictEqual(p.startISO, '2026-09-21T03:00:00.000Z');
  assert.strictEqual(p.endExclusiveISO, '2026-09-22T03:00:00.000Z');
});

test('ontem = dia local anterior', () => {
  const p = resolvePeriod('ontem', NOW);
  assert.strictEqual(p.start, '2026-09-20');
  assert.strictEqual(p.end, '2026-09-20');
});

test('7d = 7 dias terminando hoje (inclui hoje)', () => {
  const p = resolvePeriod('7d', NOW);
  assert.strictEqual(p.start, '2026-09-15');
  assert.strictEqual(p.end, '2026-09-21');
});

test('mes = do dia 1 do mês corrente até hoje', () => {
  const p = resolvePeriod('mes', NOW);
  assert.strictEqual(p.start, '2026-09-01');
  assert.strictEqual(p.end, '2026-09-21');
});

test('intervalo custom respeita as datas dadas', () => {
  const p = resolvePeriod({ from: '2026-08-01', to: '2026-08-31' }, NOW);
  assert.strictEqual(p.start, '2026-08-01');
  assert.strictEqual(p.end, '2026-08-31');
  assert.strictEqual(p.endExclusiveISO, '2026-09-01T03:00:00.000Z');
});

test('90d = últimos 90 dias', () => {
  const p = resolvePeriod('90d', NOW);
  assert.strictEqual(p.end, '2026-09-21');
  assert.strictEqual(p.start, '2026-06-24');
});

test('3m = 3 meses atrás até hoje (normaliza mês)', () => {
  const p = resolvePeriod('3m', NOW);
  assert.strictEqual(p.end, '2026-09-21');
  assert.strictEqual(p.start, '2026-06-21');
  const jan = resolvePeriod('3m', new Date('2026-01-15T18:00:00.000Z'));
  assert.strictEqual(jan.start, '2025-10-15');
});

test('spec inválido cai em 30d', () => {
  const p = resolvePeriod('xpto', NOW);
  assert.strictEqual(p.start, '2026-08-23');
  assert.strictEqual(p.end, '2026-09-21');
});
