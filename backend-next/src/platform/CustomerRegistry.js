'use strict';

const { pq, DEFAULT_TENANT_SCHEMA } = require('../config/db');

const TTL_MS = 30 * 1000;

// Looks customers up in the platform schema. Reads on every authenticated request go through a short cache, so
// suspending a customer takes effect within TTL_MS (and immediately on the instance that did it).
class CustomerRegistry {
  constructor() { this.cache = new Map(); this.defaultIdCache = null; }

  async byId(id) {
    const n = parseInt(id);
    if (!Number.isInteger(n)) return null;
    const hit = this.cache.get(n);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.row;
    const r = await pq('SELECT * FROM customers WHERE id = $1', [n]);
    const row = r.rows[0] || null;
    this.cache.set(n, { at: Date.now(), row });
    return row;
  }

  invalidate(id) { if (id === undefined) { this.cache.clear(); this.defaultIdCache = null; } else this.cache.delete(parseInt(id)); }

  async list() { return (await pq('SELECT * FROM customers ORDER BY id')).rows; }

  async bySchema(schema) {
    const r = await pq('SELECT * FROM customers WHERE schema_name = $1', [schema]);
    return r.rows[0] || null;
  }

  /** The customer that existed before multi-customer support (customer #1). Tokens issued before it carry no customer id. */
  async defaultId() {
    if (this.defaultIdCache) return this.defaultIdCache;
    const c = await this.bySchema(DEFAULT_TENANT_SCHEMA());
    if (c) this.defaultIdCache = c.id;
    return this.defaultIdCache;
  }
}

/** { id, schema } — the shape `runInTenant` wants. */
const toTenant = c => ({ id: c.id, schema: c.schema_name });

module.exports = new CustomerRegistry();
module.exports.toTenant = toTenant;
