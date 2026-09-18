(function (root) {
    'use strict';
    const channels = [
        { id: 'nuvemshop', name: 'Nuvemshop', available: true },
        { id: 'mercadolivre', name: 'Mercado Livre', available: true },
        { id: 'shopee', name: 'Shopee', available: true },
        { id: 'tiktokshop', name: 'TikTok Shop', available: false }
    ];
    function money(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
        const raw = String(value ?? '').replace(/R\$|\s/g, '');
        const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
        if (!/^-?\d+(\.\d+)?$/.test(normalized)) throw new Error('Há pedidos com valor inválido. Revise a origem dos dados.');
        return Math.round(Number(normalized) * 100);
    }
    const dayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'});
    function day(date) {
        return dayFormatter.format(new Date(date));
    }
    function shift(date, days) {
        const d = new Date(date + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
    }
    function range(start, end) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
            throw new Error('Escolha uma data inicial anterior ou igual à final.');
        }
        const length = Math.round((new Date(end + 'T12:00:00Z') - new Date(start + 'T12:00:00Z')) / 86400000) + 1;
        if (!Number.isFinite(length) || length > 366) throw new Error('Selecione no máximo 366 dias por consulta.');
        return { start: start + 'T00:00:00-03:00', end: shift(end, 1) + 'T00:00:00-03:00', previous: shift(start, -length) + 'T00:00:00-03:00' };
    }
    function summarize(rows, selected = 'all') {
        const seen = new Set();
        const result = { revenue: 0, paid: 0, orders: 0, cancelled: 0, pending: 0, byDay: {}, byChannel: {} };
        for (const row of rows) {
            const channel = row.channel || 'nuvemshop';
            if (!channels.some(c => c.id === channel && c.available)) continue;
            if (selected !== 'all' && selected !== channel) continue;
            const id = row.id_pedido;
            if (id === null || id === undefined || String(id).trim() === '') throw new Error('Há pedidos sem identificador. Revise a origem dos dados.');
            const key = channel + ':' + id;
            // The ingestion contract must be one row per order. Do not guess whether repeated totals are line items.
            if (seen.has(key)) throw new Error('Há mais de uma linha para o mesmo pedido. Valide a consolidação antes de somar as vendas.');
            seen.add(key);
            const payment = String(row.payment_status || '').toLowerCase().trim();
            const state = String(row.status || '').toLowerCase().trim();
            const cancelled = /cancel|estorn|refund|reembols/.test(payment + ' ' + state);
            const paid = !cancelled && ['paid', 'confirmado', 'approved'].includes(payment);
            const cents = paid ? money(row.total) : 0;
            result.orders++;
            result.cancelled += Number(cancelled);
            result.pending += Number(!cancelled && ['pending', 'pendente', 'aguardando pagamento'].includes(payment));
            result.paid += Number(paid);
            result.revenue += cents;
            const bucket = result.byChannel[channel] ||= { orders: 0, paid: 0, revenue: 0, byDay: {} };
            bucket.orders++;
            bucket.paid += Number(paid);
            bucket.revenue += cents;
            const date = day(row.created_at);
            bucket.byDay[date] = (bucket.byDay[date] || 0) + cents;
            result.byDay[date] = (result.byDay[date] || 0) + cents;
        }
        result.ticket = result.paid ? result.revenue / result.paid : 0;
        return result;
    }
    function topProducts(byChannel,limit=5){
        const products=new Map();
        for(const [channel,bucket]of Object.entries(byChannel))for(const item of bucket.ranking||[]){
            const units=item.units??item.quantity,value=item.value;if(!Number.isSafeInteger(value)||!Number.isSafeInteger(units)||units<=0||value<0)continue;
            const key=channel+':'+item.id;const row=products.get(key)||{id:item.id,channel,title:item.title||'Produto',units:0,value:0};row.units+=units;row.value+=value;products.set(key,row);
        }
        return [...products.values()].sort((a,b)=>b.value-a.value||b.units-a.units||a.title.localeCompare(b.title)).slice(0,limit);
    }
    const api = { channels, money, day, shift, range, summarize, topProducts };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CacifeMetrics = api;
})(typeof window !== 'undefined' ? window : globalThis);
