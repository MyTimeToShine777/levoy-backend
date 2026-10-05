'use strict';

const {
  q, pq, runInTenant, poolForSchema, DEFAULT_TENANT_SCHEMA, assertSchema,
} = require('../config/db');
const { BOOTSTRAP_ADMIN_EMAIL } = require('../config/env');
const { ConflictError, ValidationError } = require('../exceptions');
const { OTP_ONLY_HASH } = require('../utils/passwords');
const { audit } = require('../utils/audit');
const { migrateSchema } = require('../db/migrate');
const { seed } = require('../db/seed');
const { DEFAULT_PLANS } = require('./features');
const Directory = require('./Directory');
const Registry = require('./CustomerRegistry');

const { toTenant } = Registry;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = e => String(e || '').toLowerCase().trim();

const slugify = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Creating, preparing and iterating customers. A customer = a row in platform.customers + its own schema.
class TenantService {
  // ─── platform bootstrap (idempotent, run at every start) ───

  /** First run only: the starter plans. After that the catalog belongs to the platform owner. */
  async ensureDefaultPlans() {
    for (const p of DEFAULT_PLANS) {
      await pq(
        `INSERT INTO plans (key, name, price_monthly, currency, tagline, sort_order, features)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (key) DO NOTHING`,
        [p.key, p.name, p.price_monthly, p.currency, p.tagline, p.sort_order, p.features]);
    }
  }

  /** PLATFORM_ADMIN_EMAILS (comma separated), defaulting to BOOTSTRAP_ADMIN_EMAIL. Never removes anyone. */
  async ensurePlatformAdmins() {
    const raw = process.env.PLATFORM_ADMIN_EMAILS || BOOTSTRAP_ADMIN_EMAIL || '';
    for (const e of raw.split(',').map(norm).filter(Boolean)) {
      await pq('INSERT INTO platform_admins (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [e]);
    }
  }

  /** A deployment that predates multi-customer support: its existing data becomes customer #1. */
  async ensureDefaultCustomer() {
    if ((await Registry.list()).length) return;
    const schema = DEFAULT_TENANT_SCHEMA();
    await pq(
      `INSERT INTO customers (name, slug, schema_name, owner_email) VALUES ($1,'default',$2,$3)`,
      [process.env.DEFAULT_CUSTOMER_NAME || 'Levoy', schema, BOOTSTRAP_ADMIN_EMAIL ? norm(BOOTSTRAP_ADMIN_EMAIL) : null]);
    Registry.invalidate();
    console.log(`Registered the existing workspace (schema "${schema}") as customer #1`);
  }

  /** Migrate + seed + directory/subscription repair for ONE customer. Safe to repeat. */
  async prepare(c) {
    await migrateSchema(c.schema_name);
    const isDefault = c.schema_name === DEFAULT_TENANT_SCHEMA();
    await runInTenant(toTenant(c), async () => {
      await seed(isDefault ? { bootstrapEmail: BOOTSTRAP_ADMIN_EMAIL, customerId: c.id } : {});
      const users = (await q('SELECT email FROM users')).rows.map(r => r.email);
      await Directory.sync(c.id, users);
      await this.adoptLegacySubscription(c.id);
    });
  }

  /** Customers created before subscriptions moved to the platform keep the plan they had (workspace_plan row). */
  async adoptLegacySubscription(customerId) {
    if ((await pq('SELECT 1 FROM subscriptions WHERE customer_id = $1', [customerId])).rows.length) return;
    let row = null;
    try { row = (await q('SELECT * FROM workspace_plan WHERE id = 1')).rows[0] || null; } catch { /* table absent */ }
    const known = row && (await pq('SELECT 1 FROM plans WHERE key = $1', [row.plan])).rows.length;
    if (known) {
      await pq(
        `INSERT INTO subscriptions (customer_id, plan_key, status, trial_started_at, trial_ends_at, current_period_end, changed_by)
         VALUES ($1,$2,$3,$4,$5,$6,'migrated')`,
        [customerId, row.plan, row.status, row.trial_started_at, row.trial_ends_at, row.current_period_end]);
      await this.event(customerId, 'subscription.migrated', { plan: row.plan, status: row.status }, 'system');
    } else {
      await pq(`INSERT INTO subscriptions (customer_id, plan_key, status) VALUES ($1,'free','active')`, [customerId]);
    }
  }

  async prepareAll() {
    for (const c of await Registry.list()) await this.prepare(c);
  }

  // ─── running something for every customer (background jobs) ───

  /** Runs `fn(customer)` inside each customer's context. One customer failing never stops the others. */
  async forEachCustomer(fn, { includeSuspended = false } = {}) {
    const out = [];
    for (const c of await Registry.list()) {
      if (c.status !== 'active' && !includeSuspended) continue;
      try { out.push({ customer_id: c.id, result: await runInTenant(toTenant(c), () => fn(c)) }); }
      catch (e) { console.error(`Job for customer ${c.id} (${c.name}) failed:`, e.message); out.push({ customer_id: c.id, error: e.message }); }
    }
    return out;
  }

  // ─── creating a customer ───

  async uniqueSlug(name) {
    const base = slugify(name) || 'customer';
    let slug = base; let n = 1;
    while ((await pq('SELECT 1 FROM customers WHERE slug = $1', [slug])).rows.length) { n += 1; slug = `${base}-${n}`.slice(0, 80); }
    return slug;
  }

  /**
   * New customer company: a platform row, its own schema with the full set of tables, reference data, and an
   * admin account for the owner (who signs in with an emailed code). Rolled back completely on any failure.
   */
  async provision(actor, { name, ownerEmail, ownerName }) {
    const cname = String(name || '').trim();
    const email = norm(ownerEmail);
    if (cname.length < 2) throw new ValidationError('Company name is required');
    if (!EMAIL_RE.test(email)) throw new ValidationError('A valid owner email is required');
    if (await Directory.lookup(email)) throw new ConflictError('That email already belongs to a workspace');

    const id = parseInt((await pq("SELECT nextval(pg_get_serial_sequence('customers','id')) AS id")).rows[0].id);
    const schema = assertSchema(`levoy_c${id}`);
    const slug = await this.uniqueSlug(cname);
    await pq('INSERT INTO customers (id, name, slug, schema_name, owner_email) VALUES ($1,$2,$3,$4,$5)', [id, cname, slug, schema, email]);
    try {
      await poolForSchema(schema).query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await migrateSchema(schema);
      await runInTenant({ id, schema }, async () => {
        await seed({});
        await Directory.register(email, id);
        const u = await q(
          `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,'admin') RETURNING id`,
          [email, OTP_ONLY_HASH, String(ownerName || '').trim() || 'Owner']);
        await audit(null, { userId: null, role: 'platform', ip: null }, 'user.created', 'user', u.rows[0].id,
          { email, role: 'admin', path: 'platform_provision', by: actor });
      });
      await pq(`INSERT INTO subscriptions (customer_id, plan_key, status, changed_by) VALUES ($1,'free','active',$2)`, [id, actor]);
      await this.event(id, 'customer.created', { name: cname, owner_email: email, schema }, actor);
    } catch (e) {
      // Leave nothing half-made: no row, no directory entry, no schema.
      await pq('DELETE FROM customers WHERE id = $1', [id]).catch(() => {});
      await poolForSchema(schema).query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
      Registry.invalidate(id);
      throw e;
    }
    Registry.invalidate(id);
    return Registry.byId(id);
  }

  async event(customerId, action, details, actor) {
    await pq('INSERT INTO subscription_events (customer_id, action, details, actor) VALUES ($1,$2,$3::jsonb,$4)',
      [customerId, action, JSON.stringify(details || {}), actor || null]);
  }
}

module.exports = new TenantService();
