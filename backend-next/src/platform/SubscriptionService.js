'use strict';

const { pq } = require('../config/db');
const { ValidationError, NotFoundError, ConflictError } = require('../exceptions');
const Catalog = require('./PlanCatalogService');

// Dates are UTC wall-clock in `timestamp` columns: expiry is decided in SQL and dates leave as ISO text,
// because the pg driver would otherwise read them as server-local time.
const iso = c => `to_char(${c}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ${c}`;
const NOW = "(NOW() AT TIME ZONE 'UTC')";
const TRIAL_DAYS = 7;

const SELECT = `SELECT customer_id, plan_key, status, cancel_at_period_end, changed_by,
       ${iso('trial_started_at')}, ${iso('trial_ends_at')}, ${iso('current_period_end')}, ${iso('updated_at')},
       (trial_ends_at IS NOT NULL AND trial_ends_at < ${NOW}) AS trial_over,
       (current_period_end IS NOT NULL AND current_period_end < ${NOW}) AS period_over
  FROM subscriptions`;

// One subscription per customer. The platform owner changes it from the console (grant, extend, set an end date,
// change plan, trial, cancel); a customer's admin changes it only by paying (Stripe) or starting the one free trial.
// Every change is written to subscription_events.
class SubscriptionService {
  async get(customerId) {
    const r = await pq(`${SELECT} WHERE customer_id = $1`, [customerId]);
    return r.rows[0] || null;
  }

  async require(customerId) {
    const s = await this.get(customerId);
    if (!s) throw new NotFoundError('Customer has no subscription');
    return s;
  }

  async events(customerId, limit = 100) {
    const r = await pq(
      `SELECT id, action, details, actor, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
         FROM subscription_events WHERE customer_id = $1 ORDER BY id DESC LIMIT $2`, [customerId, limit]);
    return r.rows;
  }

  async record(customerId, action, details, actor) {
    await pq('INSERT INTO subscription_events (customer_id, action, details, actor) VALUES ($1,$2,$3::jsonb,$4)',
      [customerId, action, JSON.stringify(details || {}), actor || null]);
  }

  summary(s) {
    return { plan: s.plan_key, status: s.status, trial_ends_at: s.trial_ends_at, current_period_end: s.current_period_end, cancel_at_period_end: s.cancel_at_period_end };
  }

  // Run one change and log it with a before/after picture.
  async change(customerId, action, actor, extra, sql, params) {
    const before = await this.require(customerId);
    await pq(sql, params);
    const after = await this.require(customerId);
    await this.record(customerId, action, { ...(extra || {}), before: this.summary(before), after: this.summary(after) }, actor);
    return after;
  }

  async requirePaidPlan(key) {
    const p = await Catalog.get(key);
    if (!p) throw new ValidationError('Unknown plan');
    return p;
  }

  monthsOf(v, { min = 1, max = 60 } = {}) {
    const n = parseInt(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`months must be a whole number from ${min} to ${max}`);
    return n;
  }

  /** Switch a plan on for `months`. Stacks on top of time still left on the SAME plan; otherwise starts now. */
  async grant(customerId, actor, { plan, months, note }) {
    const p = await this.requirePaidPlan(plan);
    if (p.key === 'free') return this.toFree(customerId, actor, { note });
    const m = this.monthsOf(months);
    return this.change(customerId, 'subscription.granted', actor, { plan, months: m, note: note || null },
      `UPDATE subscriptions SET
         current_period_end = (CASE WHEN plan_key = $2 AND status = 'active' AND current_period_end > ${NOW}
                                    THEN current_period_end ELSE ${NOW} END) + ($3 || ' months')::interval,
         plan_key = $2, status = 'active', trial_ends_at = NULL, cancel_at_period_end = FALSE,
         changed_by = $4, updated_at = ${NOW}
       WHERE customer_id = $1`, [customerId, plan, String(m), actor]);
  }

  /** A confirmed card payment: same as a grant, recorded as a payment. */
  async grantPaid(customerId, plan, months, actor, details) {
    const before = await this.require(customerId);
    const after = await this.grant(customerId, actor, { plan, months });
    await this.record(customerId, 'payment.granted', { plan, months, ...(details || {}), before: this.summary(before), after: this.summary(after) }, actor);
    return after;
  }

  /** Add months to what the customer has now (trial or paid period). A lapsed one is reactivated. */
  async extend(customerId, actor, { months, note }) {
    const cur = await this.require(customerId);
    if (cur.plan_key === 'free') throw new ValidationError('The Free plan has no end date — grant a paid plan instead');
    const m = this.monthsOf(months);
    const onTrial = cur.status === 'trial';
    const col = onTrial ? 'trial_ends_at' : 'current_period_end';
    return this.change(customerId, 'subscription.extended', actor, { months: m, note: note || null },
      `UPDATE subscriptions SET ${col} = GREATEST(COALESCE(${col}, ${NOW}), ${NOW}) + ($2 || ' months')::interval,
         status = CASE WHEN status IN ('expired', 'cancelled') THEN 'active' ELSE status END,
         cancel_at_period_end = FALSE, changed_by = $3, updated_at = ${NOW}
       WHERE customer_id = $1`, [customerId, String(m), actor]);
  }

  /** An exact end date (any date; a past date ends it now). */
  async setEndDate(customerId, actor, { date, note }) {
    const cur = await this.require(customerId);
    if (cur.plan_key === 'free') throw new ValidationError('The Free plan has no end date — grant a paid plan instead');
    const d = new Date(date);
    if (!date || Number.isNaN(d.getTime())) throw new ValidationError('Choose a valid end date');
    if (d.getFullYear() > 2100) throw new ValidationError('That end date is too far away');
    const onTrial = cur.status === 'trial';
    const col = onTrial ? 'trial_ends_at' : 'current_period_end';
    return this.change(customerId, 'subscription.end_date_set', actor, { end: d.toISOString(), note: note || null },
      `UPDATE subscriptions SET ${col} = $2,
         status = CASE WHEN status IN ('expired', 'cancelled') AND $2::timestamp > ${NOW} THEN 'active' ELSE status END,
         changed_by = $3, updated_at = ${NOW}
       WHERE customer_id = $1`, [customerId, d.toISOString(), actor]);
  }

  /** Move to another plan, keeping the dates. */
  async changePlan(customerId, actor, { plan, note }) {
    await this.requirePaidPlan(plan);
    if (plan === 'free') return this.toFree(customerId, actor, { note });
    await this.require(customerId);
    return this.change(customerId, 'subscription.plan_changed', actor, { plan, note: note || null },
      `UPDATE subscriptions SET plan_key = $2, changed_by = $3, updated_at = ${NOW} WHERE customer_id = $1`, [customerId, plan, actor]);
  }

  async toFree(customerId, actor, { note } = {}) {
    return this.change(customerId, 'subscription.set_free', actor, { note: note || null },
      `UPDATE subscriptions SET plan_key = 'free', status = 'active', trial_ends_at = NULL, current_period_end = NULL,
         cancel_at_period_end = FALSE, changed_by = $2, updated_at = ${NOW} WHERE customer_id = $1`, [customerId, actor]);
  }

  /** The platform owner may (re)start a trial of any length, even if one was used before. */
  async startTrial(customerId, actor, { plan, days, note }) {
    await this.requirePaidPlan(plan);
    if (plan === 'free') throw new ValidationError('Choose a paid plan for the trial');
    const d = parseInt(days === undefined ? TRIAL_DAYS : days);
    if (!Number.isInteger(d) || d < 1 || d > 365) throw new ValidationError('days must be a whole number from 1 to 365');
    return this.change(customerId, 'subscription.trial_started', actor, { plan, days: d, note: note || null },
      `UPDATE subscriptions SET plan_key = $2, status = 'trial', trial_started_at = COALESCE(trial_started_at, ${NOW}),
         trial_ends_at = ${NOW} + ($3 || ' days')::interval, current_period_end = NULL, cancel_at_period_end = FALSE,
         changed_by = $4, updated_at = ${NOW}
       WHERE customer_id = $1`, [customerId, plan, String(d), actor]);
  }

  /** A customer's own admin: the one free trial per customer. */
  async selfTrial(customerId, actor, plan) {
    const cur = await this.require(customerId);
    if (cur.trial_started_at) throw new ConflictError('The free trial has already been used on this workspace');
    return this.startTrial(customerId, actor, { plan, days: TRIAL_DAYS });
  }

  /** Cancel now, or leave it running until the period ends (the default, like most subscriptions). */
  async cancel(customerId, actor, { immediately, note }) {
    const cur = await this.require(customerId);
    if (cur.plan_key === 'free') throw new ValidationError('The customer is on the Free plan: there is nothing to cancel');
    if (immediately) {
      return this.change(customerId, 'subscription.cancelled', actor, { immediately: true, note: note || null },
        `UPDATE subscriptions SET status = 'cancelled', cancel_at_period_end = FALSE, current_period_end = ${NOW},
           trial_ends_at = CASE WHEN status = 'trial' THEN ${NOW} ELSE trial_ends_at END, changed_by = $2, updated_at = ${NOW}
         WHERE customer_id = $1`, [customerId, actor]);
    }
    return this.change(customerId, 'subscription.cancel_scheduled', actor, { immediately: false, note: note || null },
      `UPDATE subscriptions SET cancel_at_period_end = TRUE, changed_by = $2, updated_at = ${NOW} WHERE customer_id = $1`, [customerId, actor]);
  }

  /** Take back `months` of paid time (after a refund). If nothing is left the subscription ends now. */
  async revoke(customerId, actor, { months, note }) {
    const cur = await this.require(customerId);
    if (cur.plan_key === 'free' || cur.status !== 'active' || !cur.current_period_end) return cur;
    const m = this.monthsOf(months, { max: 120 });
    return this.change(customerId, 'subscription.access_revoked', actor, { months: m, note: note || null },
      `UPDATE subscriptions SET
         current_period_end = GREATEST(current_period_end - ($2 || ' months')::interval, ${NOW}),
         status = CASE WHEN current_period_end - ($2 || ' months')::interval <= ${NOW} THEN 'cancelled' ELSE status END,
         changed_by = $3, updated_at = ${NOW}
       WHERE customer_id = $1`, [customerId, String(m), actor]);
  }

  /** Undo a scheduled cancellation. */
  async keep(customerId, actor, { note } = {}) {
    return this.change(customerId, 'subscription.cancel_undone', actor, { note: note || null },
      `UPDATE subscriptions SET cancel_at_period_end = FALSE, changed_by = $2, updated_at = ${NOW} WHERE customer_id = $1`, [customerId, actor]);
  }
}

module.exports = new SubscriptionService();
module.exports.TRIAL_DAYS = TRIAL_DAYS;
