'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toE164, normalizeCountryCode } = require('../src/utils/phoneFormat');

test('every way of writing one Indian number gives the same result', () => {
  for (const raw of ['7845860720', '+917845860720', '+91 78458 60720', '917845860720', '07845860720', '0091 78458 60720', '78458-60720', 7845860720, 917845860720]) {
    assert.equal(toE164(raw, '91'), '+917845860720', String(raw));
  }
});

test('the default country is whatever the admin chose', () => {
  assert.equal(toE164('4155550123', '1'), '+14155550123');
  assert.equal(toE164('7911 123456', '44'), '+447911123456');
  assert.equal(toE164('0501234567', '971'), '+971501234567');
});

test('a number that already has a different country code is left alone', () => {
  assert.equal(toE164('+14155550123', '91'), '+14155550123');
  assert.equal(toE164('0014155550123', '91'), '+14155550123');
});

test('a 10-digit number that merely starts with the country code digits still gets the code added', () => {
  assert.equal(toE164('9123456789', '91'), '+919123456789');
});

test('things that are not phone numbers give null', () => {
  for (const raw of [null, undefined, '', '   ', 'abc', '12345', '+1234567890123456', '9.19E+11x']) {
    assert.equal(toE164(raw, '91'), null, String(raw));
  }
});

test('a bad country code falls back to India', () => {
  assert.equal(normalizeCountryCode('+91'), '91');
  assert.equal(normalizeCountryCode(''), '91');
  assert.equal(normalizeCountryCode('0'), '91');
  assert.equal(normalizeCountryCode('12345'), '91');
  assert.equal(normalizeCountryCode('44'), '44');
  assert.equal(toE164('7911123456', 'zz'), '+917911123456');
});
