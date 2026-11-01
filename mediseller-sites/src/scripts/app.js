// Global UI: cart drawer, live search, quick-quote modal, chat widget, consent, menu.
import { cfg, $, $$, esc, cart, toast, loadCatalogue, searchProducts, waUrl, store, loadAnalytics, track, fillCountrySelect, submitLead, showErrors, uid } from './core.js';

/* ---------- Menu ---------- */
$('[data-menu]')?.addEventListener('click', (e) => {
  const nav = $('#main-nav');
  const open = nav.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});

/* ---------- Cart drawer ---------- */
const drawer = $('#cart-drawer');
const overlay = $('[data-overlay]');
function openCart() { drawer.classList.add('open'); overlay.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); $('[data-close-cart]')?.focus(); }
function closeCart() { drawer.classList.remove('open'); overlay.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
$$('[data-open-cart]').forEach((b) => b.addEventListener('click', openCart));
$('[data-close-cart]')?.addEventListener('click', closeCart);
overlay?.addEventListener('click', closeCart);
document.addEventListener('keydown', (e) => e.key === 'Escape' && (closeCart(), closeChat()));

export function lineHTML(i, n) {
  const units = ['Strips', 'Boxes', 'Bottles', 'Vials', 'Pens', 'Packs', 'Tablets'];
  if (i.unit && !units.includes(i.unit)) units.unshift(i.unit);
  return `<div class="line" data-i="${n}">
    <div>
      <div class="name">${esc(i.name)} ${i.rx ? '<span class="badge badge-rx">Rx</span>' : ''}</div>
      <div class="meta">${esc(i.generic || '')}</div>
      <div class="ctrl">
        <label class="sr-only" for="q${n}">Quantity</label>
        <input class="input" id="q${n}" type="number" min="1" max="100000" value="${i.qty}" data-qty />
        <select class="input" data-unit aria-label="Unit">${units.map((u) => `<option ${u === i.unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
        <input class="input note" placeholder="Note (e.g. urgent, alternative brand ok)" value="${esc(i.note || '')}" maxlength="300" data-note aria-label="Note" />
      </div>
    </div>
    <button class="icon-btn" type="button" data-remove aria-label="Remove ${esc(i.name)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
  </div>`;
}
export function bindLines(container) {
  container.addEventListener('change', (e) => {
    const line = e.target.closest('.line'); if (!line) return;
    const n = +line.dataset.i;
    if (e.target.matches('[data-qty]')) cart.update(n, { qty: Math.max(1, Math.min(100000, parseInt(e.target.value, 10) || 1)) });
    if (e.target.matches('[data-unit]')) cart.update(n, { unit: e.target.value });
    if (e.target.matches('[data-note]')) cart.update(n, { note: e.target.value.slice(0, 300) });
  });
  container.addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    cart.remove(+b.closest('.line').dataset.i);
  });
}
function renderCart() {
  const items = cart.items();
  $$('[data-cart-count]').forEach((el) => { el.textContent = items.length; el.dataset.n = items.length; });
  const box = $('[data-cart-items]');
  if (!box) return;
  if (box.contains(document.activeElement) && document.activeElement.matches('input')) return; // don't re-render while typing
  box.innerHTML = items.length
    ? items.map(lineHTML).join('')
    : `<div class="empty"><p>Your cart is empty.</p><a class="btn btn-outline" href="/products/">Browse medicines</a></div>`;
  $('[data-checkout-link]')?.toggleAttribute('hidden', !items.length);
}
const drawerItems = $('[data-cart-items]');
if (drawerItems) bindLines(drawerItems);
cart.onChange(renderCart);
renderCart();

/* ---------- Add to cart (any [data-add] button) ---------- */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  const cat = await loadCatalogue();
  const p = cat.find((x) => x.sku === b.dataset.add); if (!p) return;
  const qtyInput = b.dataset.qtyFrom ? $(b.dataset.qtyFrom) : null;
  const unitInput = b.dataset.unitFrom ? $(b.dataset.unitFrom) : null;
  cart.add({
    sku: p.sku, name: p.name, generic: [p.generic, p.strength].filter(Boolean).join(' '), rx: p.rx,
    qty: Math.max(1, parseInt(qtyInput?.value, 10) || 1), unit: unitInput?.value || b.dataset.unit || 'Strips',
  });
  toast(`${p.name} added to cart`);
  if (!b.hasAttribute('data-no-drawer')) openCart();
});

/* ---------- Live search ---------- */
$$('[data-live-search]').forEach((input) => {
  const box = input.parentElement.querySelector('.search-results');
  let sel = -1;
  const render = async () => {
    const q = input.value.trim();
    if (q.length < 2) { box.hidden = true; return; }
    const res = searchProducts(await loadCatalogue(), q, 8);
    sel = -1;
    box.innerHTML = res.length
      ? res.map((p) => `<a href="${p.url}" role="option">${esc(p.name)}<small>${esc(p.generic)} · ${esc(p.category)}${p.ref ? ` · ref. ${esc(p.ref)}` : ''}</small></a>`).join('') +
        `<a href="/products/?q=${encodeURIComponent(q)}"><strong>See all results for “${esc(q)}”</strong></a>`
      : `<a href="${waUrl(`Hello, do you supply ${q}?`)}" target="_blank" rel="noopener">Not listed yet — <strong>ask an agent on WhatsApp</strong> if we can source “${esc(q)}”</a>`;
    box.hidden = false;
  };
  input.addEventListener('input', render);
  input.addEventListener('focus', () => { loadCatalogue(); if (input.value.trim().length > 1) render(); });
  input.addEventListener('keydown', (e) => {
    const links = $$('a', box);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links.forEach((l, i) => l.setAttribute('aria-selected', String(i === sel)));
    } else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); links[sel].click(); }
  });
  document.addEventListener('click', (e) => { if (!input.parentElement.contains(e.target)) box.hidden = true; });
});

/* ---------- Quick quote modal ---------- */
const qm = $('#quote-modal');
if (qm) {
  const form = $('[data-quote-form]', qm);
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-quote]'); if (!b) return;
    const p = (await loadCatalogue()).find((x) => x.sku === b.dataset.quote); if (!p) return;
    form.sku.value = p.sku;
    $('[data-qm-name]', qm).textContent = p.name;
    $('[data-qm-unit]', qm).innerHTML = p.unit.split('/').map((u) => `<option>${esc(u.trim())}</option>`).join('');
    const saved = store.get('buyer', {});
    if (saved.name && !form.name.value) form.name.value = saved.name;
    if (saved.phone && !form.phone.value) form.phone.value = saved.phone;
    await fillCountrySelect($('[data-country-select]', qm), $('input[data-dial]', qm));
    showErrors(form, {});
    qm.showModal();
    track('view_item', { item_id: p.sku, item_name: p.name, source: 'quick_quote' }, 'ViewContent');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const via = e.submitter?.value || 'rfq';
    const p = (await loadCatalogue()).find((x) => x.sku === form.sku.value);
    const item = { sku: p.sku, name: p.name, qty: Math.max(1, parseInt(form.qty.value, 10) || 1), unit: form.unit.value, note: '' };
    const data = {
      source: 'quick_quote', channel: via, name: form.name.value, phone: form.phone.value, country: form.country.value,
      consent: form.consent.checked ? 'true' : '', items: JSON.stringify([item]), website: form.website.value,
    };
    const local = {};
    if (data.name.trim().length < 2) local.name = 'Please enter your name.';
    if (!data.country) local.country = 'Please choose your country.';
    if (data.phone.replace(/\D/g, '').length < 6) local.phone = 'Please enter a valid number.';
    if (!form.consent.checked) local.consent = 'Please accept the privacy policy so we can contact you.';
    if (Object.keys(local).length) return showErrors(form, local);
    store.set('buyer', { ...store.get('buyer', {}), name: data.name, phone: data.phone });
    // open WhatsApp synchronously (popup blockers) and fill it once we have the reference
    const waWin = via === 'whatsapp' ? window.open('', '_blank') : null;
    $$('button[type=submit]', form).forEach((b) => (b.disabled = true));
    const res = await submitLead(data);
    $$('button[type=submit]', form).forEach((b) => (b.disabled = false));
    if (res.errors) { waWin?.close(); return showErrors(form, res.errors); }
    const text = res.whatsappText || `Hello ${cfg.name}, I'd like the best price for ${item.name} — ${item.qty} ${item.unit}. Name: ${data.name}.`;
    if (via === 'whatsapp' || !res.ok) {
      if (waWin) waWin.location = waUrl(text); else window.open(waUrl(text), '_blank');
      track('whatsapp_click', { source: 'quick_quote' }, 'Contact');
    }
    qm.close();
    toast(res.ok ? `Request sent — ref ${res.ref}` : 'Opening WhatsApp so an agent can help you.');
  });
}

/* ---------- Chat widget ---------- */
const panel = $('#chat-panel');
const SKEY = `chat:${cfg.id}`;
function closeChat() { panel?.classList.remove('open'); $('[data-help-dock]')?.removeAttribute('hidden'); }
if (panel) {
  const log = $('[data-chat-log]', panel);
  const form = $('[data-chat-form]', panel);
  let state = store.get(SKEY, null);
  if (!state || Date.now() - state.ts > 7 * 864e5) state = { id: uid(), messages: [], ts: Date.now() };
  const save = () => { state.ts = Date.now(); state.messages = state.messages.slice(-30); store.set(SKEY, state); };

  const bubble = (role, text, extra = '') => {
    const d = document.createElement('div');
    d.className = `msg ${role === 'user' ? 'user' : 'bot'}`;
    d.innerHTML = esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>') + extra;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
    return d;
  };
  const renderAll = () => {
    log.innerHTML = '';
    bubble('bot', cfg.greeting);
    state.messages.forEach((m) => bubble(m.role, m.text, m.extra || ''));
  };
  const actionsHTML = (actions = []) => {
    let html = '';
    const prods = actions.find((a) => a.type === 'products');
    if (prods) html += `<div class="links">${prods.items.map((p) => `<a class="btn btn-outline btn-sm" href="${esc(p.url)}">${esc(p.name)}</a>`).join('')}</div>`;
    const hand = actions.find((a) => a.type === 'handoff');
    if (hand && /^https:\/\/wa\.me\//.test(hand.url)) html += `<div class="links"><a class="btn btn-wa btn-sm" href="${esc(hand.url)}" target="_blank" rel="noopener">Continue on WhatsApp</a></div>`;
    const lead = actions.find((a) => a.type === 'lead_captured');
    if (lead) html += `<div class="links"><span class="badge badge-ok">Saved · ref ${esc(lead.ref)}</span></div>`;
    return html;
  };
  async function send(text) {
    text = text.trim(); if (!text) return;
    state.messages.push({ role: 'user', text }); save();
    bubble('user', text);
    $('[data-chat-quick]', panel).hidden = true;
    const typing = bubble('bot', 'Typing…'); typing.classList.add('typing');
    let data;
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: state.id, messages: state.messages.map(({ role, text }) => ({ role, text })), page: location.pathname }) });
      data = await r.json();
    } catch { data = null; }
    typing.remove();
    if (!data?.reply) {
      data = { reply: 'Sorry, I could not connect. Please message an agent on WhatsApp.', actions: [{ type: 'handoff', url: waUrl(`Hello ${cfg.name}, I need help with: ${text}`) }] };
    }
    if (data.sessionId) state.id = data.sessionId;
    for (const a of data.actions || []) {
      if (a.type === 'add_to_cart' && a.item) { cart.add(a.item); toast(`${a.item.name} added to cart`); }
      if (a.type === 'handoff') track('chat_handoff', {}, 'Contact');
    }
    const extra = actionsHTML(data.actions);
    state.messages.push({ role: 'assistant', text: data.reply, extra }); save();
    bubble('assistant', data.reply, extra);
  }
  $$('[data-open-chat]').forEach((b) => b.addEventListener('click', () => {
    panel.classList.add('open'); $('[data-help-dock]')?.setAttribute('hidden', '');
    renderAll(); if (state.messages.length) $('[data-chat-quick]', panel).hidden = true;
    $('#chat-input')?.focus();
    track('chat_start', {});
  }));
  $('[data-close-chat]', panel)?.addEventListener('click', closeChat);
  form.addEventListener('submit', (e) => { e.preventDefault(); const v = form.text.value; form.text.value = ''; send(v); });
  $$('[data-chat-quick] button', panel).forEach((b) => b.addEventListener('click', () => send(b.textContent)));
}

/* ---------- WhatsApp click tracking ---------- */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="https://wa.me/"]');
  if (a) track('whatsapp_click', { page: location.pathname }, 'Contact');
});

/* ---------- Consent ---------- */
const banner = $('[data-consent]');
if (banner) {
  const choice = store.get('consent');
  if (!choice) banner.hidden = false;
  $('[data-consent-accept]', banner)?.addEventListener('click', () => { store.set('consent', 'granted'); banner.hidden = true; loadAnalytics(); });
  $('[data-consent-reject]', banner)?.addEventListener('click', () => { store.set('consent', 'denied'); banner.hidden = true; });
  $('[data-cookie-settings]')?.addEventListener('click', () => { banner.hidden = false; });
}
loadAnalytics();
