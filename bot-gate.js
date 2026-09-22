'use strict';
function normalizeNumber(raw) {
  if (!raw) return '';
  let d = String(raw).split('@')[0].replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d;
}
function isAllowed(raw, allowed = '11938034714') {
  return normalizeNumber(raw) === normalizeNumber(allowed);
}
module.exports = { normalizeNumber, isAllowed };
