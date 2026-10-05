#!/usr/bin/env node
/*
 * API characterization harness.
 *
 *   node scripts/characterize.js --entry server.js.legacy --out test/baseline/legacy.json
 *   node scripts/characterize.js --compare a.json b.json [--allow-extra]
 *
 * Resets the throwaway database, boots the given server entry against it,
 * replays a fixed ordered list of requests (see steps/*.js) and records
 * `{key, status, body}` per call with volatile values normalised. Because the DB
 * is rebuilt from scratch every run, ids are deterministic, so two runs of the
 * same code are byte-identical and any diff between legacy and refactored code
 * is a real behaviour change.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Client } = require('pg');
const fakeMedivoy = require('./fake-medivoy');

const ROOT = path.join(__dirname, '..');
const PORT = 3101;
const BASE = `http://127.0.0.1:${PORT}`;

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true);
}

// ───────────────────────── normalisation ─────────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const HEXTOK = /^[0-9a-f]{32,}$/i;
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
const VOLATILE_KEYS = new Set(['password', 'generated_at', 'uptime', 'token', 'accept_url', 'link', 'preview_token']);

function norm(v, key) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(x => norm(x));
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = norm(v[k], k);
    return out;
  }
  if (typeof v === 'string') {
    if (VOLATILE_KEYS.has(key)) return '<volatile>';
    if (ISO.test(v)) return '<ts>';
    if (HEXTOK.test(v) || JWT.test(v)) return '<tok>';
    if (/^\$2[aby]\$/.test(v)) return '<hash>';
    // relative links that embed a token
    return v.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<ts>').replace(/[0-9a-f]{32,}/gi, '<tok>').replace(/\d{13}-[0-9a-z]{6,}/g, '<file>').replace(/(?<!\d)1\d{12}(?!\d)/g, '<ms>');
  }
  return v;
}

// ───────────────────────── harness core ─────────────────────────
async function resetDb() {
  const c = new Client({ host: 'localhost', port: 54329, user: 'postgres', database: 'postgres' });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS levoy WITH (FORCE)`);
  await c.query(`CREATE DATABASE levoy OWNER levoy`);
  await c.end();
}

function bootServer(entry) {
  const child = spawn(process.execPath, ['--env-file=.env.test', entry], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  child.getLog = () => log;
  return child;
}

async function waitHealthy(child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('server exited early:\n' + child.getLog());
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return; } catch (_) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not become healthy:\n' + child.getLog());
}

function makeCtx() {
  const tokens = {};
  const vars = {};
  const results = [];
  const counters = {};

  const sub = s => String(s).replace(/\{(\w+)\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`unbound variable {${k}}`);
    return vars[k];
  });

  async function call(name, method, urlPath, opts = {}) {
    const url = sub(urlPath);
    const headers = { ...(opts.headers || {}) };
    const as = opts.as === undefined ? 'admin' : opts.as;
    if (as && tokens[as]) headers.Authorization = `Bearer ${tokens[as]}`;
    let body;
    if (opts.form) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(opts.form.fields || {})) fd.append(k, typeof v === 'string' ? sub(v) : JSON.stringify(deepSub(v, sub)));
      if (opts.form.file) {
        fd.append(opts.form.fileField || 'file',
          new Blob([opts.form.file.content], { type: opts.form.file.type || 'application/octet-stream' }),
          opts.form.file.name);
      }
      body = fd;
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(deepSub(opts.body, sub));
    }
    const res = await fetch(`${BASE}${url}`, { method, headers, body });
    const ct = res.headers.get('content-type') || '';
    let data;
    if (ct.includes('application/json')) data = await res.json();
    else { const t = await res.text(); data = { __text: t.length > 400 ? t.slice(0, 400) + '…' : t, __len: t.length }; }
    counters[name] = (counters[name] || 0) + 1;
    const key = `${name}#${counters[name]} ${method} ${url}`;
    results.push({ key, status: res.status, body: norm(data) });
    if (opts.save) for (const [varName, getter] of Object.entries(opts.save)) vars[varName] = getter(data);
    return { status: res.status, data };
  }

  // Sign in the way a person does: ask for a code, then submit it. The resend
  // cooldown is a few seconds in the test env, so wait it out if it is hit.
  async function login(name, email, opts = {}) {
    let sendRes = await call(`${name}-send`, 'POST', '/api/auth/send-otp', { body: { email }, as: null });
    if (sendRes.status === 429) {
      await new Promise(r => setTimeout(r, (parseInt(process.env.OTP_RESEND_SECONDS || '2') + 0.3) * 1000));
      sendRes = await call(`${name}-send-retry`, 'POST', '/api/auth/send-otp', { body: { email }, as: null });
    }
    return call(name, 'POST', '/api/auth/verify-otp', { body: { email, otp: opts.otp || fakeMedivoy.CODE }, as: null });
  }

  const failures = [];
  const expect = (cond, msg) => { if (!cond) failures.push(msg); };
  return { tokens, vars, results, call, login, sub, expect, failures };
}

function deepSub(v, sub) {
  if (typeof v === 'string') return v.includes('{') ? sub(v) : v;
  if (Array.isArray(v)) return v.map(x => deepSub(x, sub));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = deepSub(v[k], sub); return o; }
  return v;
}

async function record(entry, outFile) {
  await resetDb();
  const fake = await fakeMedivoy.start(3190);
  const child = bootServer(entry);
  try {
    await waitHealthy(child);
    const ctx = makeCtx();
    ctx.fake = fake;
    const stepsDir = path.join(__dirname, 'steps');
    const onlyLegacy = !!arg('only-legacy');
    const files = fs.readdirSync(stepsDir).filter(f => f.endsWith('.js') && !(onlyLegacy && /^9/.test(f))).sort();
    for (const f of files) {
      const mod = require(path.join(stepsDir, f));
      try { await mod(ctx); }
      catch (e) { ctx.results.push({ key: `STEP-FILE-ERROR ${f}`, status: -1, body: String(e && e.message) + (e && e.cause ? ' / cause: ' + String(e.cause.code || e.cause.message || e.cause) : '') + ' / ' + String((e && e.stack) || '').split(/\r?\n/).slice(1, 4).join(' | ') }); }
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(ctx.results, null, 1));
    for (const f of ctx.failures) console.log('  ASSERTION FAILED:', f);
    if (ctx.failures.length) process.exitCode = 1;
    console.log(ctx.failures.length ? ctx.failures.length + ' assertion(s) failed' : 'all step assertions passed');
    const errs = ctx.results.filter(r => r.status === -1 || r.status >= 500);
    console.log(`recorded ${ctx.results.length} calls -> ${outFile} (${errs.length} 5xx/harness errors)`);
    for (const e of errs.slice(0, 10)) console.log('  !', e.key, e.status, JSON.stringify(e.body).slice(0, 160));
    if (errs.some(e => e.status === -1)) console.log('--- server log (tail) ---\n' + child.getLog().split('\n').slice(-40).join('\n'));
  } finally {
    child.kill();
    await fake.close();
    await new Promise(r => setTimeout(r, 300));
  }
}

function compare(aFile, bFile, allowExtra) {
  const a = JSON.parse(fs.readFileSync(aFile, 'utf8'));
  const b = JSON.parse(fs.readFileSync(bFile, 'utf8'));
  const bm = new Map(b.map(r => [r.key, r]));
  let diffs = 0;
  for (const ra of a) {
    const rb = bm.get(ra.key);
    if (!rb) { console.log('MISSING in B:', ra.key); diffs++; continue; }
    const sa = JSON.stringify(ra), sb = JSON.stringify(rb);
    if (sa !== sb) {
      diffs++;
      console.log('DIFF', ra.key);
      console.log('  A:', sa.slice(0, 500));
      console.log('  B:', sb.slice(0, 500));
    }
  }
  if (!allowExtra) {
    const am = new Set(a.map(r => r.key));
    for (const rb of b) if (!am.has(rb.key)) { console.log('EXTRA in B:', rb.key); diffs++; }
  }
  console.log(diffs === 0 ? `IDENTICAL (${a.length} calls)` : `${diffs} difference(s)`);
  process.exit(diffs === 0 ? 0 : 1);
}

(async () => {
  if (arg('compare')) {
    const i = process.argv.indexOf('--compare');
    return compare(process.argv[i + 1], process.argv[i + 2], !!arg('allow-extra'));
  }
  const entry = arg('entry', 'server.js');
  const out = arg('out');
  if (!out) throw new Error('--out required');
  await record(entry, path.resolve(ROOT, out));
})().catch(e => { console.error(e); process.exit(2); });
