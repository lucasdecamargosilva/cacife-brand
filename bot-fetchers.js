'use strict';
// Adaptadores server-side (sem trava de login): buscam pedidos crus das APIs.
const UA = 'Cacife metrics (cacifebrand@outlook.com)';

function makeMlFetch({ getMlToken, mlUserId, fetchImpl = fetch }) {
  return async function mlOrders(start, end) {
    const token = await getMlToken();
    const from = `${start}T00:00:00.000-03:00`;
    const to = `${end}T23:59:59.999-03:00`;
    const out = [];
    let offset = 0;
    for (let i = 0; i < 40; i++) {
      const url = `https://api.mercadolibre.com/orders/search?seller=${encodeURIComponent(mlUserId)}`
        + `&order.date_created.from=${encodeURIComponent(from)}&order.date_created.to=${encodeURIComponent(to)}`
        + `&sort=date_desc&limit=50&offset=${offset}`;
      const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`ML HTTP ${r.status}`);
      const j = await r.json();
      const results = j.results || [];
      out.push(...results);
      const total = (j.paging && j.paging.total) || out.length;
      offset += 50;
      if (offset >= total || results.length === 0) break;
    }
    return out;
  };
}

function makeNsFetch({ token, storeId, fetchImpl = fetch }) {
  return async function nsOrders(start, end) {
    const base = `https://api.nuvemshop.com.br/2025-03/${storeId}/orders`;
    let url = `${base}?created_at_min=${start}T00:00:00-03:00&created_at_max=${end}T23:59:59-03:00`
      + `&per_page=200&fields=id,total,paid_at,status,created_at`;
    const out = [];
    for (let i = 0; i < 40 && url; i++) {
      const r = await fetchImpl(url, { headers: { Authentication: `bearer ${token}`, 'User-Agent': UA }, signal: AbortSignal.timeout(25000), redirect: 'error' });
      if (r.status === 404) break; // sem próxima página / vazio
      if (!r.ok) throw new Error(`NS HTTP ${r.status}`);
      const page = await r.json();
      out.push(...(Array.isArray(page) ? page : []));
      const link = r.headers.get('link') || '';
      const next = /<([^>]+)>;\s*rel="next"/.exec(link);
      url = next ? next[1] : null;
    }
    return out;
  };
}

module.exports = { makeMlFetch, makeNsFetch };
