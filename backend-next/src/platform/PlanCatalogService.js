'use strict';

const { pq } = require('../config/db');
const { ValidationError, NotFoundError, ConflictError } = require('../exceptions');
const { FEATURES } = require('./features');

const TTL_MS = 10 * 1000;
const KEY_RE = /^[a-z][a-z0-9_]{1,29}$/;
const COLS = 'key, name, price_monthly::float8 AS price_monthly, currency, tagline, sort_order, is_active, features';

// The plan catalog (platform.plans): names, prices, taglines and which features each plan includes. Read on
// almost every plan check, so it is cached for a few seconds and cleared by every edit.
class PlanCatalogService {
  constructor() { this.cache = null; }

  invalidate() { this.cache = null; }

  /** Every plan, in display order (lowest tier first). */
  async all() {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.rows;
    const rows = (await pq(`SELECT ${COLS} FROM plans ORDER BY sort_order, key`)).rows;
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  async get(key) { return (await this.all()).find(p => p.key === key) || null; }

  /** The cheapest tier that includes `feature` (what an upgrade prompt asks for). Only plans on sale count. */
  async requiredPlanFor(feature) {
    return (await this.all()).find(p => p.is_active && p.features.includes(feature)) || null;
  }

  /** The gated features the code knows, for the editor's checkbox list. */
  featureDefs() { return Object.entries(FEATURES).map(([key, f]) => ({ key, label: f.label })); }

  validate(body, { creating }) {
    const out = {};
    if (creating || body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name || name.length > 100) throw new ValidationError('Plan name is required (max 100 characters)');
      out.name = name;
    }
    if (body.price_monthly !== undefined) {
      if (body.price_monthly === null || body.price_monthly === '') out.price_monthly = null;
      else {
        const n = Number(body.price_monthly);
        if (!Number.isFinite(n) || n < 0 || n > 1000000) throw new ValidationError('Price must be a number from 0 to 1,000,000, or empty for "contact us"');
        out.price_monthly = Math.round(n * 100) / 100;
      }
    }
    if (body.currency !== undefined) {
      const c = String(body.currency).toUpperCase().trim();
      if (!/^[A-Z]{3}$/.test(c)) throw new ValidationError('Currency must be a 3-letter code such as INR');
      out.currency = c;
    }
    if (body.tagline !== undefined) out.tagline = String(body.tagline).slice(0, 300);
    if (body.sort_order !== undefined) {
      const n = parseInt(body.sort_order);
      if (!Number.isInteger(n) || n < 0 || n > 1000) throw new ValidationError('Order must be a whole number from 0 to 1000');
      out.sort_order = n;
    }
    if (body.is_active !== undefined) out.is_active = !!body.is_active;
    if (body.features !== undefined) {
      if (!Array.isArray(body.features)) throw new ValidationError('features must be a list');
      const bad = body.features.filter(f => !FEATURES[f]);
      if (bad.length) throw new ValidationError(`Unknown feature: ${bad.join(', ')}`);
      out.features = [...new Set(body.features)];
    }
    return out;
  }

  async create(body) {
    const key = String(body.key || '').trim();
    if (!KEY_RE.test(key)) throw new ValidationError('Plan key must be 2–30 characters: a letter, then lower-case letters, digits or _');
    if (await this.get(key)) throw new ConflictError('A plan with that key already exists');
    const v = this.validate(body, { creating: true });
    const max = (await this.all()).reduce((m, p) => Math.max(m, p.sort_order), 0);
    await pq(
      `INSERT INTO plans (key, name, price_monthly, currency, tagline, sort_order, is_active, features)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [key, v.name, v.price_monthly ?? null, v.currency || 'INR', v.tagline || '', v.sort_order ?? max + 1, v.is_active !== false, v.features || []]);
    this.invalidate();
    return this.get(key);
  }

  async update(key, body) {
    const cur = await this.get(key);
    if (!cur) throw new NotFoundError('Plan not found');
    const v = this.validate(body, { creating: false });
    // "free" is what a customer falls back to when anything lapses: it must always exist, be on, and cost nothing.
    if (key === 'free') {
      if (v.is_active === false) throw new ValidationError('The Free plan cannot be switched off');
      if (v.price_monthly !== undefined && v.price_monthly !== 0) throw new ValidationError('The Free plan must cost 0');
    }
    const sets = []; const vals = [];
    for (const [col, val] of Object.entries(v)) { vals.push(val); sets.push(`${col} = $${vals.length}`); }
    if (!sets.length) return cur;
    sets.push("updated_at = (NOW() AT TIME ZONE 'UTC')");
    vals.push(key);
    await pq(`UPDATE plans SET ${sets.join(', ')} WHERE key = $${vals.length}`, vals);
    this.invalidate();
    return this.get(key);
  }

  async remove(key) {
    if (key === 'free') throw new ValidationError('The Free plan cannot be deleted');
    if (!(await this.get(key))) throw new NotFoundError('Plan not found');
    const used = (await pq('SELECT COUNT(*)::int AS n FROM subscriptions WHERE plan_key = $1', [key])).rows[0].n;
    if (used) throw new ConflictError(`${used} customer${used === 1 ? ' is' : 's are'} on this plan. Move them first, or switch the plan off instead.`);
    await pq('DELETE FROM plans WHERE key = $1', [key]);
    this.invalidate();
    return { key, deleted: true };
  }
}

module.exports = new PlanCatalogService();
