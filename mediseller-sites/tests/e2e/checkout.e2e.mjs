// End-to-end: real build + real Cloudflare Functions (wrangler/workerd) + mocked Supabase/Sheet/Gemini + Chromium.
// Run:  npm run build && npm run test:e2e
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { startMocks } from './mock-services.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const MOCK = 'http://127.0.0.1:8790';
const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const { server, log } = await startMocks(8790);
const vars = { SUPABASE_URL: MOCK, SUPABASE_SERVICE_KEY: 'service-key-test', SHEET_WEBHOOK_URL: `${MOCK}/sheet`, SHEET_WEBHOOK_TOKEN: 'tok', GEMINI_API_KEY: 'gem-test', GEMINI_API_BASE: MOCK };
const wr = spawn('npx', ['wrangler', 'pages', 'dev', 'dist', '--port', String(PORT), '--ip', '127.0.0.1', '--compatibility-date=2025-09-01', ...Object.entries(vars).flatMap(([k, v]) => ['--binding', `${k}=${v}`])],
  { env: { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let wrOut = ''; wr.stdout.on('data', (d) => (wrOut += d)); wr.stderr.on('data', (d) => (wrOut += d));
for (let i = 0; i < 90; i++) { try { if ((await fetch(BASE + '/site.json')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 1000)); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let popupUrl = '';
ctx.on('page', (p) => { p.on('framenavigated', (f) => { if (/wa\.me|whatsapp/.test(f.url())) { popupUrl = f.url(); p.close().catch(() => {}); } }); });
await ctx.route(/wa\.me|whatsapp\.com/, (r) => r.fulfill({ status: 200, body: 'whatsapp stub' }));

try {
  // 1. Home + search
  await page.goto(BASE + '/');
  check('home renders', (await page.title()).includes('MediSeller'));
  await page.fill('#q-header', 'gleevec');
  await page.waitForSelector('.search-results a');
  check('live search finds reference brand', (await page.textContent('.search-results')).includes('Imatinib'));

  // 2. Product page → add to cart
  await page.click('.search-results a >> nth=0');
  await page.waitForURL(/\/product\//);
  await page.waitForLoadState('load');
  check('product page has Rx notice', await page.isVisible('.notice-rx'));
  await page.fill('#pdp-qty', '3');
  await page.click('.pdp-cta [data-add]');
  await page.waitForSelector('#cart-drawer.open');
  check('cart drawer shows item', (await page.textContent('[data-cart-items]')).includes('Imatinib'));
  check('cart count = 1', (await page.textContent('[data-cart-count]')).trim() === '1');

  // 3. Checkout — step validation
  await page.goto(BASE + '/checkout/');
  await page.waitForLoadState('load');
  await page.click('[data-step="1"] [data-next="2"]');
  check('step 1 blocks empty form', await page.isVisible('[data-step="1"]') && (await page.textContent('[data-step="1"] .field.invalid .err')).length > 0);
  await page.fill('#f-name', 'Amina Okafor');
  await page.selectOption('#f-country', 'NG');
  check('dial code follows country', (await page.inputValue('input[data-dial]')) === '+234');
  await page.fill('#f-phone', '0803 123 4567');
  await page.fill('#f-email', 'amina@example.com');
  await page.click('[data-step="1"] [data-next="2"]');
  // 4. Rx upload (optional)
  const tmp = mkdtempSync(join(tmpdir(), 'rx-')); const rxPath = join(tmp, 'rx.png');
  writeFileSync(rxPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  await page.setInputFiles('[data-rx-input][multiple]', rxPath);
  check('Rx preview shown', (await page.locator('[data-rx-previews] figure').count()) === 1);
  await page.click('[data-step="2"] [data-next="3"]');
  // 5. Channel = email, submit without consent → blocked
  await page.check('input[name=channel][value=email]');
  await page.click('[data-submit]');
  check('consent required', (await page.textContent('[data-form-error]')).toLowerCase().includes('privacy'));
  await page.check('input[name=consent]');
  await page.click('[data-submit]');
  await page.waitForURL(/thank-you/);
  const ref = (await page.textContent('[data-ref]')).trim();
  check('thank-you shows reference', /^MS-\d{6}-[A-Z2-9]{4}$/.test(ref), ref);
  check('cart cleared after submit', (await page.textContent('[data-cart-count]')).trim() === '0');
  await new Promise((r) => setTimeout(r, 1500));
  const leadPost = log.find((l) => l.method === 'POST' && l.url.startsWith('/rest/v1/leads'));
  check('lead saved to Supabase', !!leadPost && leadPost.body[0].phone_e164 === '+2348031234567' && leadPost.body[0].contact_channel === 'email');
  check('service key used server-side', leadPost?.auth === 'Bearer service-key-test');
  check('items saved', !!log.find((l) => l.url.startsWith('/rest/v1/lead_items') && l.body[0].qty === 3));
  check('prescription uploaded to private bucket', !!log.find((l) => l.url.startsWith('/storage/v1/object/prescriptions/mediseller/' + ref)));
  const sheet = log.find((l) => l.url === '/sheet');
  check('Google Sheet row pushed with Rx link', !!sheet && sheet.body.row[0] === ref && sheet.body.row[13].includes('/object/sign/'));
  check('lead marked as synced', !!log.find((l) => l.method === 'PATCH' && l.url.startsWith('/rest/v1/leads') && l.body.sheet_synced_at));

  // 6. WhatsApp channel via quick quote modal
  await page.goto(BASE + '/category/diabetes-and-insulin/');
  await page.click('.pcard [data-quote] >> nth=0');
  await page.fill('#qm-name', 'Ivan Petrov');
  await page.selectOption('#qm-country', 'RU');
  await page.fill('#qm-phone', '916 123-45-67');
  await page.check('#quote-modal input[name=consent]');
  popupUrl = '';
  await page.click('#quote-modal button[value=whatsapp]');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('ref'), null, { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 800));
  check('quick quote opens WhatsApp with ref', /wa\.me\/911234567890\?text=[\s\S]*MS-\d{6}/.test(decodeURIComponent(popupUrl)), decodeURIComponent(popupUrl).slice(0, 80));
  check('quick quote lead stored as whatsapp', !!log.find((l) => l.method === 'POST' && l.url.startsWith('/rest/v1/leads') && l.body[0].phone_e164 === '+79161234567' && l.body[0].source === 'quick_quote'));

  // 7. Server-side validation (bypass the browser)
  const bad = await fetch(BASE + '/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x', phone: '1', country: 'ZZ', items: '[]' }) });
  check('API rejects invalid lead with 422', bad.status === 422);

  // 8. Chatbot with tool calls (mock Gemini)
  await page.goto(BASE + '/');
  await page.click('[data-open-chat]');
  await page.fill('#chat-input', 'Do you have Gleevec?');
  await page.press('#chat-input', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.msg.bot')].some((m) => m.textContent.includes('added Imatinib')), null, { timeout: 15000 });
  check('chatbot answers via Gemini tool loop', true);
  check('chatbot add_to_cart reached the cart', (await page.textContent('[data-cart-count]')).trim() === '1');
  await new Promise((r) => setTimeout(r, 1000));
  check('chat logged to Supabase', !!log.find((l) => l.url.startsWith('/rest/v1/chat_messages')));
  const gem = log.find((l) => l.url.includes(':generateContent'));
  check('Gemini key sent only from server', gem?.auth === 'gem-test');

  // 9. SEO basics
  const sm = await (await fetch(BASE + '/sitemap.xml')).text();
  check('sitemap lists products', (sm.match(/<loc>/g) || []).length > 100);
  await page.goto(BASE + '/product/imatinib-mesylate-400-mg/');
  const ld = await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent)['@type']));
  check('product JSON-LD present', ld.includes('Product') && ld.includes('BreadcrumbList') && ld.includes('FAQPage'));
  check('no JS errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('unexpected error', false, e.message);
  console.log(wrOut.slice(-2000));
} finally {
  await browser.close(); try { process.kill(-wr.pid, 'SIGTERM'); } catch {} server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
