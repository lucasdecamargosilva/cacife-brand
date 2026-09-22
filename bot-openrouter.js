'use strict';
function makeChat({ apiKey, fetchImpl = fetch }) {
  return async function chat(payload) {
    const res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'X-Title': 'Cacife Bot' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`OpenRouter HTTP ${res.status}: ${t.slice(0, 120)}`);
    }
    return res.json();
  };
}
module.exports = { makeChat };
