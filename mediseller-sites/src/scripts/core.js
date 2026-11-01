// Shared client helpers: config, storage, catalogue, cart store, analytics, lead submission.
import { countries } from '../lib/countries.js';

export const cfg = JSON.parse(document.getElementById('site-config')?.textContent || '{}');
export { countries };

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export const waUrl = (text) => `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(text)}`;

/* ---------- Catalogue ---------- */
let catPromise;
export const loadCatalogue = () => (catPromise ||= fetch('/catalogue.json').then((r) => r.json()).catch(() => []));

export function searchProducts(list, q, limit = 8) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return list
    .map((p) => {
      const strong = `${p.name} ${p.generic} ${p.ref}`.toLowerCase();
      const hay = `${strong} ${p.category} ${p.desc}`.toLowerCase();
      const all = terms.every((t) => hay.includes(t));
      const score = terms.reduce((s, t) => s + (strong.includes(t) ? 3 : hay.includes(t) ? 1 : 0), 0) + (strong.startsWith(terms[0]) ? 2 : 0);
      return { p, score: all ? score : 0 };
    })
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.p);
}

/* ---------- Cart ---------- */
const CART_KEY = `cart:${cfg.id}`;
const CART_TTL = 30 * 24 * 3600e3;
const listeners = new Set();
export const cart = {
  items() {
    const c = store.get(CART_KEY, { items: [], ts: Date.now() });
    if (Date.now() - (c.ts || 0) > CART_TTL) return [];
    return c.items || [];
  },
  save(items) { store.set(CART_KEY, { items, ts: Date.now() }); listeners.forEach((f) => f(items)); },
  add(item) {
    const items = cart.items();
    const ex = items.find((i) => i.sku === item.sku && i.unit === item.unit);
    if (ex) ex.qty = Math.min(100000, ex.qty + (item.qty || 1));
    else items.push({ qty: 1, note: '', ...item });
    cart.save(items);
    track('add_to_cart', { item_id: item.sku, item_name: item.name, quantity: item.qty || 1 }, 'AddToCart');
  },
  update(index, patch) { const items = cart.items(); if (items[index]) { Object.assign(items[index], patch); cart.save(items); } },
  remove(index) { const items = cart.items(); items.splice(index, 1); cart.save(items); },
  clear() { cart.save([]); },
  count() { return cart.items().length; },
  onChange(f) { listeners.add(f); },
};
window.addEventListener('storage', (e) => e.key === CART_KEY && listeners.forEach((f) => f(cart.items())));

/* ---------- Attribution (first touch, 30 days) ---------- */
export function attribution() {
  const KEY = 'attr';
  let a = store.get(KEY);
  const p = new URLSearchParams(location.search);
  if (!a || Date.now() - a.ts > 30 * 864e5 || p.get('utm_source')) {
    a = {
      utm_source: p.get('utm_source') || '', utm_medium: p.get('utm_medium') || '', utm_campaign: p.get('utm_campaign') || '',
      landing_page: location.href.slice(0, 500), referrer: document.referrer.slice(0, 500), ts: Date.now(),
    };
    store.set(KEY, a);
  }
  const { ts, ...rest } = a;
  return rest;
}

/* ---------- Analytics (only after consent) ---------- */
export function consentGiven() { return store.get('consent') === 'granted'; }
export function track(event, params = {}, metaEvent, eventId) {
  if (!consentGiven()) return;
  try { window.gtag?.('event', event, params); } catch {}
  if (metaEvent && window.fbq) {
    try {
      const std = ['ViewContent', 'AddToCart', 'InitiateCheckout', 'Lead', 'Contact', 'Search'].includes(metaEvent);
      window.fbq(std ? 'track' : 'trackCustom', metaEvent, params, eventId ? { eventID: eventId } : undefined);
    } catch {}
  }
}

export function loadAnalytics() {
  if (!consentGiven()) return;
  if (cfg.ga4 && !window.gtag) {
    const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${cfg.ga4}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date()); window.gtag('config', cfg.ga4);
  }
  if (cfg.pixel && !window.fbq) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', cfg.pixel); window.fbq('track', 'PageView');
  }
}

/* ---------- Country select ---------- */
let geoPromise;
const geo = () => (geoPromise ||= fetch('/api/geo').then((r) => (r.ok ? r.json() : {})).then((d) => d.country || '').catch(() => ''));
export async function fillCountrySelect(select, dialInput) {
  if (!select || select.options.length > 1) return;
  select.innerHTML = '<option value="">Select country…</option>' + countries.map((c) => `<option value="${c.iso}" data-dial="${c.dial}">${esc(c.name)}</option>`).join('');
  const sync = () => { const o = select.selectedOptions[0]; if (dialInput) dialInput.value = o?.dataset.dial ? `+${o.dataset.dial}` : ''; };
  select.addEventListener('change', () => { sync(); store.set('country', select.value); });
  const saved = store.get('country') || (await geo());
  if (saved && !select.value && countries.some((c) => c.iso === saved)) select.value = saved;
  sync();
}

/* ---------- Lead submission with graceful fallback ---------- */
export async function submitLead(data) {
  const eventId = uid();
  const fd = data instanceof FormData ? data : Object.entries(data).reduce((f, [k, v]) => (f.append(k, v), f), new FormData());
  Object.entries(attribution()).forEach(([k, v]) => !fd.has(k) && fd.append(k, v));
  fd.set('event_id', eventId);
  let res, body = {};
  try {
    res = await fetch('/api/lead', { method: 'POST', body: fd });
    body = await res.json().catch(() => ({}));
  } catch {
    body = { ok: false, fallback: true };
  }
  if (body.ok) track('generate_lead', { channel: fd.get('channel'), source: fd.get('source') }, 'Lead', eventId);
  return { status: res?.status || 0, ...body };
}

export function showErrors(form, errors = {}) {
  $$('.field', form).forEach((f) => { f.classList.remove('invalid'); const e = $('.err', f); if (e) e.textContent = ''; });
  for (const [k, msg] of Object.entries(errors)) {
    const input = form.querySelector(`[name="${k}"]`);
    const field = input?.closest('.field');
    if (field) { field.classList.add('invalid'); const e = $('.err', field); if (e) e.textContent = msg; }
  }
  const general = $('[data-form-error]', form);
  if (general) general.textContent = Object.keys(errors).length ? (errors.consent || errors.items || errors.rx || 'Please check the highlighted fields.') : '';
  form.querySelector('.invalid .input, .invalid select')?.focus();
}
