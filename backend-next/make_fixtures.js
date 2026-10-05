#!/usr/bin/env node
/**
 * Build the acceptance fixtures: a 27-column CSV and a real .xlsx, from the
 * same row data, so the two formats can be compared byte-for-byte on import.
 *
 * The 15 imported columns are filled. The 12 derived columns carry DELIBERATE
 * JUNK ("JUNK-SHOULD-BE-IGNORED") to prove the engine never imports them.
 *
 * The .xlsx gets a SECOND sheet ("Ignore Me") full of rows that must not be
 * imported, to prove sheet selection works.
 */
const XLSX = require('/root/callyzer-clone/backend-next/node_modules/xlsx');
const fs = require('fs');

const OUT = '/tmp';

// The user's real header spellings, verbatim from LEADS_SPEC.md.
const HEADERS = [
  'Segment', 'Lead Assigned Date', 'Call Attempted Date', 'Tellecaller Name',
  'Customer Name', 'Pharmacy Name', 'Locality / Area', 'Address',
  'Phone Number', 'Email Id', 'Lead Source', 'Followup Date', 'Call Done',
  'Call Status', 'Remarks',
  // ── the 12 derived columns: all junk, all must be ignored ──
  'Phone (Clean 10-digit)', 'Duplicate?', 'Follow-up (Clean Date)',
  'Active Lead? (1/0)', 'Follow-up Window', 'Days Since Last Call',
  'Priority Score', 'Tier', 'Next Best Action', 'Data Check',
  'Queue Key', 'Queue Rank',
];

const J = (n) => `JUNK-${n}`;

// Each phone is written as EXACTLY a 10-digit national number, with the
// 91-prefixed variants derived from it. Deriving rather than hand-typing is the
// point: a hand-typed '9198765000021' is 13 digits and would be flagged as
// unfixable for the wrong reason, quietly weakening the test.
const P = {
  ramesh: '9876543210',  // also written as '+91 98765 43210'
  sunita: '9876500021',  // also written as '91' + number (13-char form)
  imran:  '9876500038',
  deepak: '9876500045',
  nisha:  '9876500052',
  ajay:   '9876500061',
  farah:  '9876500079',
  gopal:  '9876500086',
  leela:  '9876500094',
  mohan:  '9876500102',
  bad:    '12345',       // deliberately unfixable
  noname: '9876500128',
  odd:    '9876500135',
};

// Follow-up dates are generated RELATIVE to today, not hardcoded. The engine
// decides Overdue / Due Today / This Week / Upcoming by comparing against the
// server's clock, so a hardcoded FUTURE_30 silently becomes "Overdue" the day
// that date passes and the assertions stop meaning anything. Every date here is
// expressed as an offset in days from today.
function iso(daysFromToday) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}
// Overdue by a wide margin: unmistakably in the past on any clock.
const LONG_AGO = iso(-900);
const FUTURE_30 = iso(30);     // Upcoming  (> this_week_days)
const FUTURE_5  = iso(5);      // This Week
const TODAY     = iso(0);      // Due Today
const PAST_30   = iso(-30);    // Overdue, but only just

// Each row: the 15 real values, then 12 junk markers.
// Note the OVERDUE follow-up date (2020-01-01) on the "Interested" row: that is
// what earns the +30 urgency bonus (80 + 30 = 110).
const ROWS = [
  ['Cold Call 1', iso(-20), iso(-19), 'Priya Nair', 'Ramesh Gupta', 'Gupta Medical', 'Andheri',
   '12 MG Road, Andheri', `+91 ${P.ramesh.slice(0,5)} ${P.ramesh.slice(5)}`, 'ramesh@example.com', 'Cold Call 1', FUTURE_30, 'Yes',
   'Interested', 'Wants a demo next week'],

  ['Cold Call 1', iso(-20), iso(-19), 'Priya Nair', 'Sunita Rao', 'Rao Pharmacy', 'Bandra',
   '4 Linking Road, Bandra', `91${P.sunita}`, 'sunita@example.com', 'Cold Call 1', LONG_AGO, 'Yes',
   'Interested', 'Follow-up lapsed long ago'],

  ['Social Media Campaign', iso(-18), iso(-17), 'Vikram Rao', 'Imran Sheikh', 'Sheikh Chemist', 'Kurla',
   '88 Nehru Road, Kurla', `+91${P.imran}`, 'imran@example.com', 'Social Media Campaign', PAST_30, 'No',
   'Not Answered', 'No answer, retry evening'],

  ['Cold Call 1', iso(-18), '', 'Vikram Rao', 'Deepak Joshi', 'Joshi Medical', 'Thane',
   '7 Station Road, Thane', P.deepak, 'deepak@example.com', 'Cold Call 1', '', 'No',
   '(Not called yet)', 'Never dialled'],

  ['WhatsApp Campaign', iso(-16), iso(-15), 'Ghost Caller', 'Nisha Pillai', 'Pillai Medicals', 'Colaba',
   '3 Apollo Street, Colaba', `+91 ${P.nisha.slice(0,5)} ${P.nisha.slice(5)}`, 'nisha@example.com', 'WhatsApp Campaign', FUTURE_5, 'Yes',
   'Under Consideration', 'Comparing two vendors'],

  ['Cold Call 1', iso(-16), iso(-14), 'Priya Nair', 'Ajay Menon', 'Gupta Medical', 'Andheri',
   '99 Veera Road, Andheri', `+91 ${P.ajay.slice(0,5)} ${P.ajay.slice(5)}`, 'ajay@example.com', 'Cold Call 1', FUTURE_30, 'Yes',
   'Converted', 'Signed — duplicate pharmacy+locality of row 1'],

  ['Cold Call 1', iso(-15), iso(-13), 'Sneha Iyer', 'Farah Khan', 'Khan Medical', 'Bandra',
   '22 Hill Road, Bandra', `+91 ${P.farah.slice(0,5)} ${P.farah.slice(5)}`, 'farah@example.com', 'Cold Call 1', TODAY, 'Yes',
   'Demo Done', 'Demo completed, sending payment link'],

  ['Social Media Campaign', iso(-15), iso(-13), 'Sneha Iyer', 'Gopal Verma', 'Verma Medical', 'Dadar',
   '5 Ranade Road, Dadar', P.gopal, '', 'Social Media Campaign', PAST_30, 'Yes',
   'Not Interested', 'Not interested, close the file'],

  ['Cold Call 1', iso(-14), '', 'Karthik Reddy', 'Leela Nair', 'Nair Medicals', 'Powai',
   '1 Central Avenue, Powai', `91 ${P.leela.slice(0,5)} ${P.leela.slice(5)}`, 'leela@example.com', 'Cold Call 1', '', 'No',
   'Call Back Later', 'Asked to call back next week'],

  ['Cold Call 1', iso(-14), iso(-12), 'Priya Nair', 'Mohan Das', 'Das Pharmacy', 'Thane',
   '8 Gokhale Road, Thane', `+91${P.mohan}`, 'mohan@example.com', 'Cold Call 1', FUTURE_30, 'Yes',
   'Interested', 'Wants pricing for 5 outlets'],

  // Duplicate of row 1 on BOTH keys (same cleaned phone AND same
  // Gupta Medical / Andheri). Because it reuses P.ramesh, it UPDATES row 1's
  // lead instead of creating a second one, and the surviving row carries THIS
  // row's remarks. That is the upsert rule working correctly: same cleaned
  // phone means the same person, so the later sheet line wins.
  ['Cold Call 1', iso(-11), iso(-9), 'Vikram Rao', 'Ramesh Gupta', 'Gupta Medical', 'Andheri',
   '12 MG Road, Andheri', `+91 ${P.ramesh.slice(0,5)} ${P.ramesh.slice(5)}`, 'ramesh@example.com', 'Cold Call 1', FUTURE_30, 'Yes',
   'Interested', 'Second copy of the same phone number'],

  // A distinct lead that duplicates on PHARMACY+LOCALITY alone but has its OWN
  // phone number, so it stays a separate row and its flags can be asserted.
  // The pharmacy/locality pair must match row 1 exactly to collide.
  ['Cold Call 1', iso(-9), iso(-8), 'Sneha Iyer', 'Anil Kulkarni', 'Gupta Medical', 'Andheri',
   '30 Hill Road, Andheri', `+91 ${'9876500166'}`, 'anil@example.com', 'Cold Call 1', PAST_30, 'Yes',
   'Under Consideration', 'Different pharmacy owner, same Gupta Medical / Andheri'],

  // Unfixable phone: 5 digits. Must be FLAGGED, never silently dropped.
  ['Cold Call 1', iso(-11), '', 'Vikram Rao', 'Bad Phone Row', 'Broken Pharma', 'Kurla',
   '2 Fail Road, Kurla', P.bad, 'badphone@example.com', 'Cold Call 1', '', 'No',
   'Not Answered', 'Phone is unusable'],

  // No name at all — must be skipped and reported.
  ['Cold Call 1', iso(-10), '', 'Priya Nair', '', '', 'Unknown',
   '', `+91${P.noname}`, 'noname@example.com', 'Cold Call 1', '', 'No',
   'Not Answered', 'Row has no name at all'],

  // Two rows added so every follow-up window the spec names is exercised:
  // 'This Week' (5 days out) and 'Due Today' (today).
  ['Cold Call 1', iso(-9), iso(-8), 'Karthik Reddy', 'This Week Rao', 'Rao Wellness', 'Powai',
   '2 Hillside, Powai', `+91 ${'9876500142'}`, 'thisweek@example.com', 'Cold Call 1', FUTURE_5, 'Yes',
   'Under Consideration', 'Wants a demo booked this week'],

  ['Cold Call 1', iso(-9), iso(-8), 'Karthik Reddy', 'Due Today Iyer', 'Iyer Medical', 'Dadar',
   '9 Ranade Road, Dadar', `+91 ${'9876500159'}`, 'duetoday@example.com', 'Cold Call 1', TODAY, 'Yes',
   'Demo Done', 'Demo today, chase the payment link'],

  // Status not in the config — must be reported, and score as not-called.
  ['Cold Call 1', iso(-10), iso(-9), 'Ghost Caller', 'Odd Status Row', 'Odd Pharma', 'Dadar',
   '6 Odd Road, Dadar', `+91 ${P.odd.slice(0,5)} ${P.odd.slice(5)}`, 'odd@example.com', 'Cold Call 1', FUTURE_5, 'Yes',
   'Telepathy Achieved', 'Status that is not in lead_status_rules'],
];

// Append the 12 junk derived values to every row.
const fullRows = ROWS.map(r => [...r, ...HEADERS.slice(15).map((_, i) => J(i))]);

// ─── Self-check ───
// The engine's phone rule, restated here so a fixture that cannot possibly
// pass is caught at GENERATION time rather than showing up as a mystery
// "not a usable number" warning hours later. Exactly one row is meant to be
// unfixable (P.bad, 5 digits); every other phone must clean to 10 digits.
function cleanPhone(raw) {
  const d = String(raw).replace(/\D/g, '');
  const stripped = (d.length === 12 && d.startsWith('91')) ? d.slice(2) : d;
  return /^\d{10}$/.test(stripped) ? stripped : null;
}
// Column indexes within a ROWS entry (the 15 imported columns).
const IDX_PHONE = 8, IDX_REMARKS = 14;
const expectedUnfixable = new Set(ROWS.filter(r => cleanPhone(r[IDX_PHONE]) === null).map(r => r[IDX_REMARKS]));
const bad = fullRows.filter(r => (cleanPhone(r[IDX_PHONE]) === null) !== expectedUnfixable.has(r[IDX_REMARKS]));
if (bad.length) {
  console.error('FIXTURE ERROR: these rows do not match the intended phone cleanliness:');
  for (const r of bad) console.error('  remarks=%s phone=%s cleaned=%s', r[IDX_REMARKS], r[IDX_PHONE], cleanPhone(r[IDX_PHONE]));
  process.exit(1);
}
console.log('self-check: %d rows, %d unfixable by design (%s)',
  fullRows.length, expectedUnfixable.size, [...expectedUnfixable].join(', '));

// ── CSV ──
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const csv = [HEADERS, ...fullRows].map(r => r.map(csvCell).join(',')).join('\n') + '\n';
fs.writeFileSync(OUT + '/leads_27col.csv', csv);

// ── XLSX ──
// Two sheets. Only the FIRST is ever imported; the second exists purely to
// prove sheet selection ignores it.
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...fullRows]), 'Leads (1)');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['SEGMENT_ONLY_COLUMN', 'THIS SHEET MUST NOT BE IMPORTED'],
  ['Bogus Segment', 'Bogus Row'],
  ['Bogus Segment 2', 'Bogus Row 2'],
]), 'Ignore Me');
XLSX.writeFile(wb, OUT + '/leads_27col.xlsx', { bookType: 'xlsx' });

console.log('wrote', OUT + '/leads_27col.csv  and', OUT + '/leads_27col.xlsx');
console.log('columns:', HEADERS.length, '(15 imported + 12 derived)');
console.log('data rows:', fullRows.length);
console.log('xlsx sheets: Leads (1), Ignore Me');
