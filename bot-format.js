'use strict';
// Formata centavos em reais no padrão BR (sem depender de ICU), para a IA só repetir.
function brl(cents) {
  const v = Number(cents || 0) / 100;
  const neg = v < 0 ? '-' : '';
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  return 'R$ ' + neg + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

function fmtChannel(c) {
  if (!c || c.error) return { erro: true, aviso: 'canal não respondeu' };
  return { faturamento: brl(c.revenue), liquido: brl(c.net), pedidos: c.orders };
}

function fmtOverview(ov) {
  return {
    periodo: ov.period.label,
    canais: {
      shopee: fmtChannel(ov.channels.shopee),
      mercadolivre: fmtChannel(ov.channels.mercadolivre),
      nuvemshop: fmtChannel(ov.channels.nuvemshop),
    },
    total: { faturamento: brl(ov.total.revenue), liquido: brl(ov.total.net), pedidos: ov.total.orders },
  };
}

module.exports = { brl, fmtChannel, fmtOverview };
