// Gemini-powered assistant: product FAQs, lead capture, add-to-cart, human handoff. Multilingual.
import { countryByName, countryByIso, makeRef } from './util.js';
import { parseLead, saveLead, sheetRow, pushToSheet, sendEmails } from './leads.js';
import { supabaseReady } from './supabase.js';

export function searchCatalogue(catalogue, query, limit = 6) {
  const terms = String(query || '').toLowerCase().split(/[^a-z0-9.]+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  return catalogue
    .map((p) => {
      const hay = `${p.name} ${p.generic} ${p.ref} ${p.category} ${p.desc}`.toLowerCase();
      const strong = `${p.name} ${p.generic} ${p.ref}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (strong.includes(t) ? 3 : hay.includes(t) ? 1 : 0), 0);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p }) => ({ sku: p.sku, name: p.name, generic: p.generic, strength: p.strength, form: p.form, category: p.category, reference_brand: p.ref, prescription_required: p.rx, cold_chain: p.cold, unit: p.unit, about: p.desc, url: p.url }));
}

export function systemPrompt(site) {
  const regions = (site.shippingRegions || []).map((r) => `${r.region}: ${r.countries.join(', ')}`).join('; ');
  return `You are "${site.chatbot?.persona || site.name + ' Assistant'}", the website assistant for ${site.name} (${site.domain}).
${site.name} is an Indian exporter that helps patients, caregivers, doctors, pharmacies, importers, resellers and dropshippers worldwide get genuine medicines from India — especially medicines that are unavailable, very expensive or slow to obtain in their country.

HOW BUYING WORKS (assisted commerce): visitors add products to the cart and "check out", but nothing is paid on the website. Checkout sends a quote request; a human agent then confirms the best price, availability, documents and shipping, and closes the order on WhatsApp, email or a call. Prices are never shown on the site.
Prescription-only medicines are dispatched only against a valid prescription; buyers can upload it at checkout (optional) or share it with the agent later.
Shipping regions (indicative): ${regions}. Cold-chain items (insulin, biologics, GLP-1 pens) ship in temperature-controlled packaging.
Contact: WhatsApp +${site.contact?.whatsapp}, email ${site.contact?.email}, hours ${site.contact?.hours}.

RULES
- Reply in the same language the user writes in. Keep answers short (1–4 sentences or a short list), warm and professional.
- Use search_products before saying whether a medicine is listed. Only describe products using the data returned. If not listed, say an agent can check sourcing and offer to take their details.
- NEVER state prices, discounts, delivery dates or guarantees. Say an agent will confirm them.
- NEVER give medical advice: no diagnosis, dosing, switching, interactions or side-effect guidance. Say "Please consult your doctor" and offer an agent.
- If the user wants a quote, price, availability or delivery time, or asks for a human, or you are unsure twice: offer to connect them. Collect name, phone/WhatsApp number with country, country, product(s) and quantity, then call capture_lead. Then offer handoff_to_agent.
- If the user wants to add something to their cart, call add_to_cart with the sku from search results.
- Do not ask for payment details, passwords or ID documents. Do not invent policies, licences or certifications.
- Never claim a product is available "without prescription".`;
}

const TOOLS = [{
  functionDeclarations: [
    { name: 'search_products', description: 'Search the site catalogue by brand, generic name, condition or category.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
    { name: 'add_to_cart', description: "Add a product to the visitor's cart.", parameters: { type: 'OBJECT', properties: { sku: { type: 'STRING' }, qty: { type: 'INTEGER' }, unit: { type: 'STRING' } }, required: ['sku'] } },
    { name: 'capture_lead', description: 'Save the visitor as a lead so an agent can send a quote. Call once you have name, phone and country.', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, phone: { type: 'STRING', description: 'Phone/WhatsApp, ideally with + and country code' }, country: { type: 'STRING', description: 'Country name in English' }, email: { type: 'STRING' }, buyer_type: { type: 'STRING', enum: ['Patient', 'Caregiver', 'Doctor', 'Pharmacy', 'Hospital', 'Importer / Distributor', 'Reseller / Online seller', 'Dropshipper', 'Other'] }, products: { type: 'STRING', description: 'Products and quantities requested' }, notes: { type: 'STRING' } }, required: ['name', 'phone', 'country'] } },
    { name: 'handoff_to_agent', description: 'Connect the visitor to a human agent on WhatsApp with a summary of the conversation.', parameters: { type: 'OBJECT', properties: { summary: { type: 'STRING', description: 'One-paragraph summary for the agent, in English' } }, required: ['summary'] } },
  ],
}];

export async function runTool(ctx, name, args) {
  const { site, catalogue, env, actions, sessionId } = ctx;
  if (name === 'search_products') {
    const results = searchCatalogue(catalogue, args.query);
    return { results, note: results.length ? '' : 'No match in catalogue. An agent can check sourcing.' };
  }
  if (name === 'add_to_cart') {
    const p = catalogue.find((x) => x.sku === args.sku);
    if (!p) return { ok: false, error: 'Unknown sku. Search first.' };
    const unit = (args.unit || p.unit.split('/')[0]).trim();
    actions.push({ type: 'add_to_cart', item: { sku: p.sku, name: p.name, generic: p.generic, strength: p.strength, qty: Math.max(1, args.qty || 1), unit, rx: p.rx } });
    return { ok: true, added: p.name };
  }
  if (name === 'capture_lead') {
    const c = countryByName(args.country) || countryByIso(args.country);
    const parsed = parseLead({
      source: 'chat', channel: 'whatsapp', name: args.name, phone: args.phone, country: c?.iso || '',
      email: args.email || '', buyer_type: args.buyer_type || 'Other', consent: 'true',
      message: [args.products, args.notes].filter(Boolean).join(' — '),
      items: '[]', landing_page: ctx.page || '',
    }, { site });
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    try {
      const saved = supabaseReady(env) ? await saveLead(env, site.id, site.refPrefix, parsed) : { ref: makeRef(site.refPrefix), attachments: [] };
      ctx.leadId = saved.id;
      const jobs = Promise.allSettled([pushToSheet(env, sheetRow(site, saved, parsed.lead, [])), sendEmails(env, site, saved, parsed.lead, [])]);
      ctx.waitUntil?.(jobs);
      actions.push({ type: 'lead_captured', ref: saved.ref });
      return { ok: true, ref: saved.ref };
    } catch (e) {
      console.error('chat lead', e);
      return { ok: false, error: 'Could not save right now — offer WhatsApp handoff.' };
    }
  }
  if (name === 'handoff_to_agent') {
    const text = `Hello ${site.name}, I was chatting with your website assistant.\n\n${String(args.summary || '').slice(0, 800)}\n\n(Chat ID: ${sessionId.slice(0, 8)})`;
    actions.push({ type: 'handoff', url: `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent(text)}` });
    return { ok: true, note: 'A WhatsApp button is now shown to the visitor.' };
  }
  return { ok: false, error: 'Unknown tool' };
}

export async function callGemini(env, body) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(`${env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function chat(ctx, history) {
  const contents = history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }));
  for (let step = 0; step < 5; step++) {
    const data = await (ctx.callGemini || callGemini)(ctx.env, {
      systemInstruction: { parts: [{ text: systemPrompt(ctx.site) }] },
      contents,
      tools: TOOLS,
      generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
    });
    const parts = data.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return parts.map((p) => p.text || '').join('').trim() || 'Sorry, could you rephrase that?';
    contents.push({ role: 'model', parts });
    const responses = [];
    for (const { functionCall } of calls) {
      const out = await runTool(ctx, functionCall.name, functionCall.args || {});
      responses.push({ functionResponse: { name: functionCall.name, response: out } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return 'Let me connect you with an agent who can help further.';
}

/** Used when no GEMINI_API_KEY is configured (e.g. preview): keyword search + WhatsApp handoff. */
export function fallbackReply(ctx, lastText) {
  const results = searchCatalogue(ctx.catalogue, lastText, 4);
  ctx.actions.push({ type: 'handoff', url: `https://wa.me/${ctx.site.contact.whatsapp}?text=${encodeURIComponent(`Hello ${ctx.site.name}, I need help with: ${lastText}`)}` });
  if (results.length) {
    ctx.actions.push({ type: 'products', items: results.map((r) => ({ name: r.name, url: r.url, sku: r.sku })) });
    return `I found ${results.length} matching product${results.length > 1 ? 's' : ''}. Tap one to view it, or message an agent on WhatsApp for the best price and delivery to your country.`;
  }
  return 'Our agents can help with that — tap the WhatsApp button and we will reply shortly.';
}
