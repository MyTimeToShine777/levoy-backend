#!/usr/bin/env node
/*
 * Compare two characterization runs.
 *
 *   node scripts/compare.js <legacy.json> <current.json> [--superset] [--expected test/baseline/expected-diffs.json]
 *
 * Default: byte-for-byte identical (after the harness's normalisation).
 * --superset: every key/value in the legacy response must be present and equal
 *   in the current one, but the current one may ADD fields (e.g. `permissions`
 *   on login). Arrays must keep their length.
 * --expected: a JSON object { "<call key>": "<reason>" } of deliberate deviations
 *   (bug fixes). They are listed, never silently ignored, and a listed key that
 *   turns out to be identical is reported so stale entries get removed.
 */
const fs = require('fs');

const argv = process.argv.slice(2);
const expectedFile = argv.includes('--expected') ? argv[argv.indexOf('--expected') + 1] : null;
const files = argv.filter(a => !a.startsWith('--') && a.endsWith('.json') && a !== expectedFile);
const superset = argv.includes('--superset');
const expected = expectedFile && fs.existsSync(expectedFile) ? JSON.parse(fs.readFileSync(expectedFile, 'utf8')) : {};

const a = JSON.parse(fs.readFileSync(files[0], 'utf8'));
const b = JSON.parse(fs.readFileSync(files[1], 'utf8'));

function isSubset(x, y) {
  if (x === null || typeof x !== 'object') return x === y;
  if (y === null || typeof y !== 'object') return false;
  if (Array.isArray(x)) {
    if (!Array.isArray(y) || x.length !== y.length) return false;
    return x.every((v, i) => isSubset(v, y[i]));
  }
  return Object.keys(x).every(k => k in y && isSubset(x[k], y[k]));
}

const bm = new Map(b.map(r => [r.key, r]));
let diffs = 0, expectedHit = 0;
const unusedExpected = new Set(Object.keys(expected));

for (const ra of a) {
  const rb = bm.get(ra.key);
  if (!rb) { console.log('MISSING in current:', ra.key); diffs++; continue; }
  const same = superset
    ? ra.status === rb.status && isSubset(ra.body, rb.body)
    : JSON.stringify(ra) === JSON.stringify(rb);
  if (same) continue;
  if (expected[ra.key]) {
    expectedHit++; unusedExpected.delete(ra.key);
    console.log(`EXPECTED ${ra.key} — ${expected[ra.key]}`);
    continue;
  }
  diffs++;
  console.log('DIFF', ra.key);
  console.log('  legacy :', JSON.stringify(ra).slice(0, 600));
  console.log('  current:', JSON.stringify(rb).slice(0, 600));
}
for (const k of unusedExpected) console.log(`NOTE: expected-diff entry '${k}' did not differ — remove it`);

console.log(diffs === 0
  ? `OK (${a.length} calls compared, ${expectedHit} expected deviation(s)${superset ? ', superset mode' : ''})`
  : `${diffs} UNEXPECTED difference(s)`);
process.exit(diffs === 0 ? 0 : 1);
