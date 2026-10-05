'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { workingHours } = require('../src/utils/workHours');

const T = (h, m = 0, day = 3) => Date.UTC(2026, 9, day, h, m);        // 3 Oct 2026, UTC
const call = (start, seconds) => ({ start, seconds });

test('back-to-back calls are all working time', () => {
  const r = workingHours([call(T(9, 0), 300), call(T(9, 10), 600), call(T(9, 30), 60)], { idleGapMinutes: 15 });
  const d = r.days[0];
  assert.equal(d.calls, 3);
  assert.equal(d.idle_seconds, 0);
  assert.equal(d.working_seconds, (9 * 60 + 30 + 1 - 9 * 60) * 60);       // 09:00 -> 09:31
  assert.equal(d.talk_seconds, 960);
});

test('a gap longer than the threshold is a break, not work', () => {
  // 09:00-09:05, then 11:00-11:05 : a 115-minute gap
  const r = workingHours([call(T(9, 0), 300), call(T(11, 0), 300)], { idleGapMinutes: 15 });
  const d = r.days[0];
  assert.equal(d.idle_seconds, 115 * 60);
  assert.equal(d.working_seconds, 10 * 60);                                  // only the two calls
  assert.equal(d.breaks.length, 1);
  assert.equal(d.breaks[0].seconds, 115 * 60);
});

test('the threshold decides what counts as a break', () => {
  const calls = [call(T(9, 0), 300), call(T(9, 30), 300)];                   // 25-minute gap
  assert.equal(workingHours(calls, { idleGapMinutes: 15 }).days[0].idle_seconds, 25 * 60);
  assert.equal(workingHours(calls, { idleGapMinutes: 30 }).days[0].idle_seconds, 0);
});

test('overlapping calls never produce a negative gap', () => {
  const r = workingHours([call(T(9, 0), 1800), call(T(9, 10), 60)], { idleGapMinutes: 15 });
  assert.equal(r.days[0].idle_seconds, 0);
  assert.equal(r.days[0].working_seconds, 1800);
});

test('days are cut at local midnight', () => {
  // 18:40 UTC and 19:00 UTC are 00:10 and 00:30 the next day in India (+05:30)
  const calls = [call(T(18, 40), 60), call(T(19, 0), 60), call(T(12, 0), 60)];
  const ist = workingHours(calls, { tzOffsetMinutes: 330 });
  assert.deepEqual(ist.days.map(d => [d.date, d.calls]), [['2026-10-03', 1], ['2026-10-04', 2]]);
  const utc = workingHours(calls, { tzOffsetMinutes: 0 });
  assert.deepEqual(utc.days.map(d => [d.date, d.calls]), [['2026-10-03', 3]]);
});

test('totals add the days up', () => {
  const r = workingHours([call(T(9, 0), 600), call(T(9, 0, 4), 300), call(T(14, 0, 4), 300)], { idleGapMinutes: 15 });
  assert.equal(r.totals.days, 2);
  assert.equal(r.totals.calls, 3);
  assert.equal(r.totals.talk_seconds, 1200);
  assert.equal(r.totals.idle_seconds, r.days[1].idle_seconds);
});

test('no calls, no days', () => {
  const r = workingHours([]);
  assert.deepEqual(r.days, []);
  assert.equal(r.totals.working_seconds, 0);
});
