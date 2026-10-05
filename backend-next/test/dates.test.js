'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLeadDate, toDateStr, detectDateOrder, normaliseDateCell } = require('../src/utils/dates');

const iso = (v, order) => toDateStr(parseLeadDate(v, order));

test('slash dates follow the chosen order', () => {
  assert.equal(iso('10/6/2026', 'dmy'), '2026-06-10');
  assert.equal(iso('10/6/2026', 'mdy'), '2026-10-06');      // what the operations sheet means
  assert.equal(iso('10/06/2026 10.30 AM', 'mdy'), '2026-10-06');   // trailing time is ignored
});

test('unambiguous and non-slash forms ignore the order', () => {
  assert.equal(iso('28/09/2026', 'mdy'), null);              // 28 is not a month in mdy
  assert.equal(iso('09/28/2026', 'mdy'), '2026-09-28');
  assert.equal(iso('2026-10-04', 'mdy'), '2026-10-04');
  assert.equal(iso('06-Oct-2026'), '2026-10-06');
});

test('a file settles the order itself when any value is decisive', () => {
  assert.equal(detectDateOrder(['10/6/2026', '28/09/2026']).order, 'dmy');
  assert.equal(detectDateOrder(['10/6/2026', '09/28/2026']).order, 'mdy');
  const amb = detectDateOrder(['10/6/2026', '10/06/2026 10.30 AM', '2026-10-04']);
  assert.equal(amb.order, null);
  assert.equal(amb.ambiguous, 2);
  assert.equal(detectDateOrder(['1/1/2026']).ambiguous, 0);   // same both ways: not ambiguous
});

test('normaliseDateCell rewrites slash dates as ISO and leaves the rest alone', () => {
  assert.equal(normaliseDateCell('10/6/2026  11.00 AM', 'mdy'), '2026-10-06');
  assert.equal(normaliseDateCell('2026-10-04', 'mdy'), '2026-10-04');
  assert.equal(normaliseDateCell('notadate', 'mdy'), 'notadate');
  assert.equal(normaliseDateCell(null, 'mdy'), null);
});
