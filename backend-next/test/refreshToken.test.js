'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { newRefreshToken, hashRefreshToken, customerIdOfRefreshToken } = require('../src/utils/refreshToken');

test('a new key carries its company id and is different every time', () => {
  const a = newRefreshToken(7);
  assert.equal(customerIdOfRefreshToken(a), 7);
  assert.notEqual(a, newRefreshToken(7));
});

test('things that are not refresh keys have no company id', () => {
  for (const t of [null, undefined, '', 'abc', 'c7_short', 'x7_' + 'a'.repeat(64), 'c_' + 'a'.repeat(64), 'c7_' + 'g'.repeat(64)]) {
    assert.equal(customerIdOfRefreshToken(t), null, String(t));
  }
});

test('the stored hash is stable and does not reveal the key', () => {
  const t = newRefreshToken(1);
  assert.equal(hashRefreshToken(t), hashRefreshToken(t));
  assert.equal(hashRefreshToken(t).length, 64);
  assert.ok(!hashRefreshToken(t).includes(t.slice(-16)));
});
