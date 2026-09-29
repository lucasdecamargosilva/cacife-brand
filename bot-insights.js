'use strict';
// Cruzamento entre canais para perguntas de estratégia ("onde investir", "o que vende bem num canal e mal no outro").
// Todos os números são calculados aqui e já saem formatados — a IA só interpreta, nunca faz conta.
const { overview, productSql, semAcento, ISO_RE, TT_SHOP } = require('./bot-data');

const CANAIS = ['shopee', 'mercadolivre', 'nuvemshop', 'tiktokshop'];
const NOME = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', nuvemshop: 'Nuvemshop', tiktokshop: 'TikTok Shop' };

const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);
const brl = (reais) => { const v = num(reais); const neg = v < 0 ? '-' : ''; const [i, d] = Math.abs(v).toFixed(2).split('.'); return 'R$ ' + neg + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; };
const pct = (x, casas = 1) => (Number.isFinite(x) ? x.toFixed(casas).replace('.', ',') + '%' : '—');
const varPct = (atual, antes) => (antes > 0 ? (atual >= antes ? '+' : '') + pct(((atual - antes) / antes) * 100) : 'sem base');
const titulo = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// Palavras de descrição (formato, cor, marketing) — o que sobra é o nome do modelo (Madrid, Lyon, Miami...).
const STOP = new Set(('oculos de sol do da das dos e com para por kit esportivo esportiva quadrado quadrada redondo redonda aviador '
  + 'masculino masculina feminino feminina unissex premium classico classica polarizado polarizada old money original armacao '
  + 'gatinho hexagonal retro vintage oval retangular preto preta cacife moda tendencia tendencias basico luxo lente lentes uv400 '
  + 'protecao estiloso estilosa linha verao hype flexivel steampunk metal metalico acetato fosco fosca edicao limitada somente '
  + 'cinza marrom degrade cristal prata espelhado espelhada runner ciclismo bike corrida pace futevolei baixa grande pequeno novo '
  + 'nova azul verde rosa vermelho branco dourado tartaruga transparente claro escuro modelo estilo sport sports geometrico '
  + 'oldstyle masc fem blogueira blogueiro influencer ntf uv cor lancamento promocao oferta hike trilha praia '
  + 'rose brand case estojo branco branca beach tennis caminhada qualidade alta tamanho altura largura madeira bambu '
  + 'pedal ftv correr run anti reflexo desenho esportivos brinde gratis presente acompanha').split(' '));
// Mesmo modelo com nomes diferentes entre canais.
const ALIAS = { alok: 'soldador' };

function tokens(name) { return semAcento(name).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map((t) => ALIAS[t] || t); }
// Primeiro termo "de modelo" do nome (candidato a entrar no dicionário).
function modeloCandidato(name) {
  for (const t of tokens(name)) if (t.length >= 3 && !STOP.has(t) && !/\d/.test(t)) return t;
  return null;
}

// Período anterior de mesmo tamanho, terminando onde o atual começa.
function periodoAnterior(per) {
  const ini = Date.parse(per.startISO), fim = Date.parse(per.endExclusiveISO);
  const len = fim - ini;
  return { startISO: new Date(ini - len).toISOString(), endExclusiveISO: per.startISO, label: 'período anterior de mesmo tamanho' };
}

async function linhasProdutos(deps, per, canal) {
  const rows = await deps.pgQuery(productSql(per, canal, { limit: 500, max: 500, shop: deps.tiktokShop }));
  return (rows || []).map((r) => ({ nome: String(r.produto || '').trim(), pedidos: num(r.pedidos), unidades: num(r.unidades), valor: num(r.valor) }));
}

async function devolucoes(deps, per) {
  if (!ISO_RE.test(per.startISO) || !ISO_RE.test(per.endExclusiveISO)) throw new Error('período inválido');
  const win = `created_at >= '${per.startISO}' and created_at < '${per.endExclusiveISO}'`;
  const tt = TT_SHOP.test(String(deps.tiktokShop || ''));
  const sql = `select 'shopee' canal, count(*) n, coalesce(sum(refund_amount),0) valor from shopee_returns where ${win}`
    + (tt ? ` union all select 'tiktokshop', count(*), coalesce(sum(refund_amount),0) from tiktok_returns where ${win}` : '');
  const out = {};
  for (const r of (await deps.pgQuery(sql)) || []) out[r.canal] = { qtd: num(r.n), valor: num(r.valor) };
  return out;
}

// Primeiro dia com histórico "cheio" por canal (dia com >= metade da mediana diária dos últimos 60 dias).
// Evita comparar com um período anterior em que o canal ainda estava sendo importado (ex.: Shopee em ago/2026).
async function historicoInicio(deps) {
  const tt = TT_SHOP.test(String(deps.tiktokShop || ''));
  const dia = "date(created_at at time zone 'America/Sao_Paulo')";
  const src = [
    `select 'shopee' canal, ${dia} d, count(*) n from shopee_orders where payment_status='paid' group by 2`,
    `select channel, ${dia}, count(*) from cacife_orders where channel in ('mercadolivre','nuvemshop') group by 1, 2`,
  ];
  if (tt) src.push(`select 'tiktokshop', ${dia}, count(*) from tiktok_orders where shop_id='${deps.tiktokShop}' and payment_status='paid' group by 2`);
  const sql = `with dias as (${src.join(' union all ')}),
    med as (select canal, percentile_cont(0.5) within group (order by n) m from dias where d >= current_date - 60 group by canal)
    select dias.canal, to_char(min(d), 'YYYY-MM-DD') inicio from dias join med using (canal) where n >= med.m * 0.5 group by dias.canal`;
  const out = {};
  for (const r of (await deps.pgQuery(sql)) || []) out[r.canal] = r.inicio;
  return out;
}

async function crossChannel(deps, per) {
  const ant = periodoAnterior(per);
  const [ovA, ovB, dev, hist, ...prods] = await Promise.all([
    overview(deps, per),
    overview(deps, ant),
    devolucoes(deps, per).catch(() => ({})),
    historicoInicio(deps).catch(() => ({})),
    ...CANAIS.map((c) => linhasProdutos(deps, per, c).catch(() => null)),
  ]);
  const prodPor = Object.fromEntries(CANAIS.map((c, i) => [c, prods[i]]));

  // --- Canais: participação, crescimento, ticket, % que sobra ---
  const totalRev = ovA.total.revenue || 0;
  const canais = CANAIS.map((c) => {
    const a = ovA.channels[c] || {}, b = ovB.channels[c] || {};
    if (a.error) return { canal: NOME[c], erro: 'canal não respondeu agora' };
    // período anterior começa antes do histórico cheio do canal -> comparação não vale
    const semBase = b.error || (hist[c] && hist[c] > ant.startISO.slice(0, 10)) ? `sem base (histórico completo só desde ${hist[c] ? hist[c].split('-').reverse().join('/') : '?'})` : null;
    const rev = a.revenue / 100, net = a.net / 100;
    const linha = {
      canal: NOME[c], faturamento: brl(rev), participacao: pct(totalRev ? (a.revenue / totalRev) * 100 : 0),
      variacao_vs_periodo_anterior: semBase || varPct(a.revenue, b.revenue),
      pedidos: a.orders, variacao_pedidos: semBase || varPct(a.orders, b.orders),
      ticket_medio: brl(a.orders ? rev / a.orders : 0),
      liquido: brl(net), sobra_do_faturamento: pct(rev ? (net / rev) * 100 : 0),
      _rev: a.revenue,
    };
    if (c === 'nuvemshop') linha.sobra_do_faturamento = 'sem taxa registrada (loja própria; custos de gateway/frete não entram)';
    if (c === 'tiktokshop') linha.sobra_do_faturamento += ' (só pedidos já liquidados; recentes ainda não têm repasse)';
    const d = dev[c];
    if (d) { linha.devolucoes = d.qtd; linha.taxa_devolucao = pct(a.orders ? (d.qtd / a.orders) * 100 : 0); linha.valor_devolvido = brl(d.valor); }
    return linha;
  }).sort((x, y) => (y._rev || 0) - (x._rev || 0)).map(({ _rev, ...r }) => r);

  // --- Modelos cruzados entre canais ---
  // Dicionário de modelos: nomes que aparecem nos canais de título "limpo" (Nuvemshop, Shopee, TikTok).
  const dic = new Map();
  for (const c of ['nuvemshop', 'shopee', 'tiktokshop']) for (const p of prodPor[c] || []) {
    const m = modeloCandidato(p.nome); if (m) dic.set(m, (dic.get(m) || 0) + p.pedidos);
  }
  for (const [m, n] of dic) if (n < 5) dic.delete(m);
  const modelos = new Map(); const cobertura = {};
  for (const c of CANAIS) {
    const lista = prodPor[c]; if (!lista) continue;
    let tot = 0, achou = 0;
    for (const p of lista) {
      tot += p.pedidos;
      const m = tokens(p.nome).find((t) => dic.has(t)); if (!m) continue;
      achou += p.pedidos;
      const reg = modelos.get(m) || {}; const x = reg[c] || { pedidos: 0, valor: 0 };
      x.pedidos += p.pedidos; x.valor += p.valor; reg[c] = x; modelos.set(m, reg);
    }
    cobertura[c] = tot ? achou / tot : 0;
  }
  const confiavel = (c) => prodPor[c] && cobertura[c] >= 0.4; // canal com títulos que trazem o nome do modelo
  const ranking = [...modelos.entries()].map(([m, reg]) => {
    const total = CANAIS.reduce((s, c) => s + ((reg[c] && reg[c].pedidos) || 0), 0);
    const melhor = CANAIS.reduce((b, c) => (((reg[c] && reg[c].pedidos) || 0) > ((reg[b] && reg[b].pedidos) || 0) ? c : b), CANAIS[0]);
    return { m, reg, total, melhor };
  }).sort((a, b) => b.total - a.total);

  const oportunidades = [];
  const modelosOut = ranking.slice(0, 12).map(({ m, reg, total, melhor }) => {
    const topN = (reg[melhor] && reg[melhor].pedidos) || 0;
    const fracos = CANAIS.filter((c) => c !== melhor && confiavel(c) && ((reg[c] && reg[c].pedidos) || 0) < topN * 0.1);
    if (topN >= 30 && fracos.length) {
      oportunidades.push(`${titulo(m)}: ${topN} pedidos na ${NOME[melhor]}, mas ${fracos.map((c) => `${(reg[c] && reg[c].pedidos) || 0} na ${NOME[c]}`).join(' e ')}`);
    }
    return {
      modelo: titulo(m), pedidos_total: total, canal_mais_forte: NOME[melhor],
      concentracao_no_mais_forte: pct(total ? (topN / total) * 100 : 0, 0),
      por_canal: Object.fromEntries(CANAIS.filter((c) => reg[c]).map((c) => [NOME[c], { pedidos: reg[c].pedidos, valor: brl(reg[c].valor) }])),
    };
  });

  const avisos = [];
  const baixa = CANAIS.filter((c) => prodPor[c] && !confiavel(c));
  if (baixa.length) avisos.push(`${baixa.map((c) => NOME[c]).join(', ')}: títulos dos anúncios quase não trazem o nome do modelo (só ${baixa.map((c) => pct(cobertura[c] * 100, 0)).join('/')} dos pedidos identificados), então esse canal fica de fora da comparação por modelo.`);
  const curtos = CANAIS.filter((c) => hist[c] && hist[c] > per.startISO.slice(0, 10));
  if (curtos.length) avisos.push(`${curtos.map((c) => NOME[c] + ' (desde ' + hist[c].split('-').reverse().join('/') + ')').join(', ')}: histórico não cobre o período todo, então aparece menor que o real.`);
  avisos.push('Não temos custo de produto nem gasto com anúncios: "sobra do faturamento" é só depois das taxas do canal, não é lucro.');

  return {
    periodo: ovA.period.label, comparado_com: `${ant.label} (${ant.startISO.slice(0, 10)} a ${per.startISO.slice(0, 10)})`,
    total: { faturamento: brl(totalRev / 100), variacao_vs_periodo_anterior: CANAIS.some((c) => hist[c] && hist[c] > ant.startISO.slice(0, 10)) ? 'sem base completa (algum canal não tem histórico no período anterior)' : varPct(ovA.total.revenue, ovB.total.revenue), pedidos: ovA.total.orders, ticket_medio: brl(ovA.total.orders ? totalRev / 100 / ovA.total.orders : 0) },
    canais, modelos_mais_vendidos: modelosOut,
    oportunidades_entre_canais: oportunidades.length ? oportunidades : ['nenhum modelo forte num canal e quase ausente em outro neste período'],
    avisos,
  };
}

module.exports = { crossChannel, modeloCandidato, periodoAnterior, STOP };
