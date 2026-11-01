// POST /api/lead — every enquiry on every site lands here (checkout, quick quote, contact, business, chat).
import { json, rateLimited, verifyTurnstile, makeRef } from '../../server/util.js';
import { parseLead, saveLead, sheetRow, pushToSheet, sendEmails, sendMetaLead, whatsappText } from '../../server/leads.js';
import { supabaseReady, signedUrl, update } from '../../server/supabase.js';
import { getSite } from '../../server/site.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  if (rateLimited(`lead:${ip}`, 8)) return json({ ok: false, error: 'Too many requests. Please try again in a minute or message us on WhatsApp.' }, 429);

  const site = await getSite(context);
  const ct = request.headers.get('content-type') || '';
  let input;
  try {
    input = ct.includes('multipart/form-data') ? await request.formData() : await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }
  if (input.get?.('website') || input.website) return json({ ok: true, ref: makeRef(site.refPrefix) }); // honeypot

  const token = input.get?.('cf-turnstile-response') ?? input['cf-turnstile-response'];
  if (!(await verifyTurnstile(env, token, ip))) return json({ ok: false, error: 'Please complete the security check.' }, 400);

  const parsed = parseLead(input, { site, maxFiles: site.checkout?.rxMaxFiles, maxMB: site.checkout?.rxMaxMB });
  if (!parsed.ok) return json({ ok: false, errors: parsed.errors }, 422);
  const { lead, items } = parsed;

  const deliverable = supabaseReady(env) || env.SHEET_WEBHOOK_URL || (env.RESEND_API_KEY && env.EMAIL_FROM);
  if (!deliverable) {
    // Nothing configured (e.g. preview): tell the browser to fall back to WhatsApp/email so the lead isn't lost.
    return json({ ok: false, fallback: true, whatsappText: whatsappText(site, '', lead, items) }, 503);
  }

  let saved;
  try {
    saved = supabaseReady(env)
      ? await saveLead(env, site.id, site.refPrefix, parsed)
      : { ref: makeRef(site.refPrefix), attachments: [] };
  } catch (err) {
    console.error('saveLead', err);
    return json({ ok: false, fallback: true, whatsappText: whatsappText(site, '', lead, items) }, 502);
  }

  // Fan-out runs after the response is sent; each step is independent so one failure never blocks the others.
  context.waitUntil((async () => {
    let rxLinks = [];
    try {
      rxLinks = await Promise.all(saved.attachments.map((a) => signedUrl(env, 'prescriptions', a.storage_path)));
    } catch (e) { console.error('signedUrl', e); }
    const results = await Promise.allSettled([
      pushToSheet(env, sheetRow(site, saved, lead, items, rxLinks)),
      sendEmails(env, site, saved, lead, items, rxLinks),
      sendMetaLead(env, request, lead, lead.event_id),
    ]);
    results.forEach((r, i) => r.status === 'rejected' && console.error(['sheet', 'email', 'capi'][i], r.reason));
    if (saved.id && results[0].status === 'fulfilled' && results[0].value) {
      await update(env, 'leads', { id: saved.id }, { sheet_synced_at: new Date().toISOString() }).catch((e) => console.error('mark synced', e));
    }
  })());

  return json({
    ok: true,
    ref: saved.ref,
    channel: lead.contact_channel,
    whatsappText: whatsappText(site, saved.ref, lead, items),
  });
}

export const onRequest = () => json({ ok: false, error: 'Method not allowed' }, 405);
