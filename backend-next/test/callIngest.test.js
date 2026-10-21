'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCallStatus, dropDuplicates, leadsTouchedBy } = require('../src/utils/callIngest');

test('a call that lasted 0 seconds is never "connected"', () => {
  assert.equal(normalizeCallStatus('connected', 'outgoing', 0), 'unanswered');
  assert.equal(normalizeCallStatus('connected', 'incoming', 0), 'missed');
  assert.equal(normalizeCallStatus(undefined, 'outgoing', 0), 'unanswered');
});

test('a call with talk time stays connected, and explicit statuses are kept', () => {
  assert.equal(normalizeCallStatus('connected', 'outgoing', 45), 'connected');
  assert.equal(normalizeCallStatus(undefined, 'incoming', 12), 'connected');
  assert.equal(normalizeCallStatus('rejected', 'incoming', 0), 'rejected');
  assert.equal(normalizeCallStatus('missed', 'incoming', 0), 'missed');
  assert.equal(normalizeCallStatus('unanswered', 'outgoing', 0), 'unanswered');
});

const ev = (phone, at, over = {}) => ({ phone_number: phone, direction: 'outgoing', duration_seconds: 30, timestamp: at, ...over });

test('the same call uploaded twice is stored once, whatever the number format', () => {
  const stored = [{ phone_number: '+917845860720', direction: 'outgoing', duration_seconds: 30, timestamp: '2026-10-20T09:24:00.000Z' }];
  const { kept, duplicates } = dropDuplicates([ev('7845860720', '2026-10-20T09:24:02.000Z')], stored);
  assert.equal(kept.length, 0);
  assert.equal(duplicates, 1);
});

test('a repeat inside one upload is dropped too', () => {
  const { kept, duplicates } = dropDuplicates([ev('+917845860720', '2026-10-20T09:24:00Z'), ev('07845860720', '2026-10-20T09:24:00Z')], []);
  assert.equal(kept.length, 1);
  assert.equal(duplicates, 1);
});

test('different time, length, direction or person is a different call', () => {
  const stored = [{ phone_key: '7845860720', direction: 'outgoing', duration_seconds: 30, timestamp: '2026-10-20T09:24:00.000Z' }];
  const events = [
    ev('7845860720', '2026-10-20T09:30:00Z'),                          // later
    ev('7845860720', '2026-10-20T09:24:01Z', { duration_seconds: 31 }), // different length
    ev('7845860720', '2026-10-20T09:24:01Z', { direction: 'incoming' }),
    ev('9840848003', '2026-10-20T09:24:01Z'),                          // someone else
  ];
  const { kept, duplicates } = dropDuplicates(events, stored);
  assert.equal(kept.length, 4);
  assert.equal(duplicates, 0);
});

test('numbers with no usable key are never treated as duplicates of each other', () => {
  const { kept } = dropDuplicates([ev('', '2026-10-20T09:24:00Z'), ev('', '2026-10-20T09:24:00Z')], []);
  assert.equal(kept.length, 2);
});

test('a call we answered or spoke on marks the lead "Called"; an unanswered call we placed marks it "Not Answered"', () => {
  const m = leadsTouchedBy([
    { phone_number: '+917845860720', direction: 'outgoing', duration_seconds: 45, timestamp: '2026-10-21T09:00:00Z' },
    { phone_number: '9840848003', direction: 'outgoing', duration_seconds: 0, timestamp: '2026-10-21T09:05:00Z' },
  ]);
  assert.equal(m.get('7845860720').outcome, 'Called');
  assert.equal(m.get('9840848003').outcome, 'Not Answered');
});

test('speaking at any point wins over an earlier unanswered try, and the latest call time is kept', () => {
  const m = leadsTouchedBy([
    { phone_number: '7845860720', direction: 'outgoing', duration_seconds: 0, timestamp: '2026-10-21T09:00:00Z' },
    { phone_number: '7845860720', direction: 'outgoing', duration_seconds: 30, timestamp: '2026-10-21T10:00:00Z' },
    { phone_number: '7845860720', direction: 'outgoing', duration_seconds: 0, timestamp: '2026-10-21T11:00:00Z' },
  ]);
  const s = m.get('7845860720');
  assert.equal(s.outcome, 'Called');
  assert.equal(s.latest, Date.parse('2026-10-21T11:00:00Z'));
});

test('an incoming call nobody answered contacts nobody, and hidden numbers are skipped', () => {
  const m = leadsTouchedBy([
    { phone_number: '7845860720', direction: 'incoming', duration_seconds: 0, timestamp: '2026-10-21T09:00:00Z' },
    { phone_number: '', direction: 'outgoing', duration_seconds: 10, timestamp: '2026-10-21T09:00:00Z' },
  ]);
  assert.equal(m.size, 0);
});
