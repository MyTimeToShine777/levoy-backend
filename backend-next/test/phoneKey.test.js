'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { phoneKey, splitByLeadNumbers } = require('../src/utils/phoneKey');

test('the same number in different formats gives one key', () => {
  const k = '9840848003';
  for (const n of ['9840848003', '09840848003', '+919840848003', '+91 98408 48003', '098408 48003', '(984) 084-8003', 91 + '9840848003']) {
    assert.equal(phoneKey(n), k, n);
  }
});

test('hidden, short or empty numbers have no key', () => {
  for (const n of [null, undefined, '', '   ', '123', '+1234', 'Private']) assert.equal(phoneKey(n), null, String(n));
});

test('only calls to lead numbers are kept, whatever the format', () => {
  const keys = new Set(['9840011111', '9840022222']);
  const events = [
    { phone_number: '+919840011111' },   // lead
    { phone_number: '09840022222' },     // lead
    { phone_number: '+919999900001' },   // personal
    { phone_number: '' },                // hidden
    { phone_number: '9840022222', direction: 'incoming' },
    {},
  ];
  const { kept, ignored } = splitByLeadNumbers(events, keys);
  assert.equal(kept.length, 3);
  assert.equal(ignored, 3);
  assert.deepEqual(kept.map(e => e.phone_number), ['+919840011111', '09840022222', '9840022222']);
});

test('no lead numbers means nothing is kept', () => {
  const { kept, ignored } = splitByLeadNumbers([{ phone_number: '9840011111' }], new Set());
  assert.equal(kept.length, 0);
  assert.equal(ignored, 1);
});
