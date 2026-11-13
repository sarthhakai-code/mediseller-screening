#!/usr/bin/env node
/*
 * Generates fictional sample letterheads for testing Rx Studio, plus the field layout for each
 * (what an admin would map by dragging boxes in the Templates tab).
 *
 *   cd tests && npm install && cd .. && node tools/make-sample-letterheads.js
 *
 * Writes samples/letterheads/*.pdf (and a PNG "scan" of one design when pdftoppm is installed)
 * and samples/letterheads/layouts.json. All clinic names, doctors and addresses are made up.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { jsPDF } = require(path.join(__dirname, "..", "tests", "node_modules", "jspdf"));

const OUT = path.join(__dirname, "..", "samples", "letterheads");
fs.mkdirSync(OUT, { recursive: true });
const layouts = {};

/* field helper: positions in points, converted to page fractions */
function field(W, H, key, x, y, w, h, opts = {}) {
  const r = v => Math.round(v * 10000) / 10000;
  return { key, x: r(x / W), y: r(y / H), w: r(w / W), h: r(h / H), size: 10, bold: false, align: "left", label: false, color: "#111111", rxSymbol: false, ...opts };
}
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
function line(d, x1, y1, x2, y2, color = "#9AA5B5", wdt = 0.6) { d.setDrawColor(...hex(color)); d.setLineWidth(wdt); d.line(x1, y1, x2, y2); }
function label(d, txt, x, y, size = 9, color = "#475569", style = "normal", font = "helvetica") { d.setFont(font, style); d.setFontSize(size); d.setTextColor(...hex(color)); d.text(txt, x, y); }

/* ---------- 1. CareFirst Online Clinic: A4, coloured header band, printed patient labels ---------- */
{
  const d = new jsPDF({ unit: "pt", format: "a4" }), W = 595.28, H = 841.89, teal = "#0F766E";
  d.setFillColor(...hex(teal)); d.rect(0, 0, W, 104, "F");
  label(d, "CareFirst Online Clinic", 40, 50, 24, "#FFFFFF", "bold");
  label(d, "Teleconsultation  ·  e-Pharmacy partner network", 40, 70, 10, "#CCFBF1");
  d.setFontSize(9); d.setTextColor(255, 255, 255);
  ["+91 22 4000 1234", "consult@carefirst-clinic.example", "Andheri East, Mumbai 400069"].forEach((t, i) => d.text(t, W - 40, 40 + i * 14, { align: "right" }));
  label(d, "Patient:", 40, 140); line(d, 84, 143, 330, 143);
  label(d, "Age/Sex:", 342, 140); line(d, 384, 143, 462, 143);
  label(d, "Date:", 472, 140); line(d, 498, 143, 556, 143);
  label(d, "Mobile:", 40, 168); line(d, 84, 171, 250, 171);
  label(d, "Rx No:", 342, 168); line(d, 376, 171, 556, 171);
  label(d, "Rx", 40, 222, 26, teal, "bold", "times");
  line(d, 40, 760, W - 40, 760, "#CBD5E1", 0.8);
  label(d, "Valid only with the doctor's signature. Issued after a teleconsultation as per the Telemedicine Practice Guidelines, 2020.", W / 2 - 230, 778, 7.5, "#64748B");
  d.setFillColor(...hex(teal)); d.rect(0, H - 14, W, 14, "F");
  d.save(path.join(OUT, "carefirst-a4.pdf"));
  layouts["carefirst-a4"] = { file: "carefirst-a4.pdf", note: "Patient labels are pre-printed, so value labels are off", fields: [
    field(W, H, "patient_name", 88, 128, 240, 16, { size: 11, bold: true }),
    field(W, H, "age_gender", 388, 128, 72, 16, { size: 10.5 }),
    field(W, H, "date", 500, 128, 56, 16, { size: 10, align: "right" }),
    field(W, H, "patient_phone", 88, 156, 160, 16),
    field(W, H, "rx_id", 380, 156, 176, 16, { size: 9.5 }),
    field(W, H, "consult_mode", 40, 186, 250, 14, { size: 9, label: true }),
    field(W, H, "medicines", 70, 236, 486, 330, { size: 10.5 }),
    field(W, H, "investigations", 40, 578, 516, 44, { label: true }),
    field(W, H, "advice", 40, 626, 516, 48, { label: true }),
    field(W, H, "follow_up", 40, 680, 300, 16, { bold: true, label: true }),
    field(W, H, "stamp", 262, 672, 96, 72, { align: "center" }),
    field(W, H, "signature", 380, 662, 176, 44, { align: "center" }),
    field(W, H, "doctor_block", 336, 708, 220, 48, { size: 9, align: "right" }),
  ] };
}

/* ---------- 2. Dr. Kavita Mehta, Skin & Hair: A5 personal pad, doctor details pre-printed ---------- */
{
  const d = new jsPDF({ unit: "pt", format: "a5" }), W = 419.53, H = 595.28, plum = "#6B2142";
  d.setDrawColor(...hex(plum)); d.setLineWidth(1); d.rect(12, 12, W - 24, H - 24);
  d.setFont("times", "bold"); d.setFontSize(19); d.setTextColor(...hex(plum)); d.text("Dr. Kavita Mehta", W / 2, 42, { align: "center" });
  d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(60, 60, 60);
  d.text("MBBS, MD (Dermatology, Venereology & Leprosy)  ·  Reg. No. MMC 2011/04/1234", W / 2, 56, { align: "center" });
  d.text("Skin & Hair Clinic  ·  Koregaon Park, Pune 411001  ·  +91 20 6600 4321", W / 2, 67, { align: "center" });
  line(d, 24, 76, W - 24, 76, plum, 1.2); line(d, 24, 79, W - 24, 79, plum, 0.4);
  line(d, 24, 540, W - 24, 540, "#BBBBBB", 0.5);
  label(d, "Clinic hours: Mon–Sat 10 am – 7 pm  ·  Online consultations on appointment", 24, 552, 7, "#666666");
  label(d, "Signature", W - 80, 535, 7, "#888888");
  d.save(path.join(OUT, "mehta-skin-a5.pdf"));
  layouts["mehta-skin-a5"] = { file: "mehta-skin-a5.pdf", note: "Doctor name and registration are pre-printed in the header, so there is no doctor block", fields: [
    field(W, H, "patient_name", 24, 88, 230, 14, { size: 10, bold: true, label: true }),
    field(W, H, "age_gender", 258, 88, 70, 14, { size: 9.5, label: true }),
    field(W, H, "date", 330, 88, 66, 14, { size: 9.5, align: "right" }),
    field(W, H, "rx_id", 24, 104, 200, 12, { size: 8, label: true }),
    field(W, H, "patient_phone", 258, 104, 138, 12, { size: 8, label: true, align: "right" }),
    field(W, H, "medicines", 24, 126, 372, 262, { size: 9.5, rxSymbol: true }),
    field(W, H, "investigations", 24, 394, 372, 38, { size: 9, label: true }),
    field(W, H, "advice", 24, 436, 372, 44, { size: 9, label: true }),
    field(W, H, "follow_up", 24, 486, 200, 14, { size: 9, bold: true, label: true }),
    field(W, H, "signature", 268, 488, 128, 40, { align: "right" }),
  ] };
}

/* ---------- 3. HealthBridge e-Consult: US Letter, vertical sidebar ---------- */
{
  const d = new jsPDF({ unit: "pt", format: "letter" }), W = 612, H = 792, navy = "#1E3A8A", amber = "#F59E0B";
  d.setFillColor(...hex(navy)); d.rect(0, 0, 64, H, "F");
  d.setFillColor(...hex(amber)); d.circle(32, 48, 18, "F");
  label(d, "HB", 23, 53, 13, "#FFFFFF", "bold");
  d.setFont("helvetica", "bold"); d.setFontSize(10); d.setTextColor(255, 255, 255); d.text("HEALTHBRIDGE  E-CONSULT", 38, 420, { angle: 90 });
  label(d, "HealthBridge e-Consult", 88, 52, 22, navy, "bold");
  label(d, "Digital prescription  ·  Pan-India teleconsultations", 88, 70, 9.5, "#64748B");
  d.setFontSize(8.5); d.setTextColor(100, 116, 139);
  ["help@healthbridge.example", "1800 000 0000 (toll free)", "Sector 44, Gurugram 122003"].forEach((t, i) => d.text(t, W - 36, 40 + i * 13, { align: "right" }));
  line(d, 88, 88, W - 36, 88, navy, 1.5);
  d.setFillColor(241, 245, 249); d.roundedRect(88, 100, W - 124, 52, 6, 6, "F");
  line(d, 88, 740, W - 36, 740, "#CBD5E1", 0.8);
  label(d, "Scan-free verification: quote the Rx ID to the pharmacy. Not valid for Schedule X drugs.", 88, 756, 7.5, "#64748B");
  d.save(path.join(OUT, "healthbridge-letter.pdf"));
  layouts["healthbridge-letter"] = { file: "healthbridge-letter.pdf", note: "Patient details sit inside the grey panel; labels printed by the tool", fields: [
    field(W, H, "patient_name", 98, 108, 260, 16, { size: 11, bold: true, label: true }),
    field(W, H, "age_gender", 370, 108, 100, 16, { label: true }),
    field(W, H, "date", 476, 108, 90, 16, { align: "right" }),
    field(W, H, "patient_phone", 98, 128, 200, 14, { size: 9, label: true }),
    field(W, H, "consult_mode", 300, 128, 120, 14, { size: 9, label: true }),
    field(W, H, "rx_id", 420, 128, 146, 14, { size: 9, align: "right" }),
    field(W, H, "medicines", 88, 170, 488, 330, { size: 10.5, rxSymbol: true }),
    field(W, H, "investigations", 88, 512, 488, 46, { label: true }),
    field(W, H, "advice", 88, 562, 488, 52, { label: true }),
    field(W, H, "follow_up", 88, 620, 280, 16, { bold: true, label: true }),
    field(W, H, "signature", 400, 626, 176, 44, { align: "right" }),
    field(W, H, "doctor_block", 330, 674, 246, 56, { size: 9, align: "right" }),
  ] };
}

/* ---------- 4. Sunrise Multispeciality: A4, delivered as a PNG "scan" ---------- */
{
  const d = new jsPDF({ unit: "pt", format: "a4" }), W = 595.28, H = 841.89, red = "#B91C1C";
  label(d, "SUNRISE", 40, 54, 26, red, "bold"); label(d, "MULTISPECIALITY CLINIC", 40, 72, 11, "#1F2937", "bold");
  d.setFontSize(8.5); d.setTextColor(75, 85, 99);
  ["NABH-aligned teleconsultation unit", "Banjara Hills, Hyderabad 500034", "+91 40 2300 5555"].forEach((t, i) => d.text(t, W - 40, 44 + i * 13, { align: "right" }));
  d.setFillColor(...hex(red)); d.rect(40, 86, W - 80, 3, "F");
  line(d, 40, 790, W - 40, 790, "#D1D5DB", 0.6);
  label(d, "Prescription generated digitally after an online consultation.", 40, 804, 7.5, "#6B7280");
  const pdfPath = path.join(OUT, "_sunrise-a4.pdf"); d.save(pdfPath);
  layouts["sunrise-a4-scan"] = { file: "sunrise-a4-scan.png", note: "Image template (PNG) to test the scan/photo upload path", fields: [
    field(W, H, "patient_name", 40, 104, 300, 16, { size: 11, bold: true, label: true }),
    field(W, H, "age_gender", 350, 104, 100, 16, { label: true }),
    field(W, H, "date", 456, 104, 100, 16, { align: "right", label: true }),
    field(W, H, "patient_phone", 40, 124, 220, 14, { size: 9, label: true }),
    field(W, H, "rx_id", 356, 124, 200, 14, { size: 9, align: "right", label: true }),
    field(W, H, "medicines", 40, 156, 516, 360, { size: 10.5, rxSymbol: true }),
    field(W, H, "investigations", 40, 528, 516, 46, { label: true }),
    field(W, H, "advice", 40, 578, 516, 52, { label: true }),
    field(W, H, "follow_up", 40, 636, 300, 16, { bold: true, label: true }),
    field(W, H, "stamp", 290, 650, 90, 70),
    field(W, H, "signature", 390, 654, 166, 44, { align: "right" }),
    field(W, H, "doctor_block", 316, 702, 240, 54, { size: 9, align: "right" }),
  ] };
  try {
    execFileSync("pdftoppm", ["-r", "150", "-png", "-singlefile", pdfPath, path.join(OUT, "sunrise-a4-scan")]);
    fs.unlinkSync(pdfPath);
  } catch {
    console.warn("pdftoppm not found: kept the Sunrise design as _sunrise-a4.pdf instead of a PNG scan");
    layouts["sunrise-a4-scan"].file = "_sunrise-a4.pdf";
  }
}

fs.writeFileSync(path.join(OUT, "layouts.json"), JSON.stringify(layouts, null, 2) + "\n");
console.log("Wrote", fs.readdirSync(OUT).join(", "));
