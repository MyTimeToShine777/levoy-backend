'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit';
process.env.CORS_ORIGIN = 'https://app.example.com';

const StripeService = require('../src/services/StripeService');
const Storage = require('../src/services/StorageService');
const { pool } = require('../src/config/db');

const req = origin => ({ get: h => (h === 'origin' ? origin : undefined) });

test.after(() => pool.end());

test('return address: only our own dashboard or the app deep link', () => {
  assert.equal(StripeService.safeReturn(req(), 'levoy://premium'), 'levoy://premium');
  assert.equal(StripeService.safeReturn(req(), 'https://app.example.com/plans'), 'https://app.example.com/plans');
  assert.equal(StripeService.safeReturn(req('http://localhost:3100'), 'http://localhost:3100/plans'), 'http://localhost:3100/plans');
  assert.equal(StripeService.safeReturn(req(), 'https://evil.example/plans'), '');
  assert.equal(StripeService.safeReturn(req(), 'javascript:alert(1)'), '');
  assert.equal(StripeService.safeReturn(req(), ''), '');
});

test('webhook: a bad or missing signature is refused', async () => {
  const body = Buffer.from(JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: {} } }));
  await assert.rejects(StripeService.webhook(body, 't=1,v1=00'), /signature/i);
  await assert.rejects(StripeService.webhook(body, undefined), /signature/i);
});

test('webhook: a correctly signed event for another product is ignored', async () => {
  const stripe = StripeService.client();
  const payload = JSON.stringify({ id: 'evt_2', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_test_other', metadata: { app: 'medivoy' } } } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_unit' });
  assert.deepEqual(await StripeService.webhook(Buffer.from(payload), header), { ignored: true });
});

test('webhook: events that are not about a checkout are ignored', async () => {
  const stripe = StripeService.client();
  const payload = JSON.stringify({ id: 'evt_3', object: 'event', type: 'charge.refunded', data: { object: { metadata: { app: 'levoy' } } } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_unit' });
  assert.deepEqual(await StripeService.webhook(Buffer.from(payload), header), { ignored: true });
});

test('storage keys stay under levoy/uploads and never escape', () => {
  assert.equal(Storage.key('/uploads/exports/a.xlsx'), 'levoy/uploads/exports/a.xlsx');
  for (const bad of ['/uploads/../etc/passwd', '../x', '/other/x', 'uploads/x', '/uploads//x', '', null, '/uploads/' + 'a'.repeat(500)]) {
    assert.throws(() => Storage.key(bad), /Refusing/, `should refuse ${bad}`);
  }
  assert.throws(() => Storage.abs('/uploads/../../x'), /Refusing/);
});
