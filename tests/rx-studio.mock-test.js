#!/usr/bin/env node
/*
 * Rx Studio — end-to-end mock test suite
 *
 * Drives prescription.html in headless Chromium with generated mock data and the sample
 * letterheads in samples/letterheads (see tools/make-sample-letterheads.js):
 * templates (PDF/A4/A5/landscape/multi-page/PNG/JPG + bad files), doctors, medicine CSVs,
 * and a bulk run of randomised prescriptions whose PDFs are opened and checked with pdf.js.
 *
 * Hermetic: the CDN scripts are served from local node_modules (same versions as the page),
 * Google Fonts are blocked, and the page is served from a throwaway local HTTP server.
 *
 *   cd tests && npm install && node rx-studio.mock-test.js        (needs Playwright + Chromium)
 *   BULK=100 node rx-studio.mock-test.js                           (more mock prescriptions)
 *
 * Output: tests/output/report.md, sample PDFs, and screenshots of any failures.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
let chromium, devices;
try { ({ chromium, devices } = require("playwright")); } catch { console.error("Playwright not found. Run: npm i -D playwright && npx playwright install chromium"); process.exit(2); }

const ROOT = path.resolve(__dirname, "..");
const NM = path.join(__dirname, "node_modules");
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.join(__dirname, "output");
const BULK = +process.env.BULK || 30;
const APP = process.env.APP || "prescription.html"; // path relative to the repo root
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
for (const f of ["pdfjs-dist/build/pdf.min.js", "pdfjs-dist/build/pdf.worker.min.js", "jspdf/dist/jspdf.umd.min.js"])
  if (!fs.existsSync(path.join(NM, f))) { console.error(`Missing ${f}. Run: cd tests && npm install`); process.exit(2); }
const pdfjs = require(path.join(NM, "pdfjs-dist/legacy/build/pdf.js"));
const SAMPLES = path.join(ROOT, "samples", "letterheads");
const LAYOUTS = JSON.parse(fs.readFileSync(path.join(SAMPLES, "layouts.json"), "utf8"));
const DEFAULT_CREDS = { user: "admin", pass: "Mediseller@123" };
let CREDS = { ...DEFAULT_CREDS }; // updated when a test changes the password
let pdftoppm = true; try { require("child_process").execFileSync("pdftoppm", ["-v"], { stdio: "ignore" }); } catch { pdftoppm = false; }

/* ---------- tiny runner ---------- */
const results = []; const pageErrors = [];
let page, ctx, browser, baseURL;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`  \u2713 ${name} (${Date.now() - t0} ms)`); }
  catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, err: e.message.split("\n")[0] });
    console.log(`  \u2717 ${name}\n      ${e.message.split("\n")[0]}`);
    await page?.screenshot({ path: path.join(OUT, "FAIL-" + name.replace(/\W+/g, "_").slice(0, 60) + ".png"), fullPage: true }).catch(() => {});
  }
}
const ok = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || "not equal"}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > tol) throw new Error(`${m || "not near"}: got ${a}, expected ${b} ±${tol}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- deterministic mock data ---------- */
let seed = 20261107; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
const FIRST = ["Aarav", "Vivaan", "Ananya", "Diya", "Ishaan", "Kavya", "Rohan", "Meera", "Arjun", "Saanvi", "Kabir", "Priya", "Farhan", "Zoya", "Gurpreet", "Lakshmi", "Thomas", "Nandini"];
const LAST = ["Sharma", "Iyer", "Reddy", "Khan", "Singh", "Patel", "Nair", "Das", "Mukherjee", "D'Souza", "Banerjee", "Gupta", "Menon", "Joshi"];
const MEDS = [["Paracetamol", "650 mg", "Tab"], ["Azithromycin", "500 mg", "Tab"], ["Amoxicillin + Clavulanic acid", "625 mg", "Tab"], ["Cetirizine", "10 mg", "Tab"],
  ["Pantoprazole", "40 mg", "Tab"], ["Ondansetron", "4 mg", "Tab"], ["ORS", "", "Sachet"], ["Ambroxol", "30 mg/5 ml", "Syp"], ["Metformin", "500 mg", "Tab"],
  ["Telmisartan", "40 mg", "Tab"], ["Vitamin D3", "60000 IU", "Cap"], ["Clotrimazole", "1%", "Cream"], ["Montelukast + Levocetirizine", "10/5 mg", "Tab"]];
const DOSES = ["1-0-1", "1-0-0", "0-0-1", "1-1-1", "SOS", "5 ml 1-0-1"], TIMES = ["After food", "Before food", "At bedtime", "Empty stomach", ""], DURS = ["3 days", "5 days", "7 days", "14 days", "1 month"];
const NOTES = ["", "", "", "Only if fever above 100°F", "Complete the full course even if you feel better", "Stop if rash appears"];
function mockRx(i) {
  const n = 1 + Math.floor(rnd() * 8);
  return {
    patient: { name: `${pick(FIRST)} ${pick(LAST)}`, age: String(1 + Math.floor(rnd() * 90)), ageUnit: "Y", gender: pick(["Male", "Female", "Other"]),
      phone: "9" + String(Math.floor(rnd() * 1e9)).padStart(9, "0"), email: i % 3 ? "" : `patient${i}@example.com` },
    mode: pick(["Video", "Audio", "Chat"]), date: null,
    meds: Array.from({ length: n }, () => { const m = pick(MEDS); return { name: m[0], strength: m[1], form: m[2], dose: pick(DOSES), timing: pick(TIMES), duration: pick(DURS), notes: pick(NOTES) }; }),
    investigations: pick(["", "CBC, CRP", "HbA1c, Lipid profile", "Chest X-ray PA view"]), advice: pick(["", "Plenty of fluids. Rest.", "Low-salt diet, 30 min walk daily."]),
    followUp: pick(["", "After 5 days", "After 2 weeks", "SOS"])
  };
}

/* ---------- page helpers ---------- */
async function newPage(viewport = { width: 1400, height: 1000 }, device, login) {
  ctx = await browser.newContext(device ? { ...devices[device], acceptDownloads: true } : { acceptDownloads: true, viewport });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => {
    const u = r.request().url();
    const f = u.includes("pdf.worker") ? "pdfjs-dist/build/pdf.worker.min.js" : u.includes("pdf.min") ? "pdfjs-dist/build/pdf.min.js" : "jspdf/dist/jspdf.umd.min.js";
    r.fulfill({ path: path.join(NM, f), contentType: "application/javascript" });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  p.on("pageerror", e => pageErrors.push(e.message));
  p.on("dialog", d => (p.__dialog || (dd => dd.accept()))(d));
  await p.goto(baseURL + "/" + APP);
  if (login !== false) await signIn(p, login || DEFAULT_CREDS);
  return p;
}
async function signIn(p, creds = CREDS) {
  await p.waitForFunction(() => typeof G !== "undefined" && !document.body.classList.contains("booting"));
  if (await p.evaluate(() => document.body.classList.contains("locked"))) {
    await p.fill("#lg-user", creds.user); await p.fill("#lg-pass", creds.pass); await p.click("#lg-btn");
  }
  await p.waitForFunction(() => !document.body.classList.contains("locked") && G.rxId && document.querySelector("#g-rxid").textContent !== "—", null, { timeout: 10000 });
}
async function dumpStorage(p) { // everything the page keeps in IndexedDB, localStorage and sessionStorage, as one string
  return p.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open("mediseller-rx-studio", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = await new Promise(res => { const out = {}; const tx = db.transaction("kv"); const st = tx.objectStore("kv");
      st.openCursor().onsuccess = e => { const c = e.target.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); }; });
    return JSON.stringify({ idb: all, keys: Object.keys(all), local: { ...localStorage }, session: { ...sessionStorage } });
  });
}
async function reset() {
  await page.evaluate(async () => {
    for (const k of KEYS) { S[k] = k === "settings" ? { ...DEFAULT_SETTINGS } : k === "counter" ? { n: 0 } : []; await save(k); }
    localStorage.clear();
  });
  await page.reload(); await signIn(page);
}
const state = () => page.evaluate(() => ({ t: S.templates.length, d: S.doctors.length, m: S.medicines.length, n: S.counter.n, rx: G.rxId }));
const tab = name => page.click(`#tabs button[data-tab=${name}]`);
const toastText = async () => { await sleep(120); return page.textContent("#toast"); };
async function download(selector) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.click(selector)]);
  const file = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(file); return { file, name: dl.suggestedFilename(), buf: fs.readFileSync(file) };
}
async function noDownload(selector, ms = 1500) {
  let got = false; const h = () => (got = true); page.on("download", h);
  await page.click(selector); await sleep(ms); page.off("download", h); return !got;
}
async function inspectPdf(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  const pg = await doc.getPage(1); const vp = pg.getViewport({ scale: 1 }); const meta = await doc.getMetadata();
  return { pages: doc.numPages, w: vp.width, h: vp.height, title: meta.info.Title, ops: (await pg.getOperatorList()).fnArray.length };
}
const fileObj = (name, mimeType, b64) => ({ name, mimeType, buffer: Buffer.from(b64, "base64") });
async function makeFixtures() {
  return page.evaluate(() => {
    const { jsPDF } = window.jspdf;
    const pdf = (fmt, orient, pages, title) => {
      const d = new jsPDF({ unit: "pt", format: fmt, orientation: orient });
      for (let i = 0; i < pages; i++) { if (i) d.addPage(fmt, orient); d.setFontSize(20); d.text(title + (i ? " p" + (i + 1) : ""), 30, 36); d.line(30, 46, d.internal.pageSize.getWidth() - 30, 46); }
      return d.output("datauristring").split(",")[1];
    };
    const img = (type, w, h, title) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.fillStyle = "#123"; x.font = "40px sans-serif"; x.fillText(title, 40, 60); return c.toDataURL(type).split(",")[1]; };
    const sig = () => { const c = document.createElement("canvas"); c.width = 400; c.height = 150; const x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, 400, 150); x.strokeStyle = "#000"; x.lineWidth = 6; x.beginPath(); x.moveTo(20, 100); x.bezierCurveTo(100, 0, 200, 150, 380, 40); x.stroke();
      return c.toDataURL("image/png").split(",")[1]; };
    return { a4: pdf("a4", "p", 1, "A4 Clinic"), a5: pdf("a5", "p", 1, "A5 Clinic"), letterL: pdf("letter", "l", 1, "Letter Landscape Clinic"),
      multi: pdf("a4", "p", 3, "Multi-page Clinic"), png: img("image/png", 1240, 1754, "PNG Clinic"), jpg: img("image/jpeg", 1240, 1754, "JPG Clinic"), sig: sig() };
  });
}
async function addDoctor(name, reg, sigB64) {
  await tab("doctors");
  await page.fill("#d-name", name); await page.fill("#d-reg", reg); await page.fill("#d-qual", "MBBS, MD");
  if (sigB64) { await page.click("#d-sig-up").catch(() => {}); await page.setInputFiles("#d-file", fileObj("sig.png", "image/png", sigB64)); await page.waitForSelector("#d-sig-pv img"); }
  await page.click("#d-save");
}
async function fillRx(data, tplId, docId) {
  await tab("generate");
  await page.evaluate(([d, t, doc]) => { fillForm({ ...d, rxId: G.rxId, templateId: t, doctorId: doc, date: d.date || todayISO() }); }, [data, tplId, docId]);
  await page.check("#g-attest");
}

/* ============================================================ */
(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html" : "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  page = await newPage(undefined, undefined, false);

  console.log("\n0. Login");
  await test("login screen guards the app; default-login hint shown on first use", async () => {
    await page.waitForSelector("#lg-user");
    ok(await page.isVisible("#login") && await page.isHidden(".wrap"), "only the login screen is visible");
    ok(await page.isVisible("#lg-hint"), "default login hint");
    eq(await page.evaluate(() => S.templates.length), 0);
  });
  await test("wrong password is refused; 5 failures lock sign-in for 60 s, even for the right password", async () => {
    await page.fill("#lg-user", "admin"); await page.fill("#lg-pass", "nope"); await page.click("#lg-btn");
    eq(await page.textContent("#lg-err"), "Wrong username or password.");
    for (let i = 0; i < 4; i++) { await page.fill("#lg-pass", "nope" + i); await page.click("#lg-btn"); }
    ok((await page.textContent("#lg-err")).includes("Too many attempts"), "locked out");
    await page.fill("#lg-pass", DEFAULT_CREDS.pass); await page.click("#lg-btn"); await sleep(200);
    ok(await page.evaluate(() => document.body.classList.contains("locked")), "still locked during the wait");
    await page.evaluate(() => { L.lockUntil = 0; }); // skip the 60 s wait
  });
  await test("default login signs in and warns to change the password", async () => {
    await signIn(page, DEFAULT_CREDS);
    ok(await page.isVisible(".wrap"), "app visible");
    ok(await page.isVisible("#hdr-defpw"), "persistent default-password reminder in the header");
  });
  await test("session survives a reload; Sign out returns to login and clears the patient on screen", async () => {
    await page.reload(); await signIn(page); ok(await page.isHidden("#login"), "no second login after reload");
    await page.fill("#g-name", "Logout Test"); await page.click("#hdr-logout");
    ok(await page.isVisible("#login"), "back at login");
    await signIn(page); eq(await page.inputValue("#g-name"), "", "patient details were cleared");
  });
  await test("auto sign-out after inactivity", async () => {
    await page.evaluate(() => { IDLE_MS = 400; touchSession(); }); await sleep(900);
    ok(await page.evaluate(() => document.body.classList.contains("locked")), "locked after idle");
    await page.evaluate(() => { IDLE_MS = 30 * 60 * 1000; }); await signIn(page);
  });
  await test("change login: validates current/new passwords, then only the new one works", async () => {
    await tab("settings");
    const tryIt = async (cur, n1, n2, user = "clinicadmin") => { await page.fill("#s-user", user); await page.fill("#s-pw-cur", cur); await page.fill("#s-pw-new", n1); await page.fill("#s-pw-new2", n2); await page.click("#s-login-save"); return toastText(); };
    ok((await tryIt("wrong", "LongEnough1", "LongEnough1")).includes("Current password is wrong"), "wrong current");
    ok((await tryIt(DEFAULT_CREDS.pass, "short", "short")).includes("at least 8"), "too short");
    ok((await tryIt(DEFAULT_CREDS.pass, "LongEnough1", "LongEnough2")).includes("don't match"), "mismatch");
    ok((await tryIt(DEFAULT_CREDS.pass, "LongEnough1", "LongEnough1", "a b")).includes("Username"), "bad username");
    ok((await tryIt(DEFAULT_CREDS.pass, "Clinic#2026", "Clinic#2026")).includes("Login updated"), "updated");
    ok(await page.isHidden("#s-defpw") && await page.isHidden("#hdr-defpw"), "default-password reminders gone");
    const st = await dumpStorage(page); ok(!st.includes("Clinic#2026"), "password itself is never stored");
    await page.click("#hdr-logout"); ok(await page.isHidden("#lg-hint"), "no default hint once changed");
    await page.fill("#lg-user", "admin"); await page.fill("#lg-pass", DEFAULT_CREDS.pass); await page.click("#lg-btn");
    eq(await page.textContent("#lg-err"), "Wrong username or password.", "old login refused");
    CREDS = { user: "ClinicAdmin", pass: "Clinic#2026" }; // username is case-insensitive
    await signIn(page, CREDS);
  });
  const FX = await makeFixtures();
  const T = {}; // template ids by label

  console.log("\n1. Boot & libraries");
  await test("page boots with PDF + jsPDF engines and shows onboarding", async () => {
    eq(await page.evaluate(() => [!!window.pdfjsLib, !!window.jspdf]), [true, true], "libraries");
    ok(await page.isVisible("#onboard"), "onboarding card visible on empty install");
    eq((await state()).rx.replace(/-\d{6}-/, "-DATE-"), "RX-DATE-0001", "first Rx ID");
  });

  console.log("\n2. Template upload");
  await test("uploads A4 / A5 / landscape / multi-page PDFs and PNG / JPG images with correct page sizes", async () => {
    await tab("templates");
    await page.setInputFiles("#tpl-file", [fileObj("A4 clinic.pdf", "application/pdf", FX.a4), fileObj("A5 clinic.pdf", "application/pdf", FX.a5),
      fileObj("Landscape.pdf", "application/pdf", FX.letterL), fileObj("Multi.pdf", "application/pdf", FX.multi),
      fileObj("Scan.png", "image/png", FX.png), fileObj("Photo.jpg", "image/jpeg", FX.jpg)]);
    await page.waitForFunction(() => S.templates.length === 6, null, { timeout: 20000 });
    const t = await page.evaluate(() => S.templates.map(x => ({ id: x.id, name: x.name, w: Math.round(x.wPt), h: Math.round(x.hPt), pages: x.pages, f: x.fields.length })));
    t.forEach(x => (T[x.name] = x.id));
    eq(t.map(x => [x.name, x.w, x.h]), [["A4 clinic", 595, 842], ["A5 clinic", 420, 595], ["Landscape", 792, 612], ["Multi", 595, 842], ["Scan", 595, 842], ["Photo", 595, 842]], "sizes");
    eq(t.find(x => x.name === "Multi").pages, 3, "multi-page detected");
    ok(t.every(x => x.f === 13), "13 default fields auto-placed on every template");
  });
  await test("rejects Word, corrupt PDF and unsupported files with clear messages", async () => {
    const before = (await state()).t;
    await page.setInputFiles("#tpl-file", fileObj("Letterhead.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "UEsDBA=="));
    ok((await toastText()).includes("Save as PDF"), "docx message");
    await sleep(2700);
    await page.setInputFiles("#tpl-file", fileObj("broken.pdf", "application/pdf", Buffer.from("not a pdf at all").toString("base64")));
    await sleep(800); ok(/pdf|invalid|structure/i.test(await page.textContent("#toast")), "corrupt pdf toast: " + await page.textContent("#toast"));
    await sleep(2700);
    await page.setInputFiles("#tpl-file", fileObj("notes.txt", "text/plain", Buffer.from("hello").toString("base64")));
    ok((await toastText()).includes("unsupported"), "txt message");
    await sleep(2700);
    eq((await state()).t, before, "no template added");
  });
  await test("enforces the 10-template limit", async () => {
    const files = Array.from({ length: 6 }, (_, i) => fileObj(`Extra ${i + 1}.png`, "image/png", FX.png));
    await page.setInputFiles("#tpl-file", files);
    await page.waitForFunction(() => S.templates.length >= 10, null, { timeout: 20000 }); await sleep(500);
    eq((await state()).t, 10, "capped at 10");
    ok(await page.isHidden("#tpl-drop"), "upload box hidden at limit");
    // remove the extras again
    page.__dialog = d => d.accept();
    for (let i = 0; i < 4; i++) await page.click(".tpl-card:last-child [data-t-del]");
    eq((await state()).t, 6);
  });

  console.log("\n3. Field-mapping editor");
  await test("drag moves a field, corner-drag resizes it, both persist after reload", async () => {
    await page.click(`[data-t-edit="${T["A4 clinic"]}"]`);
    const box = page.locator('.fbox[data-i="0"]'); const bb = await box.boundingBox(); const stage = await page.locator("#ed-stage").boundingBox();
    const before = await page.evaluate(id => ({ ...S.templates.find(t => t.id === id).fields[0] }), T["A4 clinic"]);
    await page.mouse.move(bb.x + 15, bb.y + 5); await page.mouse.down(); await page.mouse.move(bb.x + 15 + 100, bb.y + 5 + 50, { steps: 6 }); await page.mouse.up();
    const rz = await page.locator('.fbox[data-i="0"] .rz').boundingBox();
    await page.mouse.move(rz.x + 5, rz.y + 5); await page.mouse.down(); await page.mouse.move(rz.x + 45, rz.y + 25, { steps: 5 }); await page.mouse.up();
    await sleep(500);
    await page.reload(); await signIn(page);
    const after = await page.evaluate(id => S.templates.find(t => t.id === id).fields[0], T["A4 clinic"]);
    near(after.x - before.x, 100 / stage.width, 0.004, "x moved"); near(after.y - before.y, 50 / stage.height, 0.004, "y moved");
    near(after.w - before.w, 40 / stage.width, 0.004, "width grew"); near(after.h - before.h, 20 / stage.height, 0.004, "height grew");
  });
  await test("keyboard nudge, Delete, palette add, auto-place, copy layout", async () => {
    await tab("templates"); await page.click(`[data-t-edit="${T["A5 clinic"]}"]`);
    const get = () => page.evaluate(id => S.templates.find(t => t.id === id).fields.map(f => f.key), T["A5 clinic"]);
    await page.click('.fbox[data-i="0"]'); const x0 = await page.evaluate(id => S.templates.find(t => t.id === id).fields[0].x, T["A5 clinic"]);
    await page.keyboard.press("Shift+ArrowRight"); near(await page.evaluate(id => S.templates.find(t => t.id === id).fields[0].x, T["A5 clinic"]) - x0, 0.01, 1e-6, "nudge");
    await page.keyboard.press("Delete"); eq((await get()).length, 12, "deleted one");
    await page.click('#ed-palette button[data-k="patient_age"]'); ok((await get()).includes("patient_age"), "palette add extra field");
    await page.click("#ed-auto"); eq((await get()).length, 14, "auto-place restores missing defaults (13 + 1 extra)");
    await page.selectOption("#ed-copy", T["A4 clinic"]); await sleep(100);
    eq(await get(), await page.evaluate(id => S.templates.find(t => t.id === id).fields.map(f => f.key), T["A4 clinic"]), "layout copied");
  });
  await test("sample-data overlay renders and field style options apply", async () => {
    await page.check("#ed-overlay"); await page.waitForFunction(() => document.querySelector("#ed-stage").classList.contains("overlay"));
    await page.click('.fbox[data-i="0"]'); await page.fill("#p-size", "14"); await page.selectOption("#p-align", "center"); await sleep(400);
    const f = await page.evaluate(id => S.templates.find(t => t.id === id).fields[0], T["A5 clinic"]);
    eq([f.size, f.align], [14, "center"], "style saved");
    await page.uncheck("#ed-overlay");
  });
  await test("REGRESSION: Backspace on another tab no longer deletes template fields", async () => {
    await page.click('.fbox[data-i="1"]');
    const n = await page.evaluate(id => S.templates.find(t => t.id === id).fields.length, T["A5 clinic"]);
    await tab("generate"); await page.click("#tab-generate h3"); await page.keyboard.press("Backspace"); await page.keyboard.press("Delete");
    eq(await page.evaluate(id => S.templates.find(t => t.id === id).fields.length, T["A5 clinic"]), n, "fields intact");
  });

  console.log("\n4. Doctors");
  await test("doctor without registration number is refused", async () => {
    await tab("doctors"); await page.fill("#d-name", "Dr. No Reg"); await page.click("#d-save");
    ok((await toastText()).includes("registration"), "toast"); eq((await state()).d, 0);
  });
  await test("uploaded signature gets a transparent background", async () => {
    await addDoctor("Dr. Ananya Rao", "KMC 45678", FX.sig);
    const alpha = await page.evaluate(async () => { const i = await rawImg(S.doctors[0].signature); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height;
      const x = c.getContext("2d"); x.drawImage(i, 0, 0); return [x.getImageData(2, 2, 1, 1).data[3], Math.max(...x.getImageData(0, 0, c.width, c.height).data.filter((_, k) => k % 4 === 3))]; });
    eq(alpha[0], 0, "white corner is transparent"); ok(alpha[1] > 200, "ink stays opaque");
  });
  await test("drawn signature, edit and delete work", async () => {
    await tab("doctors"); await page.fill("#d-name", "Dr. Vikram Shah"); await page.fill("#d-reg", "MMC 2024/0099");
    await page.click("#d-sig-draw"); const c = await page.locator(".sigpad").boundingBox();
    await page.mouse.move(c.x + 20, c.y + 80); await page.mouse.down(); await page.mouse.move(c.x + 200, c.y + 40, { steps: 8 }); await page.mouse.move(c.x + 320, c.y + 110, { steps: 8 }); await page.mouse.up();
    await page.click('[data-a="use"]'); await page.click("#d-save");
    eq((await state()).d, 2);
    ok(await page.evaluate(() => S.doctors[1].signature.startsWith("data:image/png")), "drawn signature saved");
    await page.click(`[data-d-edit="${await page.evaluate(() => S.doctors[1].id)}"]`); await page.fill("#d-spec", "Dermatologist"); await page.click("#d-save");
    eq(await page.evaluate(() => [S.doctors.length, S.doctors[1].spec]), [2, "Dermatologist"], "edited in place");
    await addDoctor("Dr. Temp", "X1");
    page.__dialog = d => d.accept(); await page.click(`[data-d-del="${await page.evaluate(() => S.doctors[2].id)}"]`); eq((await state()).d, 2, "deleted");
  });

  console.log("\n5. Medicine list");
  await test("CSV import: header aliases, quoted commas, BOM, de-duplication", async () => {
    await tab("medicines");
    const csv = "\uFEFFMedicine Name,Strength,Form,Dose,Timing,Duration,Remarks\nDolo,650 mg,Tab,1-0-1,After food,3 days,\n\"Augmentin, Duo\",625 mg,Tab,1-0-1,After food,5 days,\"Take with \"\"water\"\"\"\nDolo,650 mg,Tab,1-1-1,,,\n,,,\n";
    await page.setInputFiles("#m-file", fileObj("meds.csv", "text/csv", Buffer.from(csv).toString("base64")));
    ok((await toastText()).includes("2 added, 1 updated"), await page.textContent("#toast"));
    eq(await page.evaluate(() => S.medicines.map(m => [m.name, m.dose, m.notes])), [["Dolo", "1-1-1", ""], ["Augmentin, Duo", "1-0-1", 'Take with "water"']]);
  });
  await test("CSV without header row and bulk import of 500 rows", async () => {
    const rows = ["Zincovit,,Tab"]; for (let i = 0; i < 500; i++) rows.push(`Mock Drug ${i},${i} mg,Tab,1-0-1`);
    await page.setInputFiles("#m-file", fileObj("noheader.csv", "text/csv", Buffer.from(rows.join("\n")).toString("base64")));
    eq((await state()).m, 503); ok((await page.textContent("#m-body")).includes("Showing 500 of 503"), "table capped at 500 rows");
  });
  await test("REGRESSION: editing a medicine's name updates it instead of duplicating", async () => {
    const id = await page.evaluate(() => S.medicines.find(m => m.name === "Dolo").id);
    await page.click(`[data-m-edit="${id}"]`); await page.fill("#m-name", "Dolo 650"); await page.click("#m-add");
    eq(await page.evaluate(() => [S.medicines.filter(m => m.name.startsWith("Dolo")).map(m => m.name), S.medicines.length]), [["Dolo 650"], 503]);
  });
  await test("CSV export escapes spreadsheet formulas (CSV injection)", async () => {
    await page.fill("#m-name", "=HYPERLINK(\"http://evil\")"); await page.click("#m-add");
    const { buf } = await download("#m-export");
    const line = buf.toString().split("\n").find(l => l.includes("HYPERLINK"));
    ok(line.startsWith("\"'=HYPERLINK"), "formula neutralised: " + line);
    await page.evaluate(() => { S.medicines = S.medicines.filter(m => !m.name.startsWith("=") && !m.name.startsWith("Mock Drug")); save("medicines"); updateCounts(); });
  });

  console.log("\n6. Generate — validation");
  const DOC = await page.evaluate(() => S.doctors[0].id);
  await test("each missing required field blocks generation with a clear message", async () => {
    await tab("generate"); await page.evaluate(() => newPrescription());
    await page.selectOption("#g-tpl", ""); await page.selectOption("#g-doc", "");
    const msg = async () => { await page.click("#g-download"); return toastText(); };
    ok((await msg()).includes("template"), "template");
    await page.selectOption("#g-tpl", T["A4 clinic"]); ok((await msg()).includes("doctor"), "doctor");
    await page.selectOption("#g-doc", DOC); ok((await msg()).includes("name"), "name");
    await page.fill("#g-name", "Asha Verma"); ok((await msg()).includes("age"), "age");
    await page.fill("#g-age", "abc"); ok((await msg()).includes("age looks wrong"), "non-numeric age");
    await page.fill("#g-age", "7"); await page.selectOption("#g-ageunit", "M"); ok((await msg()).includes("gender"), "gender");
    await page.selectOption("#g-gender", "Female"); ok((await msg()).includes("medicine"), "medicine");
    await page.fill("#g-meds .m-name", "Dolo 650"); await page.dispatchEvent("#g-meds .m-name", "change");
    eq(await page.inputValue("#g-meds .m-dose"), "1-1-1", "autofill from medicine list");
    ok((await msg()).includes("confirmation"), "attestation required");
    ok(await noDownload("#g-download", 300), "nothing downloaded while invalid");
  });
  await test("warnings: future date, bad phone/email, unmapped fields", async () => {
    const tomorrow = await page.evaluate(() => { const d = new Date(Date.now() + 864e5); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); });
    await page.fill("#g-date", tomorrow); await page.fill("#g-phone", "12345"); await page.fill("#g-email", "not-an-email");
    await page.waitForFunction(() => document.querySelector("#g-warn").textContent.includes("future"));
    const w = await page.textContent("#g-warn");
    ok(w.includes("Phone number") && w.includes("Email address"), "phone/email warnings");
    await page.fill("#g-date", await page.evaluate(() => todayISO())); await page.fill("#g-phone", "098765 43210"); await page.fill("#g-email", "asha@example.com");
  });
  await test("template without a Medicines box is blocked", async () => {
    await page.evaluate(id => { const t = S.templates.find(x => x.id === id); t._bak = t.fields; t.fields = t.fields.filter(f => f.key !== "medicines"); }, T["Photo"]);
    await page.selectOption("#g-tpl", T["Photo"]); await page.check("#g-attest");
    await page.click("#g-download"); ok((await toastText()).includes("no Medicines box"), "blocked");
    await page.evaluate(id => { const t = S.templates.find(x => x.id === id); t.fields = t._bak; delete t._bak; }, T["Photo"]);
  });
  await test("valid prescription downloads a correct PDF; age in months prints as 'Mo'", async () => {
    await page.selectOption("#g-tpl", T["A4 clinic"]); await page.check("#g-attest");
    eq(await page.evaluate(() => fieldValue("age_gender", collect())), "7 Mo / F", "age/sex label");
    const { name, buf } = await download("#g-download");
    ok(/^RX_\d{6}_0001_Asha_Verma\.pdf$/.test(name), "file name " + name);
    const info = await inspectPdf(buf);
    eq([info.pages, Math.round(info.w), Math.round(info.h)], [1, 595, 842], "1 page A4");
    ok(info.title.startsWith("Prescription RX-"), "PDF title metadata");
    eq((await state()).n, 1, "Rx counter moved to 1");
  });

  console.log("\n7. Rendering accuracy");
  await test("text lands inside mapped boxes and nowhere else (pixel check)", async () => {
    const r = await page.evaluate(async (id) => {
      const tpl = S.templates.find(t => t.id === id), doc = S.doctors[0];
      const { canvas } = await renderRx(tpl, doc, SAMPLE); const x = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
      const ink = (fx, fy, fw, fh) => { const d = x.getImageData(Math.round(fx * W), Math.round(fy * H), Math.max(1, Math.round(fw * W)), Math.max(1, Math.round(fh * H))).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 140) n++; return n; };
      const out = {}; for (const f of tpl.fields) out[f.key] = ink(f.x, f.y, f.w, f.h);
      // a strip in the middle-left gutter (outside every box) must stay blank
      out.__gutter = ink(0.005, 0.2, 0.04, 0.6);
      return out;
    }, T["Scan"]);
    for (const k of ["patient_name", "age_gender", "date", "patient_phone", "rx_id", "medicines", "advice", "investigations", "follow_up", "signature", "doctor_block"]) ok(r[k] > 20, `${k} has ink (${r[k]})`);
    eq(r.stamp, 0, "no stamp configured => stamp box blank"); eq(r.__gutter, 0, "gutter outside boxes is blank");
  });
  await test("over-long content shows an overflow warning and asks before generating", async () => {
    const long = mockRx(0); long.patient.name = "Long Case";
    long.meds = Array.from({ length: 16 }, (_, i) => ({ name: "Very long medicine name number " + i, strength: "500 mg", form: "Tab", dose: "1-0-1", timing: "After food", duration: "5 days", notes: "Long instruction text that goes on and on to force wrapping in the notes line " + i }));
    await fillRx(long, T["A5 clinic"], DOC);
    await page.waitForFunction(() => document.querySelector("#g-warn").textContent.includes("does not fully fit"));
    let asked = ""; page.__dialog = d => { asked = d.message(); d.dismiss(); };
    ok(await noDownload("#g-download", 2500), "dismissed => no PDF"); ok(asked.includes("too long"), "confirm shown");
    page.__dialog = d => d.accept();
  });
  await test("preview render time is acceptable", async () => {
    const ms = await page.evaluate(async id => { const t0 = performance.now(); for (let i = 0; i < 5; i++) await renderRx(S.templates.find(t => t.id === id), S.doctors[0], SAMPLE); return (performance.now() - t0) / 5; }, T["A4 clinic"]);
    console.log(`      avg render ${ms.toFixed(0)} ms`); ok(ms < 1500, `render too slow: ${ms} ms`);
  });

  console.log("\n7b. Sample letterheads (samples/letterheads)");
  const SAMPLE_RX = {
    patient: { name: "Meera Krishnan", age: "42", ageUnit: "Y", gender: "Female", phone: "9845012345", email: "" }, mode: "Video",
    meds: [
      { name: "Amoxicillin + Clavulanic acid", strength: "625 mg", form: "Tab", dose: "1-0-1", timing: "After food", duration: "5 days", notes: "Complete the full course" },
      { name: "Paracetamol", strength: "650 mg", form: "Tab", dose: "1-1-1", timing: "After food", duration: "3 days", notes: "Only if fever above 100°F" },
      { name: "Pantoprazole", strength: "40 mg", form: "Tab", dose: "1-0-0", timing: "Empty stomach", duration: "5 days", notes: "" },
      { name: "Montelukast + Levocetirizine", strength: "10/5 mg", form: "Tab", dose: "0-0-1", timing: "At bedtime", duration: "7 days", notes: "" },
    ],
    investigations: "CBC, CRP, Chest X-ray PA view", advice: "Steam inhalation twice a day. Warm fluids. Avoid cold drinks.", followUp: "After 5 days, or earlier if breathlessness"
  };
  await test("uploads the 4 sample letterheads (3 PDFs + 1 PNG scan) up to the 10-template limit", async () => {
    await tab("templates");
    const files = Object.entries(LAYOUTS).map(([name, L]) => ({ name: L.file, mimeType: L.file.endsWith(".png") ? "image/png" : "application/pdf", buffer: fs.readFileSync(path.join(SAMPLES, L.file)) }));
    await page.setInputFiles("#tpl-file", files);
    await page.waitForFunction(() => S.templates.length === 10, null, { timeout: 20000 }); await sleep(400);
    for (const [name, L] of Object.entries(LAYOUTS)) {
      const id = await page.evaluate(([file, fields]) => { const t = S.templates.find(x => x.name === file.replace(/\.[^.]+$/, "")); t.fields = fields; save("templates"); return t.id; }, [L.file, L.fields]);
      T[name] = id;
    }
    await tab("templates"); eq(await page.locator(".tpl-card").count(), 10);
  });
  await test("each sample letterhead produces a correct, fully-filled prescription", async () => {
    const DOC = await page.evaluate(() => S.doctors[0].id);
    const sizes = { "carefirst-a4": [595, 842], "mehta-skin-a5": [420, 595], "healthbridge-letter": [612, 792], "sunrise-a4-scan": [595, 842] };
    for (const name of Object.keys(LAYOUTS)) {
      await page.evaluate(() => newPrescription()); await fillRx(SAMPLE_RX, T[name], DOC);
      await page.evaluate(() => updatePreview()); // render now instead of waiting on the debounce, so the warnings are this template's
      const warn = await page.textContent("#g-warn"); ok(!warn.includes("does not fully fit"), `${name}: overflow warning: ${warn}`);
      const ink = await page.evaluate(async id => {
        const tpl = S.templates.find(t => t.id === id); const { canvas } = await renderRx(tpl, S.doctors[0], collect()); const x = canvas.getContext("2d");
        const out = {}; for (const f of tpl.fields) { const d = x.getImageData(f.x * canvas.width, f.y * canvas.height, Math.max(1, f.w * canvas.width), Math.max(1, f.h * canvas.height)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 120 && d[i + 1] < 120) n++; out[f.key] = n; }
        return out;
      }, T[name]);
      for (const [k, n] of Object.entries(ink)) if (k !== "stamp") ok(n > 15, `${name}: "${k}" box is empty`);
      const { file, buf } = await download("#g-download"); const info = await inspectPdf(buf);
      eq(info.pages, 1, name); near(info.w, sizes[name][0], 1, `${name} width`); near(info.h, sizes[name][1], 1, `${name} height`); // PNG scans round by a point
      const named = path.join(OUT, `sample-${name}.pdf`); fs.renameSync(file, named);
      if (pdftoppm) require("child_process").execFileSync("pdftoppm", ["-r", "80", "-png", "-singlefile", named, named.replace(/\.pdf$/, "")]);
    }
  });
  await test("mapping on a letterhead with pre-printed doctor details warns but still issues", async () => {
    await fillRx(SAMPLE_RX, T["mehta-skin-a5"], await page.evaluate(() => S.doctors[0].id)); await page.evaluate(() => updatePreview());
    ok((await page.textContent("#g-warn")).includes("no Doctor block"), "warning shown");
    ok(!(await page.textContent("#g-warn")).includes("Select"), "no blocking errors");
  });

  console.log(`\n8. Bulk mock run (${BULK} prescriptions)`);
  const bulk = [], bulkPatients = [];
  await test(`${BULK} randomised prescriptions across 10 templates and 2 doctors produce valid, uniquely-numbered PDFs`, async () => {
    const tplIds = Object.values(T), docIds = await page.evaluate(() => S.doctors.map(d => d.id));
    const tplSize = Object.fromEntries(await page.evaluate(() => S.templates.map(t => [t.id, [Math.round(t.wPt), Math.round(t.hPt)]])));
    for (let i = 0; i < BULK; i++) {
      await page.evaluate(() => newPrescription());
      const data = mockRx(i + 1), tid = tplIds[i % tplIds.length]; bulkPatients.push(data.patient.name, data.patient.phone);
      await fillRx(data, tid, docIds[i % 2]);
      const rx = await page.evaluate(() => G.rxId);
      const { name, buf } = await download("#g-download");
      const info = await inspectPdf(buf);
      eq([info.pages, Math.round(info.w), Math.round(info.h)], [1, ...tplSize[tid]], `#${i + 1} ${name}`);
      ok(buf.length > 20000 && buf.length < 3e6, `#${i + 1} size ${buf.length}`);
      bulk.push({ rx, name, kb: Math.round(buf.length / 1024), meds: data.meds.length });
    }
    const ids = bulk.map(b => b.rx); eq(new Set(ids).size, BULK, "unique Rx IDs");
    const nums = ids.map(x => +x.split("-").pop()); ok(nums.every((n, i) => !i || n === nums[i - 1] + 1), "sequential numbering");
    eq((await state()).n, nums.at(-1), "Rx counter matches the last issued number");
  });

  console.log("\n9. No patient data stored");
  await test("after all prescriptions, no patient name, phone or medicine text exists anywhere in browser storage", async () => {
    const st = await dumpStorage(page);
    ok(!JSON.parse(st).keys.includes("history"), "no history key");
    const leaks = [...bulkPatients, "Asha Verma", "Meera Krishnan", "9845012345"].filter(x => st.includes(x));
    eq(leaks, [], "patient data found in storage");
    eq(await page.locator('[data-tab="history"]').count(), 0, "no History tab");
  });
  await test("history saved by an older version is purged on start-up", async () => {
    await page.evaluate(async () => { await DB.set("history", [{ id: "OLD-1", data: { patient: { name: "Legacy Patient", phone: "9000000001" } } }]); });
    ok((await dumpStorage(page)).includes("Legacy Patient"), "seeded");
    await page.reload(); await signIn(page);
    ok(!(await dumpStorage(page)).includes("Legacy Patient"), "purged");
  });
  await test("re-sharing the same patient keeps the Rx ID; reusing the form for a new patient gets a new Rx ID", async () => {
    await page.evaluate(() => newPrescription()); await fillRx(mockRx(321), T["A4 clinic"], await page.evaluate(() => S.doctors[0].id));
    const id1 = await page.evaluate(() => G.rxId); await download("#g-download"); await download("#g-download");
    eq(await page.evaluate(() => [G.rxId, S.counter.n]), [id1, +id1.split("-").pop()], "same Rx, counter bumped once");
    await page.fill("#g-adv", "Edited advice"); await page.check("#g-attest"); await download("#g-download");
    eq(await page.evaluate(() => G.rxId), id1, "editing the same patient keeps the number");
    await page.fill("#g-name", "Somebody Else");
    const id2 = await page.evaluate(() => G.rxId); ok(id2 !== id1 && +id2.split("-").pop() === +id1.split("-").pop() + 1, `new number ${id2}`);
    ok(!(await page.isChecked("#g-attest")), "confirmation must be ticked again");
    ok((await toastText()).includes("Different patient"), "operator told");
  });

  console.log("\n10. Sharing");
  await test("WhatsApp: number normalisation (0-prefix, +91, spaces) and pre-filled message", async () => {
    await page.evaluate(() => { window.__opened = []; window.open = u => { const w = { closed: false, opener: 1, location: { href: u || "" }, close() { this.closed = true; } }; window.__opened.push(w); return w; }; });
    for (const [raw, want] of [["098765 43210", "919876543210"], ["+91 98765-43210", "919876543210"], ["9876543210", "919876543210"], ["", ""]]) {
      await page.evaluate(() => newPrescription()); const d = mockRx(5); d.patient.phone = raw; await fillRx(d, T["A4 clinic"], DOC);
      await Promise.all([page.waitForEvent("download"), page.click("#g-wa")]); await sleep(150);
      const url = await page.evaluate(() => window.__opened.at(-1).location.href);
      ok(url.startsWith(`https://wa.me/${want}?text=`), `${JSON.stringify(raw)} => ${url.slice(0, 40)}`);
      ok(decodeURIComponent(url).includes(d.patient.name), "message has patient name");
    }
  });
  await test("WhatsApp: tab opened up-front is closed again if validation fails", async () => {
    await page.evaluate(() => newPrescription()); await page.click("#g-wa"); await sleep(200);
    ok(await page.evaluate(() => window.__opened.at(-1).closed), "blank tab closed");
  });
  await test("Share: passes the PDF to navigator.share; falls back to a 'Share now' tap when activation expired", async () => {
    await page.evaluate(() => { let calls = 0; navigator.canShare = () => true;
      navigator.share = async d => { calls++; if (calls === 1) throw new DOMException("expired", "NotAllowedError"); window.__shared = d.files[0].name + "|" + d.files[0].type; }; });
    await fillRx(mockRx(7), T["A4 clinic"], DOC); await page.click("#g-share");
    await page.waitForSelector(".modal [data-a=go]"); await page.click(".modal [data-a=go]"); await sleep(200);
    ok(/^RX_.*\.pdf\|application\/pdf$/.test(await page.evaluate(() => window.__shared)), "shared " + await page.evaluate(() => window.__shared));
  });
  await test("Email: downloads PDF and no page errors", async () => {
    await page.evaluate(() => newPrescription()); await fillRx(mockRx(8), T["A4 clinic"], DOC);
    const { buf } = await download("#g-email-btn"); eq((await inspectPdf(buf)).pages, 1);
  });

  console.log("\n11. Security");
  await test("HTML/script in patient, doctor, template and medicine names is never executed", async () => {
    const X = '<img src=x onerror="window.__xss=1">';
    await page.evaluate(x => { S.templates[0].name = x; S.doctors[0].qual = x; save("templates"); save("doctors"); }, X);
    await page.evaluate(() => newPrescription()); const d = mockRx(9); d.patient.name = X; d.meds[0].name = X; d.advice = X;
    await fillRx(d, T["A4 clinic"], DOC); await download("#g-download");
    for (const t of ["templates", "doctors", "medicines", "generate"]) await tab(t);
    await sleep(300); eq(await page.evaluate(() => window.__xss), undefined, "no script ran");
    await page.evaluate(() => { S.templates[0].name = "A4 clinic"; S.doctors[0].qual = "MBBS, MD"; save("templates"); save("doctors"); });
  });

  console.log("\n12. Settings & backup");
  await test("Rx prefix and date format settings apply", async () => {
    await tab("settings"); await page.fill("#s-prefix", "acme!"); await page.selectOption("#s-datefmt", "dmmy"); await page.click("#s-save");
    ok((await page.evaluate(() => nextRxId())).startsWith("ACME-"), "prefix sanitised + applied to the next Rx ID");
    await page.evaluate(() => newPrescription()); ok((await page.evaluate(() => G.rxId)).startsWith("ACME-"), "new prescription uses it");
    eq(await page.evaluate(() => fmtDate("2026-11-07")), "07 Nov 2026");
  });
  let backup;
  await test("setup backup export -> delete all -> sign in with default -> import restores setup and login", async () => {
    const before = await state();
    await tab("settings"); backup = (await download("#s-export")).buf;
    page.__dialog = d => d.type() === "prompt" ? d.accept("DELETE") : d.accept();
    const bj = JSON.parse(backup.toString());
    ok(!("history" in bj) && !backup.toString().includes("Meera Krishnan"), "backup has no patient data");
    await page.click("#s-wipe"); await page.waitForSelector("#login", { state: "visible" });
    ok(await page.isVisible("#lg-hint"), "login reset to default after wipe");
    await signIn(page, DEFAULT_CREDS);
    eq((await state()).t, 0, "wiped");
    await tab("settings");
    await page.setInputFiles("#s-file", { name: "b.json", mimeType: "application/json", buffer: backup });
    await page.waitForFunction(() => document.querySelector("#toast").textContent === "Backup restored"); await sleep(500);
    const after = await state(); eq([after.t, after.d, after.m, after.n], [before.t, before.d, before.m, before.n], "restored");
    await page.click("#hdr-logout"); await signIn(page, CREDS); // restored backup carries the changed login
  });
  await test("old backups containing patient history import the setup but never the history", async () => {
    const old = JSON.parse(backup.toString()); old.history = [{ id: "RX-OLD-1", data: { patient: { name: "Imported Patient", phone: "9000000002" } } }];
    page.__dialog = d => d.accept(); await tab("settings");
    await page.setInputFiles("#s-file", { name: "old.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(old)) });
    await page.waitForFunction(() => document.querySelector("#toast").textContent === "Backup restored"); await sleep(500);
    ok(!(await dumpStorage(page)).includes("Imported Patient"), "history not imported");
  });
  await test("malicious or broken backups are rejected without touching data", async () => {
    const before = await state(); const evil = JSON.parse(backup.toString());
    evil.templates[0].img = 'x" onerror="window.__xss2=1'; page.__dialog = d => d.accept();
    await page.setInputFiles("#s-file", { name: "evil.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(evil)) });
    ok((await toastText()).includes("damaged"), "rejected tampered image");
    await page.setInputFiles("#s-file", { name: "junk.json", mimeType: "application/json", buffer: Buffer.from("{oops") });
    ok(/JSON|Unexpected|Expected/i.test(await toastText()), "rejected invalid JSON");
    await page.setInputFiles("#s-file", { name: "other.json", mimeType: "application/json", buffer: Buffer.from('{"app":"x"}') });
    ok((await toastText()).includes("not an Rx Studio backup"), "rejected foreign file");
    eq(await state(), before, "data unchanged"); eq(await page.evaluate(() => window.__xss2), undefined);
  });
  await test("setup persists across a browser reload", async () => {
    const before = await state(); await page.reload(); await signIn(page); eq(await state(), before);
  });

  await test("forgot password: RESET wipes the setup on that device and restores the default login", async () => {
    const main = page, mctx = ctx;
    try {
    page = await newPage(); await page.click("#ob-demo"); await page.waitForFunction(() => S.templates.length > 0);
    await tab("settings"); await page.fill("#s-pw-cur", DEFAULT_CREDS.pass); await page.fill("#s-pw-new", "Forgot#2026"); await page.fill("#s-pw-new2", "Forgot#2026"); await page.click("#s-login-save");
    await page.click("#hdr-logout");
    let typed = 0; page.__dialog = d => { if (d.type() === "prompt") { typed++; d.accept(typed === 1 ? "nope" : "RESET"); } else d.accept(); };
    await page.click("#lg-forgot"); await sleep(300); ok(await page.evaluate(() => S.templates.length > 0), "wrong word keeps the setup");
    await page.click("#lg-forgot"); await page.waitForFunction(() => document.querySelector("#toast").textContent.startsWith("Setup deleted"));
    eq(await page.evaluate(() => S.templates.length), 0, "setup wiped");
    await signIn(page, DEFAULT_CREDS); ok(await page.isVisible(".wrap"), "default login works again");
    } finally { await page.context().close(); page = main; ctx = mctx; }
  });

  console.log("\n13. Mobile");
  await test("no horizontal scrolling on any tab at 390 px", async () => {
    const desktop = page; const mctx = ctx;
    try {
    page = await newPage({ width: 390, height: 844 });
    await page.setInputFiles("#s-file", { name: "b.json", mimeType: "application/json", buffer: backup }).catch(() => {});
    await page.waitForFunction(() => document.querySelector("#toast").textContent === "Backup restored"); await sleep(500);
    const bad = [];
    for (const t of ["generate", "templates", "doctors", "medicines", "settings"]) {
      await tab(t); await sleep(150); const w = await page.evaluate(() => document.documentElement.scrollWidth); if (w > 390) bad.push(`${t}:${w}`);
      await page.screenshot({ path: path.join(OUT, `mobile-${t}.png`) });
    }
    await tab("templates"); await page.click("[data-t-edit]"); await sleep(300);
    await page.screenshot({ path: path.join(OUT, "mobile-editor.png") }); const w = await page.evaluate(() => document.documentElement.scrollWidth); if (w > 390) bad.push(`editor:${w}`);
    eq(bad, [], "overflowing tabs");
    } finally { await page.context().close(); page = desktop; ctx = mctx; }
  });

  console.log("\n14. Phone experience (Pixel 7, touch)");
  {
    const desktop = page, dctx = ctx;
    try {
    page = await newPage(null, "Pixel 7");
    const shot = n => page.screenshot({ path: path.join(OUT, `phone-${n}.png`) });
    await page.tap("#ob-demo"); await page.waitForFunction(() => S.templates.length && S.doctors.length && S.medicines.length);
    await test("phone: every field is >=16px (no iOS zoom), every tap target >=40px, tabs on one scrollable row", async () => {
      const r = await page.evaluate(() => {
        const vis = e => e.offsetParent !== null && getComputedStyle(e).visibility !== "hidden";
        const small = [...document.querySelectorAll("button,input,select,textarea,a")].filter(vis).filter(e => e.type !== "checkbox" && e.getBoundingClientRect().height < 40).map(e => e.id || e.className || e.tagName);
        const tinyFont = [...document.querySelectorAll("input,select,textarea")].filter(vis).filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id || e.className);
        const nav = document.querySelector("#tabs");
        return { small, tinyFont, navH: nav.offsetHeight, navScrolls: nav.scrollWidth > nav.clientWidth, sticky: getComputedStyle(nav).position, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      eq(r.tinyFont, [], "fields under 16px"); eq(r.small, [], "tap targets under 40px");
      ok(r.navH < 60 && r.sticky === "sticky", `tab bar single sticky row (h=${r.navH})`); eq(r.overflow, 0, "horizontal overflow");
      await shot("generate");
    });
    await test("phone: sticky action bar on Generate only; preview is a sheet that renders on open", async () => {
      ok(await page.isVisible("#mbar"), "bar visible"); ok(await page.isHidden("#g-download"), "in-card Download hidden (bar has it)");
      ok(await page.evaluate(() => document.querySelector("#g-canvas").classList.contains("hidden")), "preview not rendered while closed (saves battery)");
      await page.tap("#mb-preview"); await page.waitForFunction(() => !document.querySelector("#g-canvas").classList.contains("hidden"));
      const box = await page.locator("#g-canvas").boundingBox(); ok(box.width > 300 && box.y < 200, "full-width preview near the top");
      eq(await page.textContent("#mb-preview-lbl"), "Edit");
      await page.tap("#pv-zoom"); ok((await page.locator("#g-canvas").boundingBox()).width > 700, "zoomed in"); await shot("preview-sheet");
      for (const t of ["medicines", "templates"]) { await page.evaluate(() => closePreview()); await tab(t); ok(await page.isHidden("#mbar"), `bar hidden on ${t}`); }
      await tab("generate");
    });
    await test("phone: Android back button closes the preview instead of leaving the app", async () => {
      await page.tap("#mb-preview"); await page.waitForFunction(() => document.body.classList.contains("pv-open"));
      await page.goBack(); await page.waitForFunction(() => !document.body.classList.contains("pv-open"));
      ok(page.url().endsWith(APP.split("/").pop()), "still on the app");
    });
    await test("phone: badge counts problems, then turns into a tick when ready", async () => {
      await page.evaluate(() => fillForm({ rxId: G.rxId, templateId: S.templates[0].id, doctorId: S.doctors[0].id, date: todayISO(), mode: "Video" }));
      await page.waitForFunction(() => document.querySelector("#mb-badge").textContent === "4"); // name, age, gender, medicine
      await page.fill("#g-name", "Meera Nair"); await page.fill("#g-age", "29"); await page.selectOption("#g-gender", "Female");
      await page.waitForFunction(() => document.querySelector("#mb-badge").textContent === "1");
    });
    await test("phone: medicine autocomplete shows strengths, fills the row on tap and moves to Dose", async () => {
      const name = page.locator("#g-meds .m-name").first(); await name.tap(); await page.keyboard.type("para");
      await page.waitForSelector(".ac [data-ac]"); const opts = await page.$$eval(".ac [data-ac]", b => b.map(x => x.textContent));
      ok(opts.length >= 2 && opts.some(o => o.includes("650 mg")) && opts.some(o => o.includes("500 mg")), "strength shown: " + opts.join(" | "));
      await shot("autocomplete");
      const i = opts.findIndex(o => o.includes("500 mg")); await page.tap(`.ac [data-ac="${i}"]`);
      eq(await page.evaluate(() => { const r = document.querySelector("#g-meds .medrow"); return [r.querySelector(".m-name").value, r.querySelector(".m-strength").value, r.querySelector(".m-form").value, document.activeElement.className]; }),
        ["Paracetamol", "500 mg", "Tab", "m-dose"]);
      ok(await page.isHidden(".ac"), "list closed");
      await page.fill("#g-meds .m-dose", "1-0-1");
      await page.waitForFunction(() => document.querySelector("#mb-badge").textContent === "✓");
    });
    await test("phone: Share without the consultation tick scrolls the tick into view", async () => {
      await page.evaluate(() => scrollTo(0, 0)); await page.tap("#mb-share"); await sleep(700);
      ok((await page.textContent("#toast")).includes("confirmation"), "toast");
      const b = await page.locator("#g-attest").boundingBox(); const vh = page.viewportSize().height;
      ok(b.y > 0 && b.y < vh - 80, `tick visible above the bar (y=${Math.round(b.y)})`);
      eq(await page.evaluate(() => document.activeElement.id), "g-attest");
    });
    await test("phone: missing field error jumps to that field", async () => {
      await page.fill("#g-age", ""); await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await page.tap("#mb-pdf"); await sleep(700);
      eq(await page.evaluate(() => document.activeElement.id), "g-age"); await page.fill("#g-age", "29");
    });
    await test("phone: PDF button in the bar downloads a valid prescription", async () => {
      await page.check("#g-attest"); const { buf } = await download("#mb-pdf"); const info = await inspectPdf(buf); eq(info.pages, 1);
    });
    await test("phone: login screen fits the phone and the medicine table becomes cards", async () => {
      for (const t of ["medicines"]) {
        await tab(t); await sleep(150);
        const r = await page.evaluate(sel => { const tr = document.querySelector(sel + " tr"); return { disp: tr && getComputedStyle(tr).display, thead: getComputedStyle(document.querySelector(sel).closest("table").tHead).display, over: document.documentElement.scrollWidth - innerWidth }; }, t === "history" ? "#h-body" : "#m-body");
        eq([r.disp, r.thead, r.over], ["block", "none", 0], t); await shot(t);
      }
      await page.click("#hdr-logout"); await shot("login");
      const lg = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, font: parseFloat(getComputedStyle(document.querySelector("#lg-pass")).fontSize), btnH: document.querySelector("#lg-btn").offsetHeight }));
      eq([lg.over, lg.font >= 16, lg.btnH >= 44], [0, true, true], "login screen on phone"); await signIn(page, DEFAULT_CREDS);
    });
    await test("phone: template editor zooms to 200%, tap selects a field, toolbar edits it, tap outside deselects", async () => {
      await tab("templates"); await page.tap("[data-t-edit]"); await sleep(300);
      eq(await page.inputValue("#ed-zoom"), "2", "default zoom on phones");
      ok(await page.evaluate(() => { const s = document.querySelector("#ed-scroll"); return s.scrollWidth > s.clientWidth; }), "zoomed stage pans inside its frame");
      ok(await page.isHidden("#ed-mtool"), "toolbar hidden with nothing selected");
      const fb = page.locator('.fbox[data-i="0"]'); await fb.scrollIntoViewIfNeeded(); await fb.tap();
      ok(await page.isVisible("#ed-mtool"), "toolbar shown"); const s0 = await page.evaluate(() => E.tpl.fields[0].size);
      await page.tap('[data-mt="bigger"]'); await page.tap('[data-mt="bigger"]'); await page.tap('[data-mt="align"]'); await page.tap('[data-mt="bold"]');
      const f = await page.evaluate(() => E.tpl.fields[0]); eq([f.size, f.align, f.bold], [s0 + 1, "center", false], "toolbar edits");
      ok((await page.textContent("#mt-lbl")).includes(`${s0 + 1}pt`), "label shows size");
      await shot("editor");
      await page.tap('[data-mt="done"]'); ok(await page.isHidden("#ed-mtool"), "deselected");
      await fb.tap(); ok(await page.isVisible("#ed-mtool"), "reselected");
      const pt = await page.evaluate(() => { const r = document.querySelector("#ed-scroll").getBoundingClientRect();
        for (let y = Math.max(r.top, 0) + 5; y < Math.min(r.bottom, innerHeight - 90); y += 7) for (let x = r.left + 5; x < r.right - 5; x += 7) { const el = document.elementFromPoint(x, y); if (el && el.id === "ed-stage") return [x, y]; } return null; });
      ok(pt, "found blank spot"); await page.touchscreen.tap(pt[0], pt[1]); await sleep(150);
      ok(await page.isHidden("#ed-mtool"), "tap on blank template deselects");
    });
    await test("phone: still no horizontal overflow on any tab after all interactions", async () => {
      const bad = []; for (const t of ["generate", "templates", "doctors", "medicines", "settings"]) { await tab(t); await sleep(100); const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) bad.push(`${t}:+${o}`); }
      eq(bad, []);
    });
    } finally { await page.context().close(); page = desktop; ctx = dctx; }
  }
  await test("desktop: phone-only UI stays hidden", async () => {
    eq(await page.evaluate(() => ["#mbar", "#ed-mtool", ".pv-sheet-h", ".ml"].map(s => getComputedStyle(document.querySelector(s)).display)), ["none", "none", "none", "none"]);
    ok(await page.isHidden("#pv-close"), "sheet controls hidden");
    ok(await page.isVisible("#g-download"), "desktop Download button visible");
  });

  await test("no uncaught JavaScript errors during the whole run", async () => eq(pageErrors, []));

  /* ---------- report ---------- */
  await page.screenshot({ path: path.join(OUT, "desktop-final.png"), fullPage: true });
  await browser.close(); server.close();
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  const md = [`# Rx Studio — mock test report`, ``, `Run: ${new Date().toISOString()} · Chromium headless · bulk size ${BULK}`, ``,
    `**${pass} passed, ${fail} failed** (${results.length} tests)`, ``, `| | Test | Time |`, `|---|---|---|`,
    ...results.map(r => `| ${r.ok ? "✅" : "❌"} | ${r.name}${r.ok ? "" : `<br>\`${r.err.replace(/\|/g, "\\|")}\``} | ${r.ms} ms |`), ``,
    `## Bulk run`, ``, `| Rx ID | File | Medicines | Size |`, `|---|---|---|---|`, ...bulk.map(b => `| ${b.rx} | ${b.name} | ${b.meds} | ${b.kb} KB |`)].join("\n");
  fs.writeFileSync(path.join(OUT, "report.md"), md + "\n");
  console.log(`\n${pass} passed, ${fail} failed. Report: ${path.relative(process.cwd(), path.join(OUT, "report.md"))}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
