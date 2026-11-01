import test from 'node:test';
import assert from 'node:assert/strict';
import { toE164, makeRef, isEmail } from '../../server/util.js';
import { parseLead, whatsappText, sheetRow } from '../../server/leads.js';

test('toE164 normalises common international formats', () => {
  assert.equal(toE164('0803 123 4567', 'NG'), '+2348031234567');       // Nigeria, trunk zero
  assert.equal(toE164('+254 712 345678', 'KE'), '+254712345678');      // already international
  assert.equal(toE164('00 7 916 123-45-67', 'RU'), '+79161234567');    // 00 prefix
  assert.equal(toE164('84 912 345 678', 'VN'), '+84912345678');        // code typed without +
  assert.equal(toE164('912345678', 'VN'), '+84912345678');
  assert.equal(toE164('98765 43210', 'IN'), '+919876543210');
  assert.equal(toE164('123', 'IN'), '');                               // too short
  assert.equal(toE164('9876543210', ''), '');                          // no country, no +
});

test('makeRef uses prefix, IST date and unambiguous characters', () => {
  const ref = makeRef('MS', new Date('2026-11-01T20:00:00Z')); // 01:30 IST on 2 Nov
  assert.match(ref, /^MS-261102-[A-HJ-NP-Z2-9]{4}$/);
});

test('isEmail', () => {
  assert.ok(isEmail('a.b@clinic.co.ke'));
  assert.ok(!isEmail('a@b'));
});

const base = { name: 'Amina Okafor', phone: '0803 123 4567', country: 'NG', consent: 'true', channel: 'whatsapp', source: 'checkout', buyer_type: 'Patient',
  items: JSON.stringify([{ sku: 'MS-gleevec', name: 'Imatinib Mesylate 400 mg', qty: 3, unit: 'Strips', note: 'urgent' }]) };

test('parseLead accepts a valid checkout', () => {
  const r = parseLead(base);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.lead.phone_e164, '+2348031234567');
  assert.equal(r.lead.country, 'Nigeria');
  assert.equal(r.items[0].qty, 3);
});

test('parseLead rejects missing consent, empty cart, email channel without email, call without slot', () => {
  assert.ok(parseLead({ ...base, consent: '' }).errors.consent);
  assert.ok(parseLead({ ...base, items: '[]' }).errors.items);
  assert.ok(parseLead({ ...base, channel: 'email' }).errors.email);
  assert.ok(parseLead({ ...base, channel: 'call' }).errors.call_slot);
  assert.ok(parseLead({ ...base, phone: '12' }).errors.phone);
  assert.ok(parseLead({ ...base, country: 'XX' }).errors.country);
});

test('parseLead clamps quantities and unknown enums', () => {
  const r = parseLead({ ...base, buyer_type: 'Hacker', channel: 'fax', items: JSON.stringify([{ name: 'X', qty: -5 }, { name: 'Y', qty: 1e9 }]) });
  assert.equal(r.lead.buyer_type, 'Other');
  assert.equal(r.lead.contact_channel, 'rfq');
  assert.deepEqual(r.items.map((i) => i.qty), [1, 100000]);
});

test('whatsappText and sheetRow carry the reference and items', () => {
  const r = parseLead(base);
  const site = { name: 'MediSeller' };
  const t = whatsappText(site, 'MS-261101-ABCD', r.lead, r.items);
  assert.match(t, /MS-261101-ABCD/);
  assert.match(t, /Imatinib Mesylate 400 mg — 3 Strips \(urgent\)/);
  const row = sheetRow(site, { ref: 'MS-261101-ABCD' }, r.lead, r.items, ['https://x/rx']);
  assert.equal(row.length, 19);
  assert.equal(row[0], 'MS-261101-ABCD');
  assert.equal(row[13], 'https://x/rx');
});
