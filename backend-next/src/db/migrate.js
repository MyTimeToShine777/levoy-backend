'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { poolForSchema, databaseUrl } = require('../config/db');

const execFileAsync = promisify(execFile);
const ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations');

// Run the Prisma CLI that ships in node_modules (no global install needed) against ONE customer's schema.
// Asynchronous on purpose: a customer can be created while the server is answering other customers.
async function prisma(args, schema) {
  const cli = require.resolve('prisma/build/index.js');
  const { stdout } = await execFileAsync(process.execPath, [cli, ...args], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl(schema) },
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

const expectedMigrations = () =>
  fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);

// How many migrations this schema has finished. A schema with no history table yet has done none.
async function appliedCount(schema) {
  try {
    const r = await poolForSchema(schema).query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL');
    return r.rows[0].n;
  } catch (e) {
    if (e.code === '42P01') return 0;          // undefined_table
    throw e;
  }
}

// Bring ONE customer's schema to the latest version.
//
//  • Fresh schema            -> `migrate deploy` builds everything from 0_init onward.
//  • Schema created by the   -> it already has the baseline tables but no
//    pre-Prisma initDB()        _prisma_migrations history, so 0_init is first
//                               marked as applied (baselining), then the rest runs.
//  • Already Prisma-managed  -> `migrate deploy` applies whatever is pending.
//
// A schema that is already current is detected with one cheap query, so starting the server with many
// customers does not launch the Prisma CLI for each of them.
// Set AUTO_MIGRATE=false to skip (e.g. when the platform runs migrations in CI).
async function migrateSchema(schema) {
  if (String(process.env.AUTO_MIGRATE || 'true').toLowerCase() === 'false') {
    console.log('AUTO_MIGRATE=false — skipping prisma migrate deploy');
    return { skipped: true };
  }
  const have = await appliedCount(schema);
  if (have >= expectedMigrations().length) return { upToDate: true };

  const p = poolForSchema(schema);
  const r = await p.query(
    `SELECT to_regclass(current_schema() || '.users') AS users_tbl,
            to_regclass(current_schema() || '._prisma_migrations') AS history_tbl`);
  const { users_tbl: hasUsers, history_tbl: hasHistory } = r.rows[0];
  try {
    if (hasUsers && !hasHistory) {
      console.log(`Existing pre-Prisma schema "${schema}" detected — baselining migration 0_init`);
      await prisma(['migrate', 'resolve', '--applied', '0_init'], schema);
    }
    const out = await prisma(['migrate', 'deploy'], schema);
    const applied = (out.match(/The following migration\(s\) have been applied:[\s\S]*$/) || [''])[0].trim();
    console.log(applied ? `[${schema}] ${applied.replace(/\n+/g, ' ')}` : `[${schema}] schema is up to date`);
    return { upToDate: false };
  } catch (e) {
    const detail = (e.stderr && e.stderr.toString()) || (e.stdout && e.stdout.toString()) || e.message;
    throw new Error(`prisma migrate deploy failed for schema "${schema}":\n${detail}`);
  }
}

module.exports = { migrateSchema, prisma };
