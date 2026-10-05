'use strict';

// Dev tool: compares the app's phone cleaner with the "Phone (Clean 10-digit)" column
// of an operations workbook. Usage: node scripts/sheet-phone-check.js <file.xlsx> [sheet]
// Prints shape counts and a few mismatches (digits only, never names).

const fs = require('fs');
const T = require('../src/utils/tabularFile');
const { cleanPhone } = require('../src/utils/phone');

const file = process.argv[2];
const sheet = process.argv[3] || 'Leads (1)';
if (!file) { console.error('usage: node scripts/sheet-phone-check.js <file.xlsx> [sheet]'); process.exit(1); }

// Read exactly as the importer does (raw values: Excel numbers stay numbers).
const rows = T.readImportFile(fs.readFileSync(file), file, sheet).matrix;
const head = rows[0].map(T.cellToString);
const iRaw = head.indexOf('Phone Number');
const iClean = head.indexOf('Phone (Clean 10-digit)');

const shapes = new Map();
let total = 0, agree = 0;
const bad = [];
for (const r of rows.slice(1)) {
  const raw = r[iRaw] ?? '';
  const sheetClean = String(r[iClean] ?? '').trim();
  if (raw === '' && !sheetClean) continue;
  total++;
  const digits = String(raw).replace(/\D/g, '');
  const shape = `${digits.length}d${digits.startsWith('0') ? ' lead0' : ''}`;
  const ours = cleanPhone(raw) || '';
  const key = `${shape} -> sheet:${sheetClean ? 'ok' : 'blank'} app:${ours ? 'ok' : 'blank'}`;
  shapes.set(key, (shapes.get(key) || 0) + 1);
  if (sheetClean === ours) agree++; else if (bad.length < 8) bad.push({ rawDigits: digits, sheetClean, ours });
}
console.log(`rows with a phone: ${total}, agree: ${agree}, differ: ${total - agree}`);
for (const [k, v] of [...shapes.entries()].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k);
console.log('sample mismatches:', JSON.stringify(bad));
