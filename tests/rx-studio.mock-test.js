#!/usr/bin/env node
/*
 * Rx Studio — end-to-end mock test suite
 *
 * Drives prescription.html in headless Chromium with generated mock data:
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
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.error("Playwright not found. Run: npm i -D playwright && npx playwright install chromium"); process.exit(2); }

const ROOT = path.resolve(__dirname, "..");
const NM = path.join(__dirname, "node_modules");
const OUT = path.join(__dirname, "output");
const BULK = +process.env.BULK || 30;
const APP = process.env.APP || "prescription.html"; // path relative to the repo root
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
for (const f of ["pdfjs-dist/build/pdf.min.js", "pdfjs-dist/build/pdf.worker.min.js", "jspdf/dist/jspdf.umd.min.js"])
  if (!fs.existsSync(path.join(NM, f))) { console.error(`Missing ${f}. Run: cd tests && npm install`); process.exit(2); }
const pdfjs = require(path.join(NM, "pdfjs-dist/legacy/build/pdf.js"));

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
async function newPage(viewport = { width: 1400, height: 1000 }) {
  ctx = await browser.newContext({ acceptDownloads: true, viewport });
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
  await p.waitForFunction(() => typeof G !== "undefined" && G.rxId && document.querySelector("#g-rxid").textContent !== "—");
  return p;
}
async function reset() {
  await page.evaluate(async () => {
    for (const k of KEYS) { S[k] = k === "settings" ? { ...DEFAULT_SETTINGS } : k === "counter" ? { n: 0 } : []; await save(k); }
    localStorage.clear();
  });
  await page.reload();
  await page.waitForFunction(() => typeof G !== "undefined" && G.rxId);
}
const state = () => page.evaluate(() => ({ t: S.templates.length, d: S.doctors.length, m: S.medicines.length, h: S.history.length, n: S.counter.n, rx: G.rxId }));
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
  page = await newPage();
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
    await page.reload(); await page.waitForFunction(() => typeof G !== "undefined" && G.rxId);
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
    eq((await state()).h, 1, "saved to history");
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

  console.log(`\n8. Bulk mock run (${BULK} prescriptions)`);
  const bulk = [];
  await test(`${BULK} randomised prescriptions across 6 templates and 2 doctors produce valid, uniquely-numbered PDFs`, async () => {
    const tplIds = Object.values(T), docIds = await page.evaluate(() => S.doctors.map(d => d.id));
    const tplSize = Object.fromEntries(await page.evaluate(() => S.templates.map(t => [t.id, [Math.round(t.wPt), Math.round(t.hPt)]])));
    for (let i = 0; i < BULK; i++) {
      await page.evaluate(() => newPrescription());
      const data = mockRx(i + 1), tid = tplIds[i % tplIds.length];
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
    eq((await state()).h, Math.min(BULK + 1, 100), "history count (capped at 100)");
  });

  console.log("\n9. History");
  await test("search, re-open + re-issue (versioned), repeat, re-download, delete", async () => {
    const [id, who] = await page.evaluate(() => [S.history[0].id, S.history[0].data.patient.name]);
    await tab("history"); await page.fill("#h-search", id); eq(await page.locator("#h-body tr").count(), 1, "search by Rx ID");
    await page.click(`[data-h-open="${id}"]`); eq(await page.evaluate(() => G.rxId), id, "opened with same Rx ID");
    await page.fill("#g-adv", "Updated advice"); await page.check("#g-attest"); await download("#g-download");
    eq(await page.evaluate(i => S.history.find(h => h.id === i).versions, id), 2, "re-issue recorded as v2");
    const before = (await state()).h;
    await tab("history"); await page.fill("#h-search", id); await page.click(`[data-h-copy="${id}"]`);
    ok(await page.evaluate(([i, w]) => G.rxId !== i && document.querySelector("#g-name").value === w, [id, who]), "repeat => new Rx ID, same patient");
    await tab("history"); await page.fill("#h-search", id);
    const { buf } = await download(`[data-h-pdf="${id}"]`); eq((await inspectPdf(buf)).pages, 1, "re-download");
    page.__dialog = d => d.accept(); await page.click(`[data-h-del="${id}"]`); eq((await state()).h, before - 1, "deleted");
  });
  await test("history is capped at 100 newest entries", async () => {
    await page.evaluate(() => { const base = S.history[0]; S.history = Array.from({ length: 100 }, (_, i) => ({ ...base, id: "OLD-" + i })); });
    await page.evaluate(() => newPrescription()); await fillRx(mockRx(999), T["A4 clinic"], DOC); await download("#g-download");
    eq(await page.evaluate(() => [S.history.length, S.history[0].id === G.rxId, S.history.some(h => h.id === "OLD-99")]), [100, true, false]);
  });
  await test("history CSV export contains every row", async () => {
    await tab("history"); const { buf } = await download("#h-export"); eq(buf.toString().trim().split("\n").length, 101, "header + 100 rows");
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
    for (const t of ["history", "templates", "doctors", "medicines", "generate"]) await tab(t);
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
  await test("backup export -> delete all -> import restores everything", async () => {
    const before = await state();
    await tab("settings"); backup = (await download("#s-export")).buf;
    page.__dialog = d => d.type() === "prompt" ? d.accept("DELETE") : d.accept();
    await page.click("#s-wipe"); await page.waitForFunction(() => S.templates.length === 0);
    eq((await state()).t + (await state()).h, 0, "wiped");
    await page.setInputFiles("#s-file", { name: "b.json", mimeType: "application/json", buffer: backup });
    await page.waitForFunction(() => document.querySelector("#toast").textContent === "Backup restored"); await sleep(500);
    const after = await state(); eq([after.t, after.d, after.m, after.h, after.n], [before.t, before.d, before.m, before.h, before.n], "restored");
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
  await test("everything persists across a browser reload", async () => {
    const before = await state(); await page.reload(); await page.waitForFunction(() => typeof G !== "undefined" && G.rxId); eq(await state(), before);
  });

  console.log("\n13. Mobile");
  await test("no horizontal scrolling on any tab at 390 px", async () => {
    const desktop = page; const mctx = ctx;
    page = await newPage({ width: 390, height: 844 });
    await page.setInputFiles("#s-file", { name: "b.json", mimeType: "application/json", buffer: backup }).catch(() => {});
    await page.waitForFunction(() => document.querySelector("#toast").textContent === "Backup restored"); await sleep(500);
    const bad = [];
    for (const t of ["generate", "history", "templates", "doctors", "medicines", "settings"]) {
      await tab(t); await sleep(150); const w = await page.evaluate(() => document.documentElement.scrollWidth); if (w > 390) bad.push(`${t}:${w}`);
      await page.screenshot({ path: path.join(OUT, `mobile-${t}.png`) });
    }
    await tab("templates"); await page.click("[data-t-edit]"); await sleep(300);
    await page.screenshot({ path: path.join(OUT, "mobile-editor.png") }); const w = await page.evaluate(() => document.documentElement.scrollWidth); if (w > 390) bad.push(`editor:${w}`);
    eq(bad, [], "overflowing tabs"); await page.context().close(); page = desktop; ctx = mctx;
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
