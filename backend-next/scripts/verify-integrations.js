'use strict';

// Live check of the third-party services levoy uses, with the credentials from .env.integrations.
// Safe to run any time: it writes one tiny object under levoy/_selftest/ in R2 (and deletes it), sends a push
// as a dry run (nothing is delivered), and opens + expires one Stripe test Checkout Session (nothing is charged).
// Prints names and outcomes only — never a secret value.
//   node scripts/verify-integrations.js

const crypto = require('crypto');
const integrations = require('../src/config/integrations');

const results = [];
const check = async (name, fn) => {
  try { results.push({ name, ok: true, detail: await fn() }); }
  catch (e) { results.push({ name, ok: false, detail: `${e.code || e.name || 'Error'}: ${e.message}`.slice(0, 200) }); }
};

(async () => {
  process.env.STORAGE_DRIVER = 'r2';
  process.env.ENABLE_PUSH_NOTIFICATIONS = 'true';
  const Storage = require('../src/services/StorageService');
  const PushService = require('../src/services/PushService');
  const StripeService = require('../src/services/StripeService');

  await check('R2 configured', async () => { if (!integrations.r2()) throw new Error('R2 variables missing'); return `bucket ${process.env.R2_BUCKET_NAME}`; });
  await check('R2 round-trip under levoy/_selftest/', async () => {
    const rel = `/uploads/_selftest/${Date.now()}.txt`;
    const body = Buffer.from(`levoy self-test ${crypto.randomBytes(6).toString('hex')}`);
    if (Storage.driver() !== 'r2') throw new Error('driver is not r2');
    await Storage.putBuffer(rel, body, 'text/plain');
    // read it back from the bucket itself, not the local cache
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const got = await Storage.client().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: Storage.key(rel) }));
    const text = Buffer.from(await got.Body.transformToByteArray());
    await Storage.remove(rel);
    if (!text.equals(body)) throw new Error('content mismatch');
    return `put/get/delete ok at key ${Storage.key(rel).split('/').slice(0, 2).join('/')}/…`;
  });
  await check('R2 refuses keys outside levoy/', async () => {
    for (const bad of ['/uploads/../../x.txt', '../x', '/other/x.txt']) {
      let threw = false;
      try { Storage.key(bad); } catch { threw = true; }
      if (!threw && !Storage.key(bad).startsWith('levoy/')) throw new Error(`escaped: ${bad}`);
    }
    return 'prefix enforced';
  });

  await check('Firebase configured', async () => { if (!integrations.firebase()) throw new Error('Firebase variables missing'); return `project ${process.env.FIREBASE_PROJECT_ID}`; });
  await check('FCM accepts our credentials (dry run)', async () => {
    try {
      await PushService.messaging().send({ token: 'x'.repeat(152), notification: { title: 't', body: 'b' } }, true);
      return 'dry run accepted';
    } catch (e) {
      // a fake token is rejected AFTER authentication succeeded; auth failures have different codes
      if (/registration-token-not-registered|invalid-argument|invalid-registration-token/.test(e.code || '')) return `credentials ok (fake token rejected: ${e.code})`;
      throw e;
    }
  });

  await check('Stripe configured', async () => {
    if (!integrations.stripe()) throw new Error('Stripe key missing');
    return `${/^sk_test_/.test(process.env.STRIPE_SECRET_KEY) ? 'test' : 'LIVE'} mode`;
  });
  await check('Stripe Checkout session create + expire', async () => {
    if (!/^sk_test_/.test(process.env.STRIPE_SECRET_KEY)) throw new Error('refusing to run against a live key');
    const stripe = StripeService.client();
    const s = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: 'inr', unit_amount: 7500, product_data: { name: 'Callio self-test' } } }],
      success_url: 'https://example.com/ok?session_id={CHECKOUT_SESSION_ID}', cancel_url: 'https://example.com/no',
      metadata: { app: 'levoy', selftest: '1' },
    });
    await stripe.checkout.sessions.expire(s.id);
    return `session ${s.id.slice(0, 12)}… ${s.url ? 'has a hosted url' : 'NO url'}, expired`;
  });
  await check('Stripe webhook signature check', async () => {
    const stripe = StripeService.client();
    const secret = 'whsec_selftest';
    const payload = JSON.stringify({ id: 'evt_x', object: 'event', type: 'noop', data: { object: { metadata: { app: 'other' } } } });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    stripe.webhooks.constructEvent(payload, header, secret);
    let rejected = false;
    try { stripe.webhooks.constructEvent(payload, header.replace(/v1=./, 'v1=0'), secret); } catch { rejected = true; }
    if (!rejected) throw new Error('tampered signature accepted');
    return 'valid accepted, tampered rejected';
  });

  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} — ${r.detail}`);
  const bad = results.filter(r => !r.ok).length;
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll integration checks passed');
  process.exit(bad ? 1 : 0);
})();
