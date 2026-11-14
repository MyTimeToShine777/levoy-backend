'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { retryOnServerError } = require('../src/utils/retry');

const serverError = status => Object.assign(new Error('ServiceUnavailable'), { $metadata: { httpStatusCode: status } });

test('a short 503 is tried again and the upload then works', async () => {
  let calls = 0;
  const result = await retryOnServerError(async () => {
    calls++;
    if (calls < 3) throw serverError(503);
    return 'saved';
  }, { waitMs: 1 });
  assert.equal(result, 'saved');
  assert.equal(calls, 3);
});

test('a dropped connection with no answer is tried again', async () => {
  let calls = 0;
  await retryOnServerError(async () => { calls++; if (calls === 1) throw new Error('socket hang up'); }, { waitMs: 1 });
  assert.equal(calls, 2);
});

test('gives up after the last try and shows the real error', async () => {
  let calls = 0;
  await assert.rejects(
    retryOnServerError(async () => { calls++; throw serverError(503); }, { tries: 3, waitMs: 1 }),
    /ServiceUnavailable/);
  assert.equal(calls, 3);
});

test('an error that cannot be fixed by waiting is not tried again', async () => {
  for (const status of [400, 403, 404]) {
    let calls = 0;
    await assert.rejects(retryOnServerError(async () => { calls++; throw serverError(status); }, { waitMs: 1 }));
    assert.equal(calls, 1, `status ${status}`);
  }
});
