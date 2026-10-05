'use strict';

const { currentTenant } = require('../config/db');
const { ValidationError, ForbiddenError, AppError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { FEATURES } = require('../platform/features');
const Catalog = require('../platform/PlanCatalogService');
const Subscriptions = require('../platform/SubscriptionService');

// What the CURRENT customer's workspace gets. The catalog (names, prices, which features each plan includes) and
// each customer's subscription live in the platform schema and are managed by the platform owner; this service
// answers "what does this customer have right now?" and gates features. Expiry rules: an expired trial, a lapsed
// period or a cancelled subscription is plain Free.
//
// A customer's admin can start the one free trial and pay by card (Stripe). Granting free months, changing plan or
// setting dates is the platform owner's job (src/platform/SubscriptionService.js, /api/platform/*).
const customerId = () => {
  const t = currentTenant();
  if (!t) throw new Error('PlanService needs a customer context');
  return t.id;
};

class PlanService {
  /** The plans on sale, with every feature each includes (lowest tier first). */
  async catalog() {
    const plans = (await Catalog.all()).filter(p => p.is_active);
    // "added by": the first (cheapest) plan on sale that includes the feature
    const addedBy = f => (plans.find(p => p.features.includes(f)) || {}).key || null;
    return plans.map(p => ({
      key: p.key, name: p.name, price_monthly: p.price_monthly, currency: p.currency, tagline: p.tagline,
      features: p.features.filter(f => FEATURES[f]).map(f => ({ key: f, label: FEATURES[f].label, added_by: addedBy(f) })),
    }));
  }

  async row() {
    const s = await Subscriptions.get(customerId());
    if (!s) return { plan: 'free', status: 'active' };
    return {
      plan: s.plan_key, status: s.status, trial_started_at: s.trial_started_at, trial_ends_at: s.trial_ends_at,
      current_period_end: s.current_period_end, cancel_at_period_end: s.cancel_at_period_end,
      trial_over: s.trial_over, period_over: s.period_over,
    };
  }

  // What the workspace actually gets right now: an expired trial or lapsed period is plain Free.
  async current() {
    const row = await this.row();
    let status = row.status;
    let effective = row.plan;
    if (row.plan !== 'free') {
      if (row.status === 'trial' && row.trial_over) status = 'expired';
      else if (row.status === 'active' && row.period_over) status = row.cancel_at_period_end ? 'cancelled' : 'expired';
      if (status === 'expired' || status === 'cancelled') effective = 'free';
    }
    const plans = await Catalog.all();
    const effPlan = plans.find(p => p.key === effective) || plans.find(p => p.key === 'free');
    const have = new Set(effPlan ? effPlan.features : []);
    const shown = plans.find(p => p.key === row.plan);
    const trialUsed = !!row.trial_started_at;
    const features = [];
    for (const f of Object.keys(FEATURES)) {
      const req = await Catalog.requiredPlanFor(f);
      features.push({ key: f, label: FEATURES[f].label, enabled: have.has(f), required_plan: req ? req.key : null });
    }
    return {
      plan: row.plan, plan_name: shown ? shown.name : row.plan, status, effective_plan: effective,
      trial_started_at: row.trial_started_at, trial_ends_at: row.trial_ends_at, current_period_end: row.current_period_end,
      cancel_at_period_end: !!row.cancel_at_period_end,
      trial_available: !trialUsed, trial_days: Subscriptions.TRIAL_DAYS,
      payments_connected: require('../config/integrations').stripe(),
      features, enabled: [...have],
    };
  }

  async has(feature) {
    const cur = await this.current();
    return cur.enabled.includes(feature);
  }

  // Throws 402 with enough detail for the UI to show an upgrade prompt.
  async assert(feature) {
    if (!FEATURES[feature]) throw new Error(`unknown feature ${feature}`);
    if (await this.has(feature)) return;
    const req = await Catalog.requiredPlanFor(feature);
    const name = req ? req.name : 'a higher';
    throw new AppError(402, `${FEATURES[feature].label} is part of the ${name} plan`, {
      feature, required_plan: req ? req.key : null, required_plan_name: name, upgrade_url: '/plans',
    });
  }

  /** The one free trial a customer's admin may start themselves. */
  async startTrial(ctx, plan) {
    const p = await Catalog.get(plan);
    if (!p || !p.is_active || p.key === 'free') throw new ValidationError('choose a paid plan');
    await Subscriptions.selfTrial(customerId(), `user#${ctx.userId}`, plan);
    await audit(null, ctx, 'plan.trial_started', 'subscription', customerId(), { plan });
    return this.current();
  }

  /** A confirmed card payment (called by StripeService): switch the plan on for `months` more months. */
  async grant(userId, plan, months) {
    await Subscriptions.grantPaid(customerId(), plan, months, `user#${userId}`, { via: 'stripe' });
    await audit(null, { userId, role: 'admin' }, 'plan.paid', 'subscription', customerId(), { plan, months });
    return this.current();
  }

  // Changing a plan without a payment is the platform owner's job; the old self-service switch is gone.
  async activate() {
    throw new ForbiddenError('Plans are changed by the platform owner. Pay online to upgrade, or contact support.');
  }
}

module.exports = new PlanService();
module.exports.FEATURES = FEATURES;
