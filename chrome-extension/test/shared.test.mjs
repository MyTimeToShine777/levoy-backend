import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanNumber, dial, normalizeServer, sendOtp, verifyOtp } from '../shared.js';

test('server addresses are normalised', () => {
  assert.equal(normalizeServer('192.168.1.10:3001'), 'http://192.168.1.10:3001/api');
  assert.equal(normalizeServer('https://crm.example.com/'), 'https://crm.example.com/api');
  assert.equal(normalizeServer('https://crm.example.com/api/'), 'https://crm.example.com/api');
  assert.throws(() => normalizeServer('  '));
});

test('numbers are cleaned, and non-numbers refused', () => {
  assert.equal(cleanNumber('tel:+91 90000-11111'), '+919000011111');
  assert.equal(cleanNumber('(900) 001 1111'), '9000011111');
  assert.equal(cleanNumber('tel:+1234567;ext=5'), '+1234567');
  assert.equal(cleanNumber('12345'), null);          // too short
  assert.equal(cleanNumber('1234567890123456'), null); // too long
  assert.equal(cleanNumber('90000+11111'), null);    // plus in the middle
  assert.equal(cleanNumber('DROP TABLE'), null);
});

const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

test('dial posts the cleaned number with the bearer token', async () => {
  let seen;
  const f = async (url, init) => { seen = { url, init }; return reply(201, { queued: true })(); };
  const r = await dial(f, { server: 'http://x/api', token: 'T' }, 'tel:+91 90000 11111', 'Aanya');
  assert.equal(r.queued, true);
  assert.equal(seen.url, 'http://x/api/quick-call/dial');
  assert.equal(seen.init.headers.Authorization, 'Bearer T');
  assert.deepEqual(JSON.parse(seen.init.body), { number: '+919000011111', name: 'Aanya', source: 'chrome' });
});

test('errors carry the status and the plan to upgrade to', async () => {
  await assert.rejects(dial(reply(402, { detail: 'needs Premium', required_plan_name: 'Premium' }), { server: 's', token: 't' }, '9000011111'),
    e => e.code === 402 && e.plan === 'Premium' && /Premium/.test(e.message));
  await assert.rejects(sendOtp(async () => { throw new Error('offline'); }, 's', 'a'), e => e.code === 0 && /reach/.test(e.message));
  await assert.rejects(dial(reply(200, {}), { server: 's', token: 't' }, 'nope'), /phone number/);
});

test('sign-in asks for a code, then submits it', async () => {
  let seen;
  const capture = body => async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => body }; };
  const sent = await sendOtp(capture({ resend_in: 60 }), 'http://x/api', 'a@b.co');
  assert.equal(sent.resend_in, 60);
  assert.equal(seen.url, 'http://x/api/auth/send-otp');
  assert.deepEqual(JSON.parse(seen.init.body), { email: 'a@b.co' });
  const session = await verifyOtp(capture({ access_token: 'T', user: { email: 'a@b.co' } }), 'http://x/api', 'a@b.co', '123456');
  assert.equal(session.access_token, 'T');
  assert.equal(seen.url, 'http://x/api/auth/verify-otp');
  assert.deepEqual(JSON.parse(seen.init.body), { email: 'a@b.co', otp: '123456' });
});
