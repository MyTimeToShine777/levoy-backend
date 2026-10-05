'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const { Pool } = require('pg');

/*
 * Database access for a multi-customer deployment.
 *
 * Every customer (workspace) has its own Postgres SCHEMA holding a full copy of the app's tables, so one
 * customer's queries physically cannot see another's rows. The request's customer travels in an
 * AsyncLocalStorage context (set by the auth middleware); `q`, `tx` and `pool` below resolve to that
 * customer's pool. With NO context they throw — a missing context must fail loudly, never fall back to
 * "some" schema and read another customer's data.
 *
 * Platform-wide tables (customers, plans, subscriptions, directory…) live in PLATFORM_SCHEMA and are reached
 * with `pq`/`ptx` — they never depend on the context.
 */

const PLATFORM_SCHEMA = process.env.PLATFORM_SCHEMA || 'levoy_platform';
// Schema of the customer that existed before multi-customer support (customer #1).
const DEFAULT_TENANT_SCHEMA = () => process.env.PG_SCHEMA || 'public';
// Connections per customer pool. Idle ones close after 10 s, so quiet customers hold none.
const TENANT_POOL_MAX = parseInt(process.env.TENANT_POOL_MAX) || 4;

const SAFE_SCHEMA = /^[a-z_][a-z0-9_]*$/;
function assertSchema(name) {
  if (!SAFE_SCHEMA.test(String(name))) throw new Error(`Unsafe schema name: ${name}`);
  return name;
}

const pgConfig = (schema, max) => ({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DB || 'levoy',
  user: process.env.PG_USER || 'levoy',
  password: process.env.PG_PASSWORD || 'levoy123',
  // Managed databases (DigitalOcean etc.) require TLS and use their own CA.
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  // Every unqualified table name resolves inside this schema only.
  options: `-c search_path=${assertSchema(schema)}`,
  max,
  idleTimeoutMillis: 10000,
});

// Connection string for the Prisma CLI (migrations only) for a given schema. DATABASE_URL wins as the base;
// otherwise it is composed from the same PG_* variables the pg pools use.
function databaseUrl(schema = DEFAULT_TENANT_SCHEMA()) {
  const base = process.env.DATABASE_URL
    || (() => {
      const c = pgConfig(schema);
      return `postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.password)}@${c.host}:${c.port}/${c.database}`;
    })();
  const u = new URL(base);
  u.searchParams.set('schema', schema);
  return u.toString();
}

const pools = new Map();   // schema -> Pool
function poolFor(schema) {
  let p = pools.get(schema);
  if (!p) {
    p = new Pool(pgConfig(schema, TENANT_POOL_MAX));
    p.on('error', e => console.error(`Idle client error (${schema}):`, e.message));
    pools.set(schema, p);
  }
  return p;
}

// ─── tenant context ───
const als = new AsyncLocalStorage();

/** The customer for the running request/job: { id, schema } or null. */
const currentTenant = () => als.getStore() || null;

/** Run `fn` as customer `tenant` ({ id, schema }). Everything it awaits sees that customer only. */
const runInTenant = (tenant, fn) => als.run({ id: tenant.id, schema: assertSchema(tenant.schema) }, fn);

function tenantPool() {
  const t = als.getStore();
  if (!t) throw new Error('No customer context: this code ran outside a request/job for a specific customer');
  return poolFor(t.schema);
}

// `pool` keeps the shape the services already use (`connect`, `query`, `end`) but is resolved per call.
const pool = {
  connect: (...a) => tenantPool().connect(...a),
  query: (...a) => tenantPool().query(...a),
  end: async () => { await Promise.all([...pools.values()].map(p => p.end().catch(() => {}))); pools.clear(); },
  get options() { return tenantPool().options; },
};

async function q(text, params) { return tenantPool().query(text, params); }

// Run a set of statements inside one transaction.
//
// q() checks out whatever pool connection is free, so a bare
// BEGIN/DELETE/.../COMMIT sequence issued through q() can land on DIFFERENT
// connections and silently lose atomicity. This acquires a single client and
// threads it through every statement instead.
async function runTx(p, fn) {
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn({ q: (text, params) => client.query(text, params) });
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
const tx = fn => runTx(tenantPool(), fn);

// ─── platform schema (customers, plans, subscriptions…) — independent of any customer context ───
const platformPool = () => poolFor(PLATFORM_SCHEMA);
const pq = (text, params) => platformPool().query(text, params);
const ptx = fn => runTx(platformPool(), fn);

// A pool for one named schema (provisioning / migrating a customer that is not "current").
const poolForSchema = schema => poolFor(assertSchema(schema));

module.exports = {
  pool, q, tx, databaseUrl,
  pq, ptx, platformPool, poolForSchema,
  runInTenant, currentTenant,
  PLATFORM_SCHEMA, DEFAULT_TENANT_SCHEMA, assertSchema,
};
