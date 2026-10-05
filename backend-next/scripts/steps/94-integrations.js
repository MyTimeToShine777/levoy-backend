// Push-token registration, Stripe Checkout rules, the pay pages, and the externally-triggered jobs endpoint
// (the shared Trigger.dev project in medivoy.api calls it). The harness server runs with local storage and push
// switched off (.env.test); the live R2 / FCM / Stripe round-trips are in scripts/verify-integrations.js.
// Skipped by --only-legacy.

const fs = require('fs');
const path = require('path');
const SECRET = 'test-jobs-secret';       // INTERNAL_JOBS_SECRET in .env.test

module.exports = async ({ call, expect }) => {
  // the database was just reset, so yesterday's run may have left dated backup files whose user ids are reused
  fs.rmSync(path.join(__dirname, '..', '..', 'uploads', 'backups'), { recursive: true, force: true });
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });
  const token = 'fcm-test-token-' + 'a'.repeat(40);

  // ── push tokens ──
  const noTok = await J('in-push-empty', 'POST', '/api/push/tokens', {}, { as: 'agent3' });
  expect(noTok.status === 400, `a missing token is refused (got ${noTok.status})`);
  const reg = await J('in-push-register', 'POST', '/api/push/tokens', { token, device_name: 'Pixel 7', platform: 'android' }, { as: 'agent3' });
  expect(reg.status === 200 && reg.data.registered === true, 'a phone can register for push');
  const reg2 = await J('in-push-register-again', 'POST', '/api/push/tokens', { token, platform: 'android' }, { as: 'agent3' });
  expect(reg2.status === 200, 'registering the same token twice is harmless');
  const test = await J('in-push-test', 'POST', '/api/push/test', {}, { as: 'agent3' });
  expect(test.status === 200 && test.data.devices === 1, `the test push sees the one registered phone (got ${test.data && test.data.devices})`);
  const stranger = await J('in-push-unreg-other', 'DELETE', '/api/push/tokens', { token }, { as: 'agent2' });
  expect(stranger.status === 200, 'another person unregistering the token is a no-op, not an error');
  const still = await J('in-push-test2', 'POST', '/api/push/test', {}, { as: 'agent3' });
  expect(still.data.devices === 1, 'someone else cannot remove the phone');
  const anon = await call('in-push-anon', 'POST', '/api/push/tokens', { body: { token }, as: null });
  expect(anon.status === 401, `registering needs a sign-in (got ${anon.status})`);
  const unreg = await J('in-push-unreg', 'DELETE', '/api/push/tokens', { token }, { as: 'agent3' });
  expect(unreg.status === 200 && unreg.data.registered === false, 'sign-out unregisters the phone');
  const none = await J('in-push-test3', 'POST', '/api/push/test', {}, { as: 'agent3' });
  expect(none.data.devices === 0, 'no phones are left');

  // ── paying for a plan ──
  const agentBuy = await J('in-pay-agent', 'POST', '/api/plan/checkout', { plan: 'premium', months: 1 }, { as: 'agent3' });
  expect(agentBuy.status === 403, `only an admin can buy (got ${agentBuy.status})`);
  const free = await J('in-pay-free', 'POST', '/api/plan/checkout', { plan: 'free', months: 1 });
  expect(free.status === 400, `Free cannot be bought (got ${free.status})`);
  const biz = await J('in-pay-biz', 'POST', '/api/plan/checkout', { plan: 'biz', months: 1 });
  expect(biz.status === 400, `Business is priced per team, not sold here (got ${biz.status})`);
  const months = await J('in-pay-months', 'POST', '/api/plan/checkout', { plan: 'premium', months: 5 });
  expect(months.status === 400, `only 1/3/6/12 months are sold (got ${months.status})`);
  const plan = await call('in-pay-plan', 'GET', '/api/plan');
  expect(typeof plan.data.payments_connected === 'boolean', 'the plan says whether online payment is available');
  if (plan.data.payments_connected) {
    const buy = await J('in-pay-checkout', 'POST', '/api/plan/checkout', { plan: 'premium', months: 3, return_url: 'https://evil.example/steal' });
    expect(buy.status === 201 && /^https:\/\/checkout\.stripe\.com\//.test(buy.data.url), `checkout returns a Stripe-hosted page (got ${buy.status})`);
    expect(buy.data.amount === 7500 * 3 && buy.data.currency === 'INR', `3 months of Premium is 3 × ₹75 in paise (got ${buy.data.amount} ${buy.data.currency})`);
    const hist = await call('in-pay-history', 'GET', '/api/plan/payments');
    expect(hist.status === 200 && hist.data.some(p => p.status === 'pending' && p.months === 3), 'the attempt is recorded as pending');
    const sid = buy.data.session_id;
    const conf = await J('in-pay-confirm-unpaid', 'POST', '/api/plan/confirm', { session_id: sid });
    expect(conf.status === 200 && conf.data.status === 'pending', `an unpaid session does not switch the plan on (got ${conf.data && conf.data.status})`);
    const after = await call('in-pay-plan-after', 'GET', '/api/plan');
    expect(after.data.effective_plan === 'free', `plan is still Free (got ${after.data.effective_plan})`);
    const hacked = await J('in-pay-confirm-agent', 'POST', '/api/plan/confirm', { session_id: sid }, { as: 'agent3' });
    expect(hacked.status === 200 && hacked.data.status === 'pending', 'anyone can ask, but only Stripe can make it paid');
  } else {
    expect(true, 'Stripe is not configured in this run — checkout skipped');
  }
  const badId = await J('in-pay-confirm-bad', 'POST', '/api/plan/confirm', { session_id: 'nope' });
  expect(badId.status === 400, `a malformed session id is refused (got ${badId.status})`);
  const unknown = await J('in-pay-confirm-unknown', 'POST', '/api/plan/confirm', { session_id: 'cs_test_doesnotexist' });
  expect(unknown.status === 404, `an unknown session is 404 (got ${unknown.status})`);
  const hook = await call('in-pay-webhook-unsigned', 'POST', '/api/plan/stripe/webhook', { body: { type: 'checkout.session.completed' }, as: null });
  expect(hook.status === 400 || hook.status === 503, `an unsigned webhook is refused (got ${hook.status})`);
  const cancelPage = await call('in-pay-cancel-page', 'GET', '/pay/cancel', { as: null, raw: true });
  expect(cancelPage.status === 200, 'the cancel page opens without a sign-in');
  const successPage = await call('in-pay-success-page', 'GET', '/pay/success?session_id=bad', { as: null, raw: true });
  expect(successPage.status === 400, `the success page does not trust the URL (got ${successPage.status})`);

  // ── jobs started from outside ──
  const noSecret = await call('in-jobs-nosecret', 'POST', '/api/internal/jobs/hourly', { as: null });
  expect(noSecret.status === 401, `jobs need the shared secret (got ${noSecret.status})`);
  const wrong = await call('in-jobs-wrong', 'POST', '/api/internal/jobs/hourly', { as: null, headers: { 'x-internal-secret': 'guess' } });
  expect(wrong.status === 401, `a wrong secret is refused (got ${wrong.status})`);
  const unknownJob = await call('in-jobs-unknown', 'POST', '/api/internal/jobs/weekly', { as: null, headers: { 'x-internal-secret': SECRET } });
  expect(unknownJob.status === 400, `only hourly and daily exist (got ${unknownJob.status})`);

  const rem = await J('in-job-reminder', 'POST', '/api/call-reminders', { phone_number: '9000033333', note: 'job reminder', remind_at: new Date(Date.now() - 60000).toISOString() }, { as: 'agent3' });
  expect(rem.status === 201, 'a due reminder is set up');
  const hourly = await call('in-jobs-hourly', 'POST', '/api/internal/jobs/hourly', { as: null, headers: { 'x-internal-secret': SECRET } });
  expect(hourly.status === 200 && hourly.data.results[0].result.dueReminders.fired >= 1, `the hourly job fires due reminders (got ${JSON.stringify(hourly.data && hourly.data.results)})`);
  const again = await call('in-jobs-hourly-again', 'POST', '/api/internal/jobs/hourly', { as: null, headers: { 'x-internal-secret': SECRET } });
  expect(again.data.results[0].result.dueReminders.fired === 0, 'a reminder fires only once');
  const notes = await call('in-job-reminder-notif', 'GET', '/api/notifications', { as: 'agent3' });
  expect(notes.data.notifications.some(n => n.type === 'call_reminder' && /9000033333/.test(n.title)), 'the reminder arrived as a notification');

  const free1 = await call('in-jobs-daily-free', 'POST', '/api/internal/jobs/daily', { as: null, headers: { 'x-internal-secret': SECRET } });
  expect(free1.status === 200 && free1.data.results[0].result.autoBackups.skipped, 'on the Free plan the daily job makes no backups');
  await J('in-jobs-premium', 'POST', '/api/platform/customers/1/subscription/grant', { plan: 'premium_plus', months: 1 }, { as: 'platform' });
  const daily = await call('in-jobs-daily', 'POST', '/api/internal/jobs/daily', { as: null, headers: { 'x-internal-secret': SECRET } });
  expect(daily.status === 200 && daily.data.results[0].result.autoBackups.written >= 1, `on Premium the daily job backs up callers' logs (got ${JSON.stringify(daily.data && daily.data.results[0].result.autoBackups)})`);
  const daily2 = await call('in-jobs-daily-again', 'POST', '/api/internal/jobs/daily', { as: null, headers: { 'x-internal-secret': SECRET } });
  expect(daily2.data.results[0].result.autoBackups.written === 0, 'the backup is written once per day');
  for (const k of ['planNotices', 'purgeExports', 'sweepStorageCache', 'purgeStalePushTokens', 'expirePendingPayments']) {
    expect(daily.data.results[0].result[k] && !daily.data.results[0].result[k].error, `daily step ${k} ran (got ${JSON.stringify(daily.data.results[0].result[k])})`);
  }
  await J('in-jobs-reset', 'POST', '/api/platform/customers/1/subscription/plan', { plan: 'free' }, { as: 'platform' });
};
