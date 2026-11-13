#!/usr/bin/env node
/*
 * Rx Studio — smoke test (about 30 seconds)
 *
 * Runs the core flow end to end against both builds:
 *   A. prescription.html        served over http (CDN scripts served from local copies)
 *   B. dist/rx-studio.html      opened from disk (file://) with ALL network access blocked
 *
 * Flow: login screen -> sign in -> engines/fonts -> upload a sample letterhead PDF ->
 * type a prescription like an operator -> download PDF and verify it -> confirm no patient
 * data was stored -> sign out.
 *
 *   cd tests && npm install && npm run smoke
 */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { pathToFileURL } = require("url");
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.error("Playwright not found. Run: npm i -D playwright && npx playwright install chromium"); process.exit(2); }

const ROOT = path.resolve(__dirname, "..");
const NM = path.join(__dirname, "node_modules");
const OUT = path.join(__dirname, "output-smoke");
const SAMPLES = path.join(ROOT, "samples", "letterheads");
const LAYOUTS = JSON.parse(fs.readFileSync(path.join(SAMPLES, "layouts.json"), "utf8"));
const DIST = path.join(ROOT, "dist", "rx-studio.html");
const pdfjs = require(path.join(NM, "pdfjs-dist/legacy/build/pdf.js"));
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(DIST)) { console.error("dist/rx-studio.html missing. Run: python3 tools/build-standalone.py"); process.exit(2); }

const results = [];
const ok = (c, m) => { if (!c) throw new Error(m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(target, browser, baseURL) {
  console.log(`\n${target.label}`);
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const blocked = [];
  if (target.offline) {
    await ctx.route("**/*", r => { const u = r.request().url(); if (/^(file|data|blob):/.test(u)) return r.continue(); blocked.push(u); return r.abort(); });
  } else {
    await ctx.route(/cdnjs\.cloudflare\.com/, r => {
      const u = r.request().url();
      const f = u.includes("pdf.worker") ? "pdfjs-dist/build/pdf.worker.min.js" : u.includes("pdf.min") ? "pdfjs-dist/build/pdf.min.js" : "jspdf/dist/jspdf.umd.min.js";
      r.fulfill({ path: path.join(NM, f), contentType: "application/javascript" });
    });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  }
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  const step = async (name, fn) => {
    const t0 = Date.now();
    try { await fn(); results.push({ target: target.label, name, ok: true }); console.log(`  ✓ ${name} (${Date.now() - t0} ms)`); }
    catch (e) { results.push({ target: target.label, name, ok: false, err: e.message.split("\n")[0] }); console.log(`  ✗ ${name}\n      ${e.message.split("\n")[0]}`);
      await page.screenshot({ path: path.join(OUT, `FAIL-${target.key}-${name.replace(/\W+/g, "_").slice(0, 40)}.png`) }).catch(() => {}); }
  };
  const url = target.offline ? pathToFileURL(DIST).href : baseURL + "/prescription.html";

  await step("opens on the login screen", async () => {
    await page.goto(url); await page.waitForSelector("#lg-user", { state: "visible" });
    ok(await page.isHidden(".wrap"), "app hidden before sign-in");
  });
  await step("signs in with the default login", async () => {
    await page.fill("#lg-user", "admin"); await page.fill("#lg-pass", "Mediseller@123"); await page.click("#lg-btn");
    await page.waitForSelector(".wrap", { state: "visible" }); ok(await page.isVisible("#hdr-defpw"), "default-password reminder");
  });
  await step("PDF engines and fonts are available", async () => {
    const r = await page.evaluate(async () => {
      const faces = await document.fonts.load("600 12px 'IBM Plex Sans'").catch(() => []); // loads the bundled data-URI font, or fails offline
      return { pdf: !!window.pdfjsLib, jspdf: !!window.jspdf, worker: !!window.pdfjsWorker, font: faces.length > 0 && document.fonts.check("600 12px 'IBM Plex Sans'") }; });
    ok(r.pdf && r.jspdf, "pdf.js / jsPDF missing");
    if (target.offline) ok(r.worker && r.font, `standalone must bundle worker and fonts: ${JSON.stringify(r)}`);
  });
  await step("uploads a sample letterhead PDF and maps it", async () => {
    await page.click('#tabs button[data-tab="doctors"]');
    await page.fill("#d-name", "Dr. Smoke Test"); await page.fill("#d-reg", "SMC 1001"); await page.fill("#d-qual", "MBBS"); await page.click("#d-save");
    await page.click('#tabs button[data-tab="templates"]');
    const L = LAYOUTS["carefirst-a4"];
    await page.setInputFiles("#tpl-file", path.join(SAMPLES, L.file));
    await page.waitForFunction(() => S.templates.length === 1, null, { timeout: 15000 });
    await page.evaluate(f => { S.templates[0].fields = f; save("templates"); }, L.fields);
    await page.click("#ed-back").catch(() => {});
  });
  await step("operator types a prescription and downloads a valid PDF", async () => {
    await page.click('#tabs button[data-tab="generate"]');
    await page.fill("#g-name", "Smoke Patient"); await page.fill("#g-age", "51"); await page.selectOption("#g-gender", "Male"); await page.fill("#g-phone", "9811122233");
    const nm = page.locator("#g-meds .m-name").first(); await nm.click(); await page.keyboard.type("Azithro");
    await page.fill("#g-meds .m-strength", "500 mg"); await page.fill("#g-meds .m-form", "Tab"); await page.fill("#g-meds .m-dose", "1-0-0"); await page.fill("#g-meds .m-dur", "3 days");
    await page.fill("#g-adv", "Rest and fluids."); await page.check("#g-attest");
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.click("#g-download")]);
    const file = path.join(OUT, `${target.key}-${dl.suggestedFilename()}`); await dl.saveAs(file);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
    const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
    ok(doc.numPages === 1 && Math.round(vp.width) === 595 && Math.round(vp.height) === 842, "PDF is not one A4 page");
    ok(/Smoke_Patient\.pdf$/.test(dl.suggestedFilename()), "file name");
  });
  await step("no patient data is stored anywhere", async () => {
    const dump = await page.evaluate(async () => {
      const db = await new Promise(res => { const r = indexedDB.open("mediseller-rx-studio", 1); r.onsuccess = () => res(r.result); });
      const all = await new Promise(res => { const out = {}; db.transaction("kv").objectStore("kv").openCursor().onsuccess = e => { const c = e.target.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); }; });
      return JSON.stringify([all, { ...localStorage }, { ...sessionStorage }]);
    });
    ok(!dump.includes("Smoke Patient") && !dump.includes("9811122233"), "patient data found in storage");
  });
  await step("signs out and clears the screen", async () => {
    await page.click("#hdr-logout"); await page.waitForSelector("#lg-user", { state: "visible" });
    ok((await page.inputValue("#g-name")) === "", "patient name still in the form");
  });
  await step(target.offline ? "made zero network requests and no JavaScript errors" : "no JavaScript errors", async () => {
    ok(errors.length === 0, "page errors: " + errors.join(" | "));
    if (target.offline) ok(blocked.length === 0, `tried to reach the network: ${blocked.slice(0, 3).join(", ")}`);
  });
  await page.screenshot({ path: path.join(OUT, `${target.key}-final.png`) });
  await ctx.close();
}

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html" : "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  const browser = await chromium.launch();
  await run({ key: "online", label: "A. prescription.html (http, CDN libraries)" }, browser, `http://127.0.0.1:${server.address().port}`);
  await run({ key: "standalone", label: "B. dist/rx-studio.html (file://, network blocked)", offline: true }, browser);
  await browser.close(); server.close();
  const fail = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, "smoke-report.md"), [`# Rx Studio — smoke test`, ``, `Run: ${new Date().toISOString()}`, ``, `**${results.length - fail.length}/${results.length} passed**`, ``,
    `| | Build | Check |`, `|---|---|---|`, ...results.map(r => `| ${r.ok ? "✅" : "❌"} | ${r.target} | ${r.name}${r.ok ? "" : ` — \`${r.err}\``} |`)].join("\n") + "\n");
  console.log(`\n${results.length - fail.length}/${results.length} smoke checks passed. Report: tests/output-smoke/smoke-report.md`);
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
