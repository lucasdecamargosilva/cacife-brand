'use strict';
// Datas em fuso Brasil (UTC-3), sem libs externas.
const OFF = 3 * 3600000; // 3h em ms

function brParts(date) {
  // Componentes do dia local BR de um instante.
  const d = new Date(date.getTime() - OFF);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}
function ymd(y, m, d) {
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}
function startISOof(dateStr) {
  // Meia-noite BR do dia -> instante UTC (dia + 03:00Z).
  return `${dateStr}T03:00:00.000Z`;
}
function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(t);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

function resolvePeriod(spec, now = new Date()) {
  const p = brParts(now);
  const today = ymd(p.y, p.m, p.d);
  let start = today, end = today, label = 'hoje';

  if (spec && typeof spec === 'object' && spec.from && spec.to) {
    start = spec.from; end = spec.to; label = `${spec.from} a ${spec.to}`;
  } else {
    switch (spec) {
      case 'hoje': start = today; end = today; label = 'hoje'; break;
      case 'ontem': start = addDaysStr(today, -1); end = start; label = 'ontem'; break;
      case '7d': start = addDaysStr(today, -6); end = today; label = 'últimos 7 dias'; break;
      case '30d': start = addDaysStr(today, -29); end = today; label = 'últimos 30 dias'; break;
      case 'mes': start = ymd(p.y, p.m, 1); end = today; label = 'este mês'; break;
      default: start = addDaysStr(today, -29); end = today; label = 'últimos 30 dias';
    }
  }
  return {
    start, end, label,
    startISO: startISOof(start),
    endExclusiveISO: startISOof(addDaysStr(end, 1)),
  };
}

module.exports = { resolvePeriod };
