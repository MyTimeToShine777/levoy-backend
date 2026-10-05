'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanPhone } = require('../src/utils/phone');

// Every case below is a shape found in the real operations sheet; the expected value is
// what that sheet's own "Phone (Clean 10-digit)" column holds.
test('plain 10 digits, with and without spaces', () => {
  assert.equal(cleanPhone('9876543210'), '9876543210');
  assert.equal(cleanPhone('98765 43210'), '9876543210');
});

test('country code and trunk zero are dropped', () => {
  assert.equal(cleanPhone('+91 98765 43210'), '9876543210');
  assert.equal(cleanPhone('919876543210'), '9876543210');
  assert.equal(cleanPhone('098765 43210'), '9876543210');        // the sheet\u2019s most common shape
  assert.equal(cleanPhone('p:+919876543210'), '9876543210');     // Meta Lead Ads
});

test('two numbers in one cell: the last wins (as in the sheet)', () => {
  assert.equal(cleanPhone('08925 46133/ 98840 83922'), '9884083922');
  assert.equal(cleanPhone('9884083922/9123456789'), '9123456789');
});

test('Excel numbers arrive as JS numbers', () => {
  assert.equal(cleanPhone(919876543210), '9876543210');
  assert.equal(cleanPhone(9876543210), '9876543210');
});

test('unfixable values are flagged, not guessed', () => {
  assert.equal(cleanPhone(''), null);
  assert.equal(cleanPhone(null), null);
  assert.equal(cleanPhone('12345'), null);
  assert.equal(cleanPhone('not-a-phone'), null);
  assert.equal(cleanPhone('5876543210'), null);        // 10 digits but not a mobile prefix
  assert.equal(cleanPhone('9.19876E+11'), null);       // scientific text: digits already lost
  assert.equal(cleanPhone(NaN), null);
});
