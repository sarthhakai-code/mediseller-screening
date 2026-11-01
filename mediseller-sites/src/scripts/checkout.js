import { cfg, $, $$, esc, cart, store, fillCountrySelect, submitLead, showErrors, track, waUrl } from './core.js';

const form = $('[data-checkout]');
const steps = $$('[data-step]', form);
let current = 1;
let rxFiles = [];

/* ---------- Summary ---------- */
function renderSummary() {
  const items = cart.items();
  $('[data-sum-count]').textContent = `(${items.length} item${items.length === 1 ? '' : 's'})`;
  $('[data-sum-items]').innerHTML = items.length
    ? items.map((i) => `<div class="line" style="grid-template-columns:1fr"><div><div class="name">${esc(i.name)} ${i.rx ? '<span class="badge badge-rx">Rx</span>' : ''}</div><div class="meta">${i.qty} × ${esc(i.unit)}${i.note ? ` · ${esc(i.note)}` : ''}</div></div></div>`).join('')
    : '<p class="muted">Your cart is empty. <a href="/products/">Browse medicines</a></p>';
}
cart.onChange(renderSummary);
renderSummary();

/* ---------- Restore saved details ---------- */
const DRAFT = 'checkout-draft';
const draft = store.get(DRAFT, {});
for (const [k, v] of Object.entries(draft)) { const el = form.elements[k]; if (el && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'file') el.value = v; }
form.addEventListener('input', () => {
  const d = {};
  ['name', 'city', 'phone', 'email', 'buyer_type', 'company', 'message', 'country'].forEach((k) => (d[k] = form.elements[k]?.value || ''));
  store.set(DRAFT, d);
});
fillCountrySelect($('[data-country-select]', form), $('input[data-dial]', form)).then(() => { if (draft.country) { form.country.value = draft.country; form.country.dispatchEvent(new Event('change')); } });

const typeSel = form.buyer_type;
const toggleCompany = () => ($('[data-company]').hidden = ['Patient', 'Caregiver'].includes(typeSel.value));
typeSel.addEventListener('change', toggleCompany); toggleCompany();

if (cart.items().length) track('begin_checkout', { items: cart.items().length }, 'InitiateCheckout');

/* ---------- Steps ---------- */
function validateStep(n) {
  const e = {};
  if (n === 1) {
    if (form.name.value.trim().length < 2) e.name = 'Please enter your name.';
    if (!form.country.value) e.country = 'Please choose your country.';
    if (form.phone.value.replace(/\D/g, '').length < 6) e.phone = 'Please enter a valid phone / WhatsApp number.';
    if (form.email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.value)) e.email = 'Please enter a valid email.';
    if (!cart.items().length) e.items = 'Your cart is empty — add a medicine first.';
  }
  if (n === 3) {
    const ch = form.channel.value;
    if (ch === 'email' && !form.email.value) e.email = 'Add your email in step 1 so we can email the quote.';
    if (!form.consent.checked) e.consent = 'Please accept the privacy policy so we can contact you.';
  }
  showErrors(form, e);
  return e;
}
function go(n) {
  current = n;
  steps.forEach((s) => (s.hidden = +s.dataset.step !== n));
  $$('[data-prog]').forEach((p) => { const k = +p.dataset.prog; p.classList.toggle('active', k === n); p.classList.toggle('done', k < n); });
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  steps[n - 1].querySelector('input,select,button')?.focus({ preventScroll: true });
}
$$('[data-next]', form).forEach((b) => b.addEventListener('click', () => {
  const to = +b.dataset.next;
  if (to > current) {
    const e = validateStep(current);
    if (Object.keys(e).length) { if (e.email && current === 3) go(1); return; }
  }
  go(to);
}));

/* ---------- Prescription ---------- */
const prev = $('[data-rx-previews]');
const rxErr = $('[data-rx-err]');
function renderRx() {
  prev.innerHTML = '';
  rxFiles.forEach((f, i) => {
    const fig = document.createElement('figure');
    if (f.type.startsWith('image/') && !/hei[cf]/.test(f.type)) { const img = document.createElement('img'); img.src = URL.createObjectURL(f); img.alt = `Prescription ${i + 1}`; fig.appendChild(img); }
    else fig.textContent = f.name.slice(0, 18);
    const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = '×'; rm.setAttribute('aria-label', `Remove file ${i + 1}`);
    rm.onclick = () => { rxFiles.splice(i, 1); renderRx(); };
    fig.appendChild(rm); prev.appendChild(fig);
  });
  if (rxFiles.length) form.rx_later.checked = false;
}
$$('[data-rx-input]', form).forEach((inp) => inp.addEventListener('change', () => {
  rxErr.textContent = '';
  for (const f of inp.files) {
    if (rxFiles.length >= cfg.rxMaxFiles) { rxErr.textContent = `Up to ${cfg.rxMaxFiles} files.`; break; }
    if (f.size > cfg.rxMaxMB * 1024 * 1024) { rxErr.textContent = `${f.name} is larger than ${cfg.rxMaxMB} MB.`; continue; }
    if (!/^image\/|application\/pdf/.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) { rxErr.textContent = 'Please upload a photo or PDF.'; continue; }
    rxFiles.push(f);
  }
  inp.value = '';
  renderRx();
  if (rxFiles.length) track('rx_upload', { files: rxFiles.length }, 'RxUpload');
}));

/* ---------- Channel extras ---------- */
const daySel = $('[data-call-day]');
const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
for (let d = 0; d < 7; d++) { const dt = new Date(Date.now() + d * 864e5); daySel.add(new Option(d === 0 ? `Today (${fmt.format(dt)})` : d === 1 ? `Tomorrow (${fmt.format(dt)})` : fmt.format(dt), dt.toISOString().slice(0, 10))); }
const syncChannel = () => {
  $('[data-call-fields]').hidden = form.channel.value !== 'call';
  $('[data-submit]').textContent = { whatsapp: 'Send & open WhatsApp', rfq: 'Send quote request', email: 'Email me the quote', call: 'Book my call' }[form.channel.value];
};
$$('input[name=channel]', form).forEach((r) => r.addEventListener('change', syncChannel)); syncChannel();

/* ---------- Submit ---------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const v1 = validateStep(1);
  if (Object.keys(v1).length) return go(1);
  const errs = validateStep(3);
  if (Object.keys(errs).length) { if (errs.email) go(1); return; }

  const channel = form.channel.value;
  const fd = new FormData();
  ['name', 'country', 'city', 'phone', 'email', 'buyer_type', 'company', 'message', 'website'].forEach((k) => fd.append(k, form.elements[k]?.value || ''));
  fd.append('channel', channel);
  fd.append('source', 'checkout');
  fd.append('consent', 'true');
  fd.append('rx_later', form.rx_later.checked ? 'true' : '');
  fd.append('items', JSON.stringify(cart.items()));
  if (channel === 'call') {
    fd.append('call_slot', `${daySel.value} · ${$('[data-call-time]').value}`);
    fd.append('call_tz', Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  }
  rxFiles.forEach((f) => fd.append('rx', f, f.name));
  const ts = form.querySelector('[name="cf-turnstile-response"]');
  if (ts) fd.append('cf-turnstile-response', ts.value);

  const btn = $('[data-submit]'); btn.disabled = true; const label = btn.textContent; btn.textContent = 'Sending…';
  const waWin = channel === 'whatsapp' ? window.open('', '_blank') : null; // open now so popup blockers allow it
  const res = await submitLead(fd);
  btn.disabled = false; btn.textContent = label;

  if (res.errors) {
    waWin?.close();
    showErrors(form, res.errors);
    if (['name', 'phone', 'country', 'email', 'items'].some((k) => res.errors[k])) go(1);
    else if (res.errors.rx) { go(2); rxErr.textContent = res.errors.rx; }
    return;
  }
  if (!res.ok) {
    // Backend unavailable — never lose the lead: hand it over on WhatsApp (or email) with everything filled in.
    const text = res.whatsappText || buildText();
    if (waWin) waWin.location = waUrl(text);
    store.set('last-lead', { ref: '', channel: 'fallback', text, rx: rxFiles.length });
    location.href = '/thank-you/?fallback=1';
    return;
  }
  if (waWin) waWin.location = waUrl(res.whatsappText);
  store.set('last-lead', { ref: res.ref, channel, text: res.whatsappText, rx: rxFiles.length, rxLater: form.rx_later.checked });
  store.del(DRAFT);
  cart.clear();
  location.href = `/thank-you/?ref=${encodeURIComponent(res.ref)}`;
});

function buildText() {
  const items = cart.items().map((i, n) => `${n + 1}. ${i.name} — ${i.qty} ${i.unit}${i.note ? ` (${i.note})` : ''}`).join('\n');
  return `Hello ${cfg.name}, I'd like a quote.\n\n${items}\n\nName: ${form.name.value}\nCountry: ${form.country.selectedOptions[0]?.text || ''}\nI am: ${form.buyer_type.value}${form.message.value ? `\nNote: ${form.message.value}` : ''}${rxFiles.length ? '\n(I have a prescription to share.)' : ''}`;
}
