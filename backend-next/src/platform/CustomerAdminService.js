'use strict';

const jwt = require('jsonwebtoken');
const { q, pq, runInTenant, poolForSchema, DEFAULT_TENANT_SCHEMA } = require('../config/db');
const { JWT_SECRET, JWT_EXPIRE } = require('../config/env');
const { ValidationError, NotFoundError, ConflictError } = require('../exceptions');
const { audit } = require('../utils/audit');
const Registry = require('./CustomerRegistry');
const Subscriptions = require('./SubscriptionService');
const Catalog = require('./PlanCatalogService');
const Tenants = require('./TenantService');

const { toTenant } = Registry;
const norm = e => String(e || '').toLowerCase().trim();

// What the platform owner does to customers (the Customers console). Everything about ONE customer's own data
// is read from inside that customer's context; nothing here ever writes into a customer's business data.
class CustomerAdminService {
  /** Effective state of a subscription row, the same rules the customer's own plan check applies. */
  effective(s) {
    if (!s) return { plan: 'free', status: 'active', effective_plan: 'free' };
    let status = s.status; let effective = s.plan_key;
    if (s.plan_key !== 'free') {
      if (s.status === 'trial' && s.trial_over) status = 'expired';
      else if (s.status === 'active' && s.period_over) status = s.cancel_at_period_end ? 'cancelled' : 'expired';
      if (status === 'expired' || status === 'cancelled') effective = 'free';
    }
    return { plan: s.plan_key, status, effective_plan: effective };
  }

  /** Small counts read from inside the customer's own schema. */
  async usage(c) {
    return runInTenant(toTenant(c), async () => {
      const r = await q(
        `SELECT (SELECT COUNT(*)::int FROM users WHERE is_active) AS users,
                (SELECT COUNT(*)::int FROM leads) AS leads,
                (SELECT COUNT(*)::int FROM call_events) AS calls,
                (SELECT MAX(last_login_at) FROM users) AS last_login_at`);
      return r.rows[0];
    });
  }

  async list() {
    const customers = await Registry.list();
    const out = [];
    for (const c of customers) {
      const [sub, usage] = await Promise.all([
        Subscriptions.get(c.id),
        this.usage(c).catch(() => ({ users: null, leads: null, calls: null, last_login_at: null })),
      ]);
      const eff = this.effective(sub);
      out.push({
        id: c.id, name: c.name, slug: c.slug, status: c.status, owner_email: c.owner_email, created_at: c.created_at,
        plan: eff.plan, subscription_status: eff.status, effective_plan: eff.effective_plan,
        current_period_end: sub ? (sub.status === 'trial' ? sub.trial_ends_at : sub.current_period_end) : null,
        cancel_at_period_end: sub ? sub.cancel_at_period_end : false,
        ...usage,
      });
    }
    return out;
  }

  async overview() {
    const rows = await this.list();
    const soon = Date.now() + 7 * 86400000;
    const byPlan = {};
    for (const r of rows) byPlan[r.effective_plan] = (byPlan[r.effective_plan] || 0) + 1;
    return {
      customers: rows.length,
      active: rows.filter(r => r.status === 'active').length,
      suspended: rows.filter(r => r.status === 'suspended').length,
      paying: rows.filter(r => r.subscription_status === 'active' && r.plan !== 'free').length,
      on_trial: rows.filter(r => r.subscription_status === 'trial').length,
      expiring_soon: rows.filter(r => ['active', 'trial'].includes(r.subscription_status) && r.plan !== 'free' &&
        r.current_period_end && new Date(r.current_period_end).getTime() < soon).length,
      by_plan: byPlan,
    };
  }

  async customer(id) {
    const c = await Registry.byId(id);
    if (!c) throw new NotFoundError('Customer not found');
    return c;
  }

  async detail(id) {
    const c = await this.customer(id);
    const sub = await Subscriptions.get(c.id);
    const plans = await Catalog.all();
    const plan = plans.find(p => p.key === (sub ? sub.plan_key : 'free'));
    const inside = await runInTenant(toTenant(c), async () => {
      const admins = (await q(
        `SELECT id, name, email, is_active, last_login_at FROM users WHERE role = 'admin' ORDER BY id`)).rows;
      let payments = [];
      try {
        payments = (await q(
          `SELECT p.id, p.plan, p.months, p.amount, p.currency, p.status, p.stripe_session_id, p.stripe_payment_intent, p.refunded_amount,
                  to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                  to_char(p.paid_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS paid_at, u.name AS by
             FROM plan_payments p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 50`)).rows;
      } catch { /* table absent */ }
      return { admins, payments };
    });
    return {
      customer: c,
      subscription: sub ? { ...sub, ...this.effective(sub), plan_name: plan ? plan.name : sub.plan_key } : null,
      usage: await this.usage(c),
      admins: inside.admins,
      payments: inside.payments,
      events: await Subscriptions.events(c.id, 100),
    };
  }

  async update(actor, id, body) {
    const c = await this.customer(id);
    const sets = []; const vals = [];
    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (n.length < 2 || n.length > 200) throw new ValidationError('Company name must be 2–200 characters');
      vals.push(n); sets.push(`name = $${vals.length}`);
    }
    if (body.notes !== undefined) { vals.push(String(body.notes).slice(0, 4000)); sets.push(`notes = $${vals.length}`); }
    if (!sets.length) return c;
    vals.push(c.id);
    await pq(`UPDATE customers SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    Registry.invalidate(c.id);
    await Subscriptions.record(c.id, 'customer.updated', { fields: Object.keys(body).filter(k => ['name', 'notes'].includes(k)) }, actor);
    return this.customer(c.id);
  }

  async setStatus(actor, id, status) {
    const c = await this.customer(id);
    if (c.status === status) return c;
    await pq(`UPDATE customers SET status = $2, suspended_at = ${status === 'suspended' ? "(NOW() AT TIME ZONE 'UTC')" : 'NULL'} WHERE id = $1`, [c.id, status]);
    Registry.invalidate(c.id);
    await Subscriptions.record(c.id, status === 'suspended' ? 'customer.suspended' : 'customer.resumed', {}, actor);
    return this.customer(c.id);
  }

  /**
   * Support access: a workspace session for one of the customer's users, with every use logged on both sides.
   * Defaults to the platform owner's own account in that workspace if they have one, else the first admin.
   */
  async enter(admin, id, asEmail) {
    const c = await this.customer(id);
    if (c.status !== 'active') throw new ConflictError('This customer is suspended — resume it first');
    const want = norm(asEmail || admin.email);
    const user = await runInTenant(toTenant(c), async () => {
      let r = await q('SELECT id, role, email FROM users WHERE lower(email) = $1 AND is_active', [want]);
      if (!r.rows.length && !asEmail) r = await q(`SELECT id, role, email FROM users WHERE role = 'admin' AND is_active ORDER BY id LIMIT 1`);
      if (!r.rows.length) return null;
      await audit(null, { userId: r.rows[0].id, role: 'platform', ip: null }, 'platform.workspace_entered', 'user', r.rows[0].id, { by: admin.email });
      return r.rows[0];
    });
    if (!user) throw new NotFoundError(asEmail ? 'That user does not exist in this workspace' : 'This workspace has no active admin');
    await Subscriptions.record(c.id, 'customer.entered', { as: user.email }, admin.email);
    const token = jwt.sign({ sub: String(user.id), role: user.role, tid: c.id, via: admin.email }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
    return { access_token: token, token_type: 'bearer', customer: { id: c.id, name: c.name }, as: user.email };
  }

  /** Permanently remove a customer and ALL of its data. The caller must type the customer's slug. */
  async remove(actor, id, confirm) {
    const c = await this.customer(id);
    if (c.schema_name === DEFAULT_TENANT_SCHEMA()) throw new ConflictError('The original workspace cannot be deleted');
    if (String(confirm || '') !== c.slug) throw new ValidationError(`Type the customer's short name (${c.slug}) to confirm`);
    await pq('DELETE FROM customers WHERE id = $1', [c.id]);         // cascades: directory, subscription, history
    await poolForSchema(c.schema_name).query(`DROP SCHEMA IF EXISTS ${c.schema_name} CASCADE`);
    Registry.invalidate(c.id);
    console.log(`Customer ${c.id} (${c.name}) deleted by ${actor}`);
    return { id: c.id, deleted: true };
  }

  create(actor, body) {
    return Tenants.provision(actor, { name: body.name, ownerEmail: body.owner_email, ownerName: body.owner_name });
  }
}

module.exports = new CustomerAdminService();
