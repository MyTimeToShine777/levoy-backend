'use strict';

const fs = require('fs');
const path = require('path');
const { platformPool, ptx, PLATFORM_SCHEMA, assertSchema } = require('../config/db');

const DIR = path.join(__dirname, 'migrations');
// Any constant works; it only has to be the same in every server instance.
const LOCK_KEY = 74610001;

// Bring the platform schema up to date. Plain SQL files, applied once each in name order and recorded in
// schema_migrations. A transaction-level advisory lock makes two servers starting together take turns.
async function migratePlatform() {
  await platformPool().query(`CREATE SCHEMA IF NOT EXISTS ${assertSchema(PLATFORM_SCHEMA)}`);
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
  const applied = [];
  await ptx(async ({ q }) => {
    await q('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    await q(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'))`);
    const done = new Set((await q('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      await q(fs.readFileSync(path.join(DIR, f), 'utf8'));
      await q('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      applied.push(f);
    }
  });
  return applied;
}

module.exports = { migratePlatform };
