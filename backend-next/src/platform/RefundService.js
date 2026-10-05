'use strict';

const { tx, runInTenant } = require('../config/db');
const { ValidationError, NotFoundError, ConflictError, AppError } = require('../exceptions');
const Registry = require('./CustomerRegistry');
const Subscriptions = require('./SubscriptionService');
const StripeService = require('../services/StripeService');

const NOW = "(NOW() AT TIME ZONE 'UTC')";
const major = minor => Math.round(minor) / 100;

// Refunds, from the platform console.
//   • a card payment (made through Stripe Checkout) is refunded THROUGH Stripe, fully or partly;
//   • anything else (a bank transfer, a goodwill credit…) is recorded manually — no money moves here.
// Optionally the access that was paid for is taken back (full refunds only). Every refund is in the history.
class RefundService {
  async refund(actor, customerId, body) {
    const c = await Registry.byId(customerId);
    if (!c) throw new NotFoundError('Customer not found');
    if (body.manual) return this.manual(actor, c, body);

    const paymentId = parseInt(body.payment_id);
    if (!Number.isInteger(paymentId)) throw new ValidationError('Choose the payment to refund');
    const result = await runInTenant(Registry.toTenant(c), () => tx(async ({ q }) => {
      const p = (await q('SELECT * FROM plan_payments WHERE id = $1 FOR UPDATE', [paymentId])).rows[0];
      if (!p) throw new NotFoundError('Payment not found');
      if (!['paid', 'partially_refunded'].includes(p.status)) throw new ConflictError(`This payment is ${p.status} and cannot be refunded`);
      if (!p.stripe_payment_intent) throw new ConflictError('This payment has no Stripe record — record a manual refund instead');
      const remaining = p.amount - p.refunded_amount;
      const minor = body.amount === undefined || body.amount === null || body.amount === ''
        ? remaining : Math.round(Number(body.amount) * 100);
      if (!Number.isFinite(minor) || minor <= 0) throw new ValidationError('Enter an amount greater than zero');
      if (minor > remaining) throw new ValidationError(`At most ${major(remaining)} ${p.currency} can still be refunded on this payment`);

      let refund;
      try {
        refund = await StripeService.client().refunds.create({
          payment_intent: p.stripe_payment_intent, amount: minor, reason: 'requested_by_customer',
          metadata: { app: 'levoy', customer_id: String(c.id), payment_id: String(p.id) },
        });
      } catch (e) {
        throw new AppError(502, `Stripe could not refund this payment: ${e.message}`);
      }
      const total = p.refunded_amount + minor;
      const status = total >= p.amount ? 'refunded' : 'partially_refunded';
      await q(
        `UPDATE plan_payments SET refunded_amount = $2, status = $3, refunded_at = ${NOW}, stripe_refund_id = $4, refund_note = $5 WHERE id = $1`,
        [p.id, total, status, refund.id, body.note ? String(body.note).slice(0, 1000) : null]);
      return { payment_id: p.id, plan: p.plan, months: p.months, currency: p.currency, refunded: major(minor), total_refunded: major(total),
        status, full: status === 'refunded', stripe_refund_id: refund.id };
    }));

    let revoked = null;
    if (body.revoke_access) {
      if (!result.full) throw new ValidationError('Access can only be taken back on a full refund');
      revoked = await Subscriptions.revoke(c.id, actor, { months: result.months, note: 'full refund' });
    }
    await Subscriptions.record(c.id, 'payment.refunded', { ...result, revoke_access: !!body.revoke_access, note: body.note || null }, actor);
    return { ...result, subscription: revoked ? Subscriptions.summary(revoked) : undefined };
  }

  async manual(actor, c, body) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Enter the amount refunded');
    const currency = String(body.currency || 'INR').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ValidationError('Currency must be a 3-letter code');
    if (!body.note || !String(body.note).trim()) throw new ValidationError('Add a note saying how the refund was made');
    let revoked = null;
    if (body.revoke_months) revoked = await Subscriptions.revoke(c.id, actor, { months: Subscriptions.monthsOf(body.revoke_months), note: 'manual refund' });
    await Subscriptions.record(c.id, 'payment.refund_recorded',
      { amount, currency, note: String(body.note).slice(0, 1000), revoke_months: body.revoke_months || null }, actor);
    return { recorded: true, amount, currency, subscription: revoked ? Subscriptions.summary(revoked) : undefined };
  }
}

module.exports = new RefundService();
