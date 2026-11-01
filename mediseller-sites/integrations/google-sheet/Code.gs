/**
 * MediSeller Leads — Google Sheet receiver (Apps Script web app)
 *
 * Setup (5 minutes):
 *  1. Create a NEW Google Sheet named "MediSeller Leads".
 *  2. Extensions → Apps Script → replace everything with this file → Save.
 *  3. Project Settings → Script properties → add  TOKEN = <a long random string>.
 *  4. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
 *  5. Copy the web-app URL into Cloudflare Pages env var SHEET_WEBHOOK_URL,
 *     and the same TOKEN into SHEET_WEBHOOK_TOKEN.
 * One sheet can receive leads from every site — the "Site" column tells them apart.
 */
const HEADERS = ['Ref', 'Date (IST)', 'Site', 'Source', 'Channel', 'Name', 'Phone (E.164)', 'Email', 'Country', 'City',
  'Buyer type', 'Company', 'Items', 'Prescription', 'Message', 'Call slot', 'UTM', 'Status', 'Assigned to'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse(e.postData.contents || '{}');
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || body.token !== token) return out({ ok: false, error: 'unauthorised' });
    const row = body.row;
    if (!Array.isArray(row) || !row[0]) return out({ ok: false, error: 'bad row' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('Leads') || ss.insertSheet('Leads');
    if (sh.getLastRow() === 0) {
      sh.appendRow(HEADERS);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');
      const status = SpreadsheetApp.newDataValidation().requireValueInList(['New', 'Contacted', 'Quoted', 'Won', 'Lost', 'Spam']).build();
      sh.getRange(2, 18, 5000, 1).setDataValidation(status);
    }
    // idempotent: skip if this Ref already exists (resync safety)
    const refs = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat() : [];
    if (refs.indexOf(row[0]) === -1) {
      const safe = row.map((v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v)); // block formula injection
      sh.appendRow(safe.slice(0, HEADERS.length));
    }
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
