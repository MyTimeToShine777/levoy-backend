#!/usr/bin/env node
/*
 * One-off tool used to create prisma/migrations/0_init/migration.sql: dumps the
 * schema of a database built by the pre-Prisma initDB() with pg_dump and strips
 * the noise (psql meta-commands, SET preamble, comments, schema qualifiers) so
 * the file is plain SQL that `prisma migrate deploy` can run.
 *
 * Kept for provenance; not needed at runtime.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PG_DUMP = process.env.PG_DUMP || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
const out = execFileSync(PG_DUMP, [
  '-h', process.env.PG_HOST || 'localhost', '-p', process.env.PG_PORT || '54329',
  '-U', process.env.PG_USER || 'levoy', '-d', process.env.PG_DB || 'levoy',
  '--schema-only', '--no-owner', '--no-privileges', '--no-comments',
  '--no-tablespaces', '--no-table-access-method',
], { env: { ...process.env, PGPASSWORD: process.env.PG_PASSWORD || 'levoy123' }, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');

let sql = out.replace(/\r/g, '').split('\n')
  .filter(l => !/^\\(un)?restrict/.test(l) && !/^SET /.test(l) && !/^SELECT pg_catalog/.test(l) && !/^--/.test(l))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/\bpublic\./g, '')
  .trim() + '\n';

const head = [
  '-- Baseline: the schema exactly as created by the pre-Prisma initDB().',
  '-- Databases that were built by initDB() are marked as already applied with',
  '-- `prisma migrate resolve --applied 0_init` (see src/db/migrate.js).',
  '', '',
].join('\n');

const dir = path.join(__dirname, '..', 'prisma', 'migrations', '0_init');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'migration.sql'), head + sql);
console.log('0_init written:', sql.split('\n').length, 'lines');
