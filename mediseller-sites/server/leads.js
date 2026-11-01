import { clean, cleanMultiline, toE164, isEmail, makeRef, countryByIso, sha256 } from './util.js';
import * as db from './supabase.js';

export const CHANNELS = ['whatsapp', 'rfq', 'email', 'call'];
export const SOURCES = ['checkout', 'quick_quote', 'contact', 'business', 'chat'];
export const BUYER_TYPES = ['Patient', 'Caregiver', 'Doctor', 'Pharmacy', 'Hospital', 'Importer / Distributor', 'Reseller / Online seller', 'Dropshipper', 'Other'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

/** Turn raw input (object from JSON or FormData) into a validated lead. */
export function parseLead(input, { site, maxFiles = 3, maxMB = 10 } = {}) {
  const get = (k) => (typeof input.get === 'function' ? input.get(k) : input[k]);
  const errors = {};

  const countryIso = clean(get('country'), 2).toUpperCase();
  const country = countryByIso(countryIso);
  const lead = {
    source: SOURCES.includes(get('source')) ? get('source') : 'checkout',
    contact_channel: CHANNELS.includes(get('channel')) ? get('channel') : 'rfq',
    name: clean(get('name'), 120),
    phone_raw: clean(get('phone'), 40),
    phone_e164: toE164(get('phone'), countryIso),
    email: clean(get('email'), 200).toLowerCase(),
    country: country?.name || '',
    country_iso: country?.iso || '',
    city: clean(get('city'), 120),
    buyer_type: BUYER_TYPES.includes(get('buyer_type')) ? get('buyer_type') : 'Other',
    company: clean(get('company'), 200),
    message: cleanMultiline(get('message'), 2000),
    call_slot: clean(get('call_slot'), 120),
    call_tz: clean(get('call_tz'), 64),
    consent: ['true', 'on', '1', true].includes(get('consent')),
    utm_source: clean(get('utm_source'), 120),
    utm_medium: clean(get('utm_medium'), 120),
    utm_campaign: clean(get('utm_campaign'), 120),
    landing_page: clean(get('landing_page'), 500),
    referrer: clean(get('referrer'), 500),
    rx_later: ['true', 'on', '1', true].includes(get('rx_later')),
    event_id: clean(get('event_id'), 64),
  };

  if (lead.name.length < 2) errors.name = 'Please enter your name.';
  if (!lead.country) errors.country = 'Please choose your country.';
  if (!lead.phone_e164) errors.phone = 'Please enter a valid phone / WhatsApp number.';
  if (lead.email && !isEmail(lead.email)) errors.email = 'Please enter a valid email.';
  if (lead.contact_channel === 'email' && !lead.email) errors.email = 'Email is needed to email you the quote.';
  if (!lead.consent) errors.consent = 'Please accept the privacy policy so we can contact you.';
  if (lead.contact_channel === 'call' && !lead.call_slot) errors.call_slot = 'Please choose a preferred time for the call.';

  let items = [];
  try {
    const raw = get('items');
    items = (typeof raw === 'string' ? JSON.parse(raw || '[]') : raw || []).slice(0, 50).map((i) => ({
      product_sku: clean(i.sku, 80),
      product_name: clean(i.name, 200),
      qty: Math.max(1, Math.min(100000, parseInt(i.qty, 10) || 1)),
      unit: clean(i.unit, 40),
      note: clean(i.note, 300),
    })).filter((i) => i.product_name);
  } catch { errors.items = 'Cart data could not be read.'; }
  if (lead.source === 'checkout' && !items.length) errors.items = 'Your cart is empty.';

  const files = [];
  if (typeof input.getAll === 'function') {
    for (const f of input.getAll('rx')) {
      if (!f || typeof f === 'string' || !f.size) continue;
      if (files.length >= maxFiles) { errors.rx = `Up to ${maxFiles} files.`; break; }
      if (f.size > maxMB * 1024 * 1024) { errors.rx = `Each file must be under ${maxMB} MB.`; continue; }
      if (f.type && !ALLOWED_MIME.includes(f.type)) { errors.rx = 'Upload a photo (JPG/PNG/HEIC) or PDF.'; continue; }
      files.push(f);
    }
  }
  return { lead, items, files, errors, ok: Object.keys(errors).length === 0 };
}

/** Persist to Supabase. Returns { id, ref, attachments:[{path}] }. */
export async function saveLead(env, siteId, refPrefix, { lead, items, files }) {
  const ref = makeRef(refPrefix);
  const { rx_later, event_id, phone_raw, ...row } = lead;
  const [saved] = await db.insert(env, 'leads', [{ ...row, ref_no: ref, site_id: siteId, rx_later, phone_raw, status: 'new' }]);
  if (items.length) await db.insert(env, 'lead_items', items.map((i) => ({ ...i, lead_id: saved.id })), { returning: false });
  const attachments = [];
  for (const [n, f] of files.entries()) {
    const ext = (f.name?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    const path = `${siteId}/${ref}/rx-${n + 1}.${ext}`;
    await db.uploadFile(env, 'prescriptions', path, f);
    attachments.push({ lead_id: saved.id, kind: 'prescription', storage_path: path, mime: f.type, size: f.size });
  }
  if (attachments.length) await db.insert(env, 'attachments', attachments, { returning: false });
  return { id: saved.id, ref, attachments, created_at: saved.created_at };
}

export const itemsText = (items) => items.map((i, n) => `${n + 1}. ${i.product_name} — ${i.qty} ${i.unit}${i.note ? ` (${i.note})` : ''}`).join('\n');

export function whatsappText(site, ref, lead, items) {
  return [
    `Hello ${site.name}, I'd like a quote.`,
    ref ? `Ref: ${ref}` : '',
    items.length ? `\n${itemsText(items)}\n` : '',
    `Name: ${lead.name}`,
    `Country: ${lead.country}${lead.city ? `, ${lead.city}` : ''}`,
    lead.buyer_type ? `I am: ${lead.buyer_type}` : '',
    lead.message ? `Note: ${lead.message}` : '',
  ].filter(Boolean).join('\n');
}

/** Row for the Google Sheet (order must match integrations/google-sheet/Code.gs HEADERS). */
export function sheetRow(site, saved, lead, items, rxLinks = []) {
  const ist = new Date(Date.now() + 5.5 * 3600e3).toISOString().replace('T', ' ').slice(0, 16);
  return [
    saved.ref, ist, site.name, lead.source, lead.contact_channel, lead.name, lead.phone_e164, lead.email,
    lead.country, lead.city, lead.buyer_type, lead.company, itemsText(items), rxLinks.join('\n') || (lead.rx_later ? 'Will share later' : ''),
    lead.message, lead.call_slot ? `${lead.call_slot} (${lead.call_tz})` : '',
    [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / '), 'New', '',
  ];
}

export async function pushToSheet(env, row) {
  if (!env.SHEET_WEBHOOK_URL) return false;
  const res = await fetch(env.SHEET_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: env.SHEET_WEBHOOK_TOKEN || '', row }),
    redirect: 'follow',
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.ok !== true) throw new Error(`Sheet push failed: ${res.status} ${JSON.stringify(out).slice(0, 200)}`);
  return true;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendEmails(env, site, saved, lead, items, rxLinks = []) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const send = (to, subject, html, replyTo) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  }).then(async (r) => { if (!r.ok) throw new Error(`Resend ${r.status} ${await r.text()}`); });

  const table = items.length
    ? `<table cellpadding="6" style="border-collapse:collapse;border:1px solid #e2e8f0">${items.map((i) => `<tr><td style="border:1px solid #e2e8f0">${esc(i.product_name)}</td><td style="border:1px solid #e2e8f0">${i.qty} ${esc(i.unit)}</td><td style="border:1px solid #e2e8f0">${esc(i.note)}</td></tr>`).join('')}</table>`
    : '<p>(No cart items)</p>';
  const jobs = [];
  const salesTo = env.SALES_EMAIL || site.contact?.email;
  if (salesTo) {
    jobs.push(send(salesTo, `[${saved.ref}] New ${lead.contact_channel.toUpperCase()} lead — ${lead.name}, ${lead.country}`, `
      <h2>New lead ${esc(saved.ref)}</h2>
      <p><b>${esc(lead.name)}</b> · ${esc(lead.buyer_type)} · ${esc(lead.country)} ${esc(lead.city)}<br>
      Phone/WhatsApp: <a href="https://wa.me/${lead.phone_e164.slice(1)}">${esc(lead.phone_e164)}</a><br>
      Email: ${esc(lead.email) || '—'} · Company: ${esc(lead.company) || '—'}<br>
      Channel: <b>${esc(lead.contact_channel)}</b> · Source: ${esc(lead.source)}${lead.call_slot ? `<br>Call: ${esc(lead.call_slot)} (${esc(lead.call_tz)})` : ''}</p>
      ${table}
      ${lead.message ? `<p><b>Message:</b> ${esc(lead.message)}</p>` : ''}
      ${rxLinks.length ? `<p><b>Prescription:</b> ${rxLinks.map((u, n) => `<a href="${esc(u)}">file ${n + 1}</a>`).join(' · ')} (links expire in 7 days)</p>` : lead.rx_later ? '<p>Prescription: buyer will share later.</p>' : ''}`,
      lead.email || undefined));
  }
  if (lead.email && ['email', 'rfq', 'call'].includes(lead.contact_channel)) {
    jobs.push(send(lead.email, `We received your request — ${saved.ref}`, `
      <p>Dear ${esc(lead.name)},</p>
      <p>Thank you for contacting ${esc(site.name)}. Your reference number is <b>${esc(saved.ref)}</b>.</p>
      <p>An agent will confirm the best price, availability and shipping to ${esc(lead.country)} — usually within a few working hours.</p>
      ${table}
      <p>Need it faster? Message us on WhatsApp: <a href="https://wa.me/${esc(site.contact?.whatsapp)}">+${esc(site.contact?.whatsapp)}</a></p>
      <p style="color:#64748b;font-size:12px">Prescription-only medicines are dispatched only against a valid prescription. We do not provide medical advice — please consult your doctor.</p>`));
  }
  await Promise.all(jobs);
  return true;
}

export async function sendMetaLead(env, request, lead, eventId, value = {}) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return false;
  const user_data = {
    ph: [await sha256(lead.phone_e164.replace('+', ''))],
    ...(lead.email ? { em: [await sha256(lead.email)] } : {}),
    country: [await sha256(lead.country_iso.toLowerCase())],
    client_ip_address: request.headers.get('cf-connecting-ip') || undefined,
    client_user_agent: request.headers.get('user-agent') || undefined,
  };
  const res = await fetch(`https://graph.facebook.com/v21.0/${env.META_PIXEL_ID}/events?access_token=${env.META_CAPI_TOKEN}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      data: [{ event_name: 'Lead', event_time: Math.floor(Date.now() / 1000), event_id: eventId || undefined, action_source: 'website', event_source_url: lead.landing_page || undefined, user_data, custom_data: { lead_channel: lead.contact_channel, ...value } }],
      ...(env.META_TEST_EVENT_CODE ? { test_event_code: env.META_TEST_EVENT_CODE } : {}),
    }),
  });
  if (!res.ok) throw new Error(`CAPI ${res.status}`);
  return true;
}
