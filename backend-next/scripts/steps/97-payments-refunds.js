// Paying by card (Stripe, via the in-process test stand-in) and refunding from the platform console: checkout ->
// signed webhook -> the CUSTOMER's subscription switches on (once) -> full/partial refunds, manual refunds,
// taking the access back, and the history of it all.
module.exports = async ({ vars, call, expect }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });
  const PL = { as: 'platform' };
  const SIG = { 'stripe-signature': 'fake-signature' };

  const plan0 = await call('pay-plan-before', 'GET', '/api/plan');
  expect(plan0.data.payments_connected === true && plan0.data.effective_plan === 'free', 'online payment is available and the customer starts on Free');

  // ── checkout -> signed webhook ──
  const buy = await J('pay-checkout', 'POST', '/api/plan/checkout', { plan: 'premium', months: 3 }, { save: { sessionId: d => d.session_id } });
  expect(buy.status === 201 && buy.data.amount === 22500 && buy.data.currency === 'INR', `3 months of Premium is 3 × ₹75 in paise (got ${buy.data.amount})`);
  const forged = await call('pay-webhook-forged', 'POST', '/api/plan/stripe/webhook',
    { as: null, headers: { 'stripe-signature': 'guess' }, body: { type: 'checkout.session.completed', data: { object: { id: vars.sessionId, metadata: { app: 'levoy', customer_id: '1' } } } } });
  expect(forged.status === 400, 'a webhook without a valid signature is refused');
  const stillFree = await call('pay-plan-unpaid', 'GET', '/api/plan');
  expect(stillFree.data.effective_plan === 'free', 'nothing is granted until Stripe confirms');

  const evt = { type: 'checkout.session.completed', data: { object: { id: '{sessionId}', metadata: { app: 'levoy', customer_id: '1' } } } };
  const paid = await call('pay-webhook', 'POST', '/api/plan/stripe/webhook', { as: null, headers: SIG, body: evt });
  expect(paid.status === 200 && paid.data.status === 'paid' && paid.data.plan === 'premium', `the signed webhook confirms the payment (got ${paid.status} ${JSON.stringify(paid.data)})`);
  const on = await call('pay-plan-paid', 'GET', '/api/plan');
  expect(on.data.effective_plan === 'premium' && on.data.status === 'active', 'the paying customer now has Premium');
  const endAfterFirst = on.data.current_period_end;
  expect(new Date(endAfterFirst) > new Date(Date.now() + 80 * 86400000), 'three months were added');
  const again = await call('pay-webhook-again', 'POST', '/api/plan/stripe/webhook', { as: null, headers: SIG, body: evt });
  const on2 = await call('pay-plan-paid-again', 'GET', '/api/plan');
  expect(again.status === 200 && on2.data.current_period_end === endAfterFirst, 'a repeated webhook never grants twice');
  const otherApp = await call('pay-webhook-other-app', 'POST', '/api/plan/stripe/webhook',
    { as: null, headers: SIG, body: { type: 'checkout.session.completed', data: { object: { id: 'cs_fake_x', metadata: { app: 'something-else' } } } } });
  expect(otherApp.status === 200 && otherApp.data.ignored === true, 'events from other products on the same Stripe account are ignored');

  const hist = await call('pay-history', 'GET', '/api/plan/payments');
  const pay = hist.data.find(p => p.status === 'paid');
  expect(!!pay && pay.months === 3, 'the payment shows as paid in the customer\'s history');
  vars.payId = pay.id;
  const detail = await call('pay-platform-detail', 'GET', '/api/platform/customers/1', PL);
  expect(detail.data.payments.some(p => p.id === vars.payId && p.status === 'paid') &&
    detail.data.events.some(e => e.action === 'payment.granted'), 'the platform owner sees the payment and the grant in the history');

  // ── refunds ──
  const noRole = await J('pay-refund-as-admin', 'POST', '/api/platform/customers/1/refund', { payment_id: vars.payId });
  expect(noRole.status === 403, 'only the platform owner can refund');
  const tooMuch = await J('pay-refund-too-much', 'POST', '/api/platform/customers/1/refund', { payment_id: vars.payId, amount: 100000 }, PL);
  expect(tooMuch.status === 400, 'a refund cannot exceed what was paid');
  const zero = await J('pay-refund-zero', 'POST', '/api/platform/customers/1/refund', { payment_id: vars.payId, amount: 0 }, PL);
  expect(zero.status === 400, 'a refund must be more than zero');
  const part = await J('pay-refund-partial', 'POST', '/api/platform/customers/1/refund', { payment_id: vars.payId, amount: 75, note: 'one month back' }, PL);
  expect(part.status === 200 && part.data.status === 'partially_refunded' && part.data.refunded === 75 && /^re_fake_/.test(part.data.stripe_refund_id), 'a partial refund goes through Stripe');
  const partRevoke = await J('pay-refund-partial-revoke', 'POST', '/api/platform/customers/1/refund', { payment_id: vars.payId, amount: 10, revoke_access: true }, PL);
  expect(partRevoke.status === 400, 'access can only be taken back on a full refund');
  const stillOn = await call('pay-plan-after-partial', 'GET', '/api/plan');
  expect(stillOn.data.effective_plan === 'premium', 'a partial refund leaves the plan on');
  const full = await J('pay-refund-full', 'POST', '/api/platform/customers/1/refund', { payment_id: vars.payId, revoke_access: true }, PL);
  expect(full.status === 200 && full.data.status === 'refunded' && full.data.total_refunded === 225, `refunding the rest completes it (got ${full.data.status} ${full.data.total_refunded})`);
  const offAgain = await call('pay-plan-after-full', 'GET', '/api/plan');
  expect(offAgain.data.effective_plan === 'free', 'taking the access back returns the customer to Free');
  const twice = await J('pay-refund-twice', 'POST', '/api/platform/customers/1/refund', { payment_id: vars.payId }, PL);
  expect(twice.status === 409, 'a fully refunded payment cannot be refunded again');
  const unknown = await J('pay-refund-unknown', 'POST', '/api/platform/customers/1/refund', { payment_id: 99999 }, PL);
  expect(unknown.status === 404, 'an unknown payment is not found');

  // ── a manual refund (money moved outside Stripe) ──
  const noNote = await J('pay-refund-manual-nonote', 'POST', '/api/platform/customers/1/refund', { manual: true, amount: 50 }, PL);
  expect(noNote.status === 400, 'a manual refund needs a note');
  const manual = await J('pay-refund-manual', 'POST', '/api/platform/customers/1/refund', { manual: true, amount: 50, currency: 'inr', note: 'bank transfer, ref 123' }, PL);
  expect(manual.status === 200 && manual.data.recorded === true && manual.data.currency === 'INR', 'a manual refund is recorded');

  const after = await call('pay-platform-detail-after', 'GET', '/api/platform/customers/1', PL);
  const acts = after.data.events.map(e => e.action);
  expect(['payment.granted', 'payment.refunded', 'payment.refund_recorded', 'subscription.access_revoked'].every(a => acts.includes(a)), 'every payment event is in the history');
  expect(after.data.payments.find(p => p.id === vars.payId).status === 'refunded', 'the payment itself shows as refunded');
};
