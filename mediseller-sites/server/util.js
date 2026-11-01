import { countries } from '../src/lib/countries.js';

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const clean = (v, max = 500) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
export const cleanMultiline = (v, max = 2000) => (typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

export const countryByIso = (iso) => countries.find((c) => c.iso === String(iso || '').toUpperCase());
export const countryByName = (name) => countries.find((c) => c.name.toLowerCase() === String(name || '').toLowerCase());

/** Normalise any phone input to E.164 using the buyer's country. Returns '' if invalid. */
export function toE164(raw, iso) {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  let digits;
  if (s.startsWith('+')) digits = s.slice(1).replace(/\D/g, '');
  else {
    const c = countryByIso(iso);
    const national = s.replace(/\D/g, '').replace(/^0+/, '');
    if (!c) return '';
    // Number already includes the country code (common in WhatsApp copy-paste)
    digits = national.startsWith(c.dial) && national.length > c.dial.length + 6 ? national : c.dial + national;
  }
  if (digits.length < 8 || digits.length > 15) return '';
  return '+' + digits;
}

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || '');

/** MS-YYMMDD-XXXX (IST date) — readable over the phone, no ambiguous characters. */
export function makeRef(prefix = 'MS', now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const d = ist.toISOString().slice(2, 10).replace(/-/g, '');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const tail = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `${prefix}-${d}-${tail}`;
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Best-effort per-isolate rate limiter. Pair with a Cloudflare WAF rate-limit rule in production. */
const hits = new Map();
export function rateLimited(key, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}

export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // not configured → skip
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip || '' }),
  });
  const data = await res.json().catch(() => ({}));
  return !!data.success;
}
