const test = require('node:test'), assert = require('node:assert/strict');
const ml = require('./mercadolivre');
ml.authorize = async ({ authorization }) => { if (authorization !== 'Bearer ok') throw new Error('não'); };
const { createApp } = require('./server');

test('POST /api/whatsapp/send no painel local: exige sessão + anti-CSRF + conta e JSON; erros sem detalhes internos', async () => {
  const sent = [];
  const whatsapp = { status: async () => ({}), chats: async () => ({}), messages: async () => ({}), send: async (a) => { sent.push(a); if (a.text === 'erro') { const e = new Error('segredo-interno'); e.status = 502; throw e; } return { ok: true, id: 'X1' }; } };
  const app = createApp({ port: 8889, channelsConfig: { serviceKey: 'k' }, whatsapp, store: { data: { tokens: {}, orders: {}, sync: {} } } });
  const srv = await new Promise(r => { const s = app.listen(8889, '127.0.0.1', () => r(s)); });
  try {
    const B = 'http://127.0.0.1:8889';
    const s = await fetch(B + '/api/session'); const cookie = s.headers.get('set-cookie').split(';')[0]; const { csrf } = await s.json();
    const post = (h, body, type = 'application/json') => fetch(B + '/api/whatsapp/send', { method: 'POST', headers: { 'content-type': type, ...h }, body });
    const json = JSON.stringify({ chat: '5511999998888@s.whatsapp.net', text: 'oi' });
    assert.equal((await post({ authorization: 'Bearer ok' }, json)).status, 403); // sem cookie de sessão
    assert.equal((await post({ cookie, authorization: 'Bearer ok' }, json)).status, 403); // sem cabeçalho anti-CSRF
    assert.equal((await post({ cookie, 'x-cacife-local': csrf, authorization: 'Bearer ok', origin: 'https://evil.example' }, json)).status, 403); // outra origem
    assert.equal((await post({ cookie, 'x-cacife-local': csrf, authorization: 'Bearer outro' }, json)).status, 401); // outra conta
    assert.equal((await post({ cookie, 'x-cacife-local': csrf, authorization: 'Bearer ok' }, json, 'text/plain')).status, 415); // formulário/texto
    assert.equal(sent.length, 0);
    const ok = await post({ cookie, 'x-cacife-local': csrf, authorization: 'Bearer ok' }, json);
    assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), { ok: true, id: 'X1' });
    assert.equal(sent[0].chat, '5511999998888@s.whatsapp.net'); assert.equal(sent[0].text, 'oi'); assert.match(sent[0].who, /^local:[a-f0-9]{12}$/);
    const bad = await post({ cookie, 'x-cacife-local': csrf, authorization: 'Bearer ok' }, JSON.stringify({ chat: '5511999998888@s.whatsapp.net', text: 'erro' }));
    assert.equal(bad.status, 502); assert(!(await bad.text()).includes('segredo-interno'));
  } finally { srv.close(); }
});
