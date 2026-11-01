import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCatalogue, chat, fallbackReply, systemPrompt } from '../../server/chat.js';

const catalogue = [
  { sku: 'MS-gleevec', name: 'Imatinib Mesylate 400 mg', generic: 'Imatinib Mesylate', strength: '400 mg', form: 'Tablet', unit: 'Strips / Bottles', category: 'Oncology', ref: 'Gleevec (Novartis)', rx: true, cold: false, desc: 'CML', url: '/product/imatinib/' },
  { sku: 'MS-lantus', name: 'Insulin Glargine 100 IU/ml', generic: 'Insulin Glargine', strength: '100 IU/ml', form: 'Injection', unit: 'Pens / Vials', category: 'Diabetes & Insulin', ref: 'Lantus (Sanofi)', rx: true, cold: true, desc: 'Long-acting insulin', url: '/product/glargine/' },
];
const site = { id: 'mediseller', name: 'MediSeller', domain: 'mediseller.com', refPrefix: 'MS', contact: { whatsapp: '911234567890', email: 's@x', hours: '9-8' }, chatbot: { persona: 'MediSeller Assistant' }, shippingRegions: [{ region: 'Africa', countries: ['Nigeria'] }] };

test('searchCatalogue matches brand reference names', () => {
  assert.equal(searchCatalogue(catalogue, 'gleevec')[0].sku, 'MS-gleevec');
  assert.equal(searchCatalogue(catalogue, 'lantus insulin')[0].sku, 'MS-lantus');
  assert.equal(searchCatalogue(catalogue, 'zzz').length, 0);
});

test('system prompt contains the guardrails', () => {
  const p = systemPrompt(site);
  assert.match(p, /NEVER state prices/);
  assert.match(p, /NEVER give medical advice/);
  assert.match(p, /same language/);
});

test('chat runs tool calls (search → add_to_cart → handoff) and returns final text', async () => {
  const calls = [];
  const script = [
    { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'search_products', args: { query: 'gleevec' } } }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'add_to_cart', args: { sku: 'MS-gleevec', qty: 2 } } }, { functionCall: { name: 'handoff_to_agent', args: { summary: 'Wants Imatinib x2 to Nigeria' } } }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Added Imatinib to your cart. An agent will confirm the price on WhatsApp.' }] } }] },
  ];
  const ctx = { env: {}, site, catalogue, actions: [], sessionId: '123e4567-e89b-12d3-a456-426614174000', callGemini: async (_env, body) => { calls.push(structuredClone(body)); return script.shift(); } };
  const reply = await chat(ctx, [{ role: 'user', text: 'Do you have Gleevec? I need 2.' }]);
  assert.match(reply, /Added Imatinib/);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].contents.at(-1).parts[0].functionResponse.response.results[0].sku, 'MS-gleevec');
  assert.equal(ctx.actions.find((a) => a.type === 'add_to_cart').item.qty, 2);
  assert.match(ctx.actions.find((a) => a.type === 'handoff').url, /^https:\/\/wa\.me\/911234567890\?text=/);
});

test('add_to_cart with unknown sku is refused', async () => {
  const script = [
    { candidates: [{ content: { parts: [{ functionCall: { name: 'add_to_cart', args: { sku: 'nope' } } }] } }] },
    { candidates: [{ content: { parts: [{ text: 'ok' }] } }] },
  ];
  const ctx = { env: {}, site, catalogue, actions: [], sessionId: 'x'.repeat(36), callGemini: async () => script.shift() };
  await chat(ctx, [{ role: 'user', text: 'add nope' }]);
  assert.equal(ctx.actions.length, 0);
});

test('fallback (no API key) suggests products and WhatsApp', () => {
  const ctx = { site, catalogue, actions: [] };
  const r = fallbackReply(ctx, 'insulin');
  assert.match(r, /found 1 matching product/);
  assert.ok(ctx.actions.some((a) => a.type === 'handoff'));
  assert.equal(ctx.actions.find((a) => a.type === 'products').items[0].sku, 'MS-lantus');
});
