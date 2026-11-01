// Renders every documents/**/MS-*.html to an A4 PDF in documents/pdf/.
// Usage: node documents/build-pdf.js [--png]   (--png also writes page previews)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const outDir = path.join(root, 'pdf');
const wantPng = process.argv.includes('--png');

function findDocs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return ['assets', 'pdf'].includes(e.name) ? [] : findDocs(p);
    return /^MS-.*\.html$/.test(e.name) ? [p] : [];
  });
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  for (const file of findDocs(root)) {
    await page.goto('file://' + file, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const base = path.basename(file, '.html');
    await page.pdf({ path: path.join(outDir, base + '.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
    if (wantPng) {
      await page.emulateMedia({ media: 'print' });
      await page.screenshot({ path: path.join(outDir, base + '.png'), fullPage: true });
      await page.emulateMedia({ media: null });
    }
    console.log('built', base);
  }
  await browser.close();
})();
