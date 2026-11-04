'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tzMinutes, startOfLocalDay, DAY } = require('../src/utils/dayBounds');

test('the viewer time zone is read from ?tz= and anything odd means UTC', () => {
  assert.equal(tzMinutes({ tz: '330' }), 330);
  assert.equal(tzMinutes({ tz: '-300' }), -300);
  for (const q of [{}, null, { tz: 'abc' }, { tz: '5000' }]) assert.equal(tzMinutes(q), 0);
});

test('"today" starts at the viewer midnight, not the server midnight', () => {
  // 2026-11-03 22:00 UTC is already 03:30 on 4 Nov in India, so the Indian day began at 2026-11-03 18:30 UTC.
  const now = Date.UTC(2026, 10, 3, 22, 0);
  assert.equal(new Date(startOfLocalDay(now, 330)).toISOString(), '2026-11-03T18:30:00.000Z');
  // the same instant for someone on UTC is still 3 Nov
  assert.equal(new Date(startOfLocalDay(now, 0)).toISOString(), '2026-11-03T00:00:00.000Z');
  // west of UTC: 22:00 UTC is 17:00 on 3 Nov in New York (UTC-5), whose day began 05:00 UTC
  assert.equal(new Date(startOfLocalDay(now, -300)).toISOString(), '2026-11-03T05:00:00.000Z');
});

test('a day is exactly 24 hours long', () => {
  const s = startOfLocalDay(Date.UTC(2026, 5, 1, 12), 330);
  assert.equal(startOfLocalDay(s + DAY + 1000, 330) - s, DAY);
});
