/**
 * Callio clone — full E2E walkthrough with Playwright.
 * Logs in as admin, visits every route, captures console errors, failed
 * requests, screenshots, and asserts real content rendered (not blank pages).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const API = 'http://localhost:3001';
const SHOTS = '/root/e2e/shots';

const ROUTES = [
  { path: '/', name: 'dashboard' },
  { path: '/leads', name: 'leads' },
  { path: '/pipeline', name: 'pipeline' },
  { path: '/follow-ups', name: 'follow-ups' },
  { path: '/team', name: 'team' },
  { path: '/performance', name: 'performance' },
  { path: '/quality', name: 'quality' },
  { path: '/reviews/new', name: 'reviews-new' },
  { path: '/users', name: 'users' },
  { path: '/calls', name: 'calls' },
  { path: '/reports', name: 'reports' },
  { path: '/exports', name: 'exports' },
  { path: '/api-doc', name: 'api-doc' },
];

const results = [];
const consoleErrors = [];
const failedRequests = [];

function log(...a) { console.log(...a); }

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Capture console errors and network failures
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      // Ignore favicon and dev-noise
      if (!/favicon|Download the React DevTools/i.test(t)) {
        consoleErrors.push({ route: page.url(), text: t.slice(0, 300) });
      }
    }
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!/favicon|_next\/static/.test(u)) {
      failedRequests.push({ url: u.slice(0, 200), err: r.failure()?.errorText });
    }
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) {
      failedRequests.push({ url: r.url().slice(0, 200), status: r.status() });
    }
  });

  // ── 1. LOGIN ──
  log('\n=== LOGIN ===');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  await page.fill('input[type="email"]', 'admin@levoy.co');
  await page.fill('input[type="password"]', 'demo1234');

  const respPromise = page.waitForResponse(
    (r) => r.url().includes('/api/auth/login'),
    { timeout: 15000 }
  ).catch(() => null);

  await page.click('button[type="submit"]');
  const resp = await respPromise;

  let loginOk = false;
  if (resp) {
    loginOk = resp.status() === 200;
    log(`  login response: HTTP ${resp.status()}`);
  }

  await page.waitForTimeout(2500);
  log(`  landed on: ${page.url()}`);

  const token = await page.evaluate(() => localStorage.getItem('levoy_token'));
  log(`  token stored: ${token ? 'YES (' + token.slice(0, 18) + '...)' : 'NO'}`);
  const user = await page.evaluate(() => localStorage.getItem('levoy_user'));
  log(`  user stored: ${user ? user.slice(0, 120) : 'NO'}`);

  await page.screenshot({ path: `${SHOTS}/00-after-login.png`, fullPage: true });
  results.push({ step: 'login', ok: loginOk && !!token, detail: `url=${page.url()} token=${!!token}` });

  // ── 2. VISIT EVERY ROUTE ──
  log('\n=== ROUTES ===');
  for (const r of ROUTES) {
    const before = consoleErrors.length;
    const beforeReq = failedRequests.length;

    try {
      await page.goto(BASE + r.path, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2200); // let data load

      const text = await page.innerText('body');
      const textLen = text.trim().length;
      const newErrors = consoleErrors.length - before;
      const newFails = failedRequests.length - beforeReq;

      // A page is "real" if it has meaningful text and isn't an error boundary
      const isErrorPage = /Application error|Unhandled Runtime Error|500\b/.test(text.slice(0, 300));
      const looksEmpty = textLen < 80;

      await page.screenshot({ path: `${SHOTS}/${r.name}.png`, fullPage: true });

      const ok = !isErrorPage && !looksEmpty;
      results.push({
        step: `route ${r.path}`,
        ok,
        detail: `text=${textLen}ch errors=${newErrors} apiFails=${newFails}`,
      });
      log(`  ${ok ? 'OK  ' : 'FAIL'} ${r.path.padEnd(16)} text=${String(textLen).padStart(5)}ch  consoleErr=${newErrors}  apiFail=${newFails}`);

      if (isErrorPage) log(`       ^ ERROR BOUNDARY: ${text.slice(0, 120)}`);
      if (looksEmpty) log(`       ^ SUSPICIOUSLY EMPTY: "${text.slice(0, 80)}"`);

      // show a content snippet
      log(`       content: ${text.replace(/\s+/g, ' ').slice(0, 110)}`);
    } catch (e) {
      results.push({ step: `route ${r.path}`, ok: false, detail: `threw: ${e.message.slice(0, 120)}` });
      log(`  FAIL ${r.path.padEnd(16)} threw: ${e.message.slice(0, 100)}`);
    }
  }

  // ── 3. INTERACTION TEST on /leads ──
  log('\n=== INTERACTION: /leads ===');
  await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // filter toolbar
  const selects = await page.locator('select').count();
  const inputs = await page.locator('input').count();
  const buttons = await page.locator('button').count();
  const checkboxes = await page.locator('input[type="checkbox"]').count();
  log(`  controls: ${selects} selects, ${inputs} inputs, ${buttons} buttons, ${checkboxes} checkboxes`);
  results.push({ step: 'leads controls', ok: selects > 0 && buttons > 0, detail: `${selects}sel ${inputs}in ${buttons}btn ${checkboxes}cb` });

  // row click opens drawer?
  const rows = await page.locator('tbody tr').count();
  log(`  table rows: ${rows}`);
  results.push({ step: 'leads data rows', ok: rows > 0, detail: `rows=${rows}` });

  if (rows > 0) {
    await page.locator('tbody tr').first().click();
    await page.waitForTimeout(1800);
    const after = await page.innerText('body');
    const drawerOpen = /assignee|follow-?up|timeline|close/i.test(after);
    log(`  drawer opens on row click: ${drawerOpen}`);
    results.push({ step: 'lead detail drawer', ok: drawerOpen, detail: `text grew to ${after.length}ch` });
    await page.screenshot({ path: `${SHOTS}/leads-drawer.png`, fullPage: true });
  }

  // ── 4. ROLE GATING: agent should NOT see admin nav ──
  log('\n=== ROLE GATING (agent) ===');
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1200);
  await p2.fill('input[type="email"]', 'agent1@levoy.co');
  await p2.fill('input[type="password"]', 'demo1234');
  await p2.click('button[type="submit"]');
  await p2.waitForTimeout(3000);

  const agentBody = await p2.innerText('body');
  const seesUsers = /\bUsers\b/.test(agentBody);
  const seesQuality = /\bQuality\b/.test(agentBody);
  const seesPerformance = /\bPerformance\b/.test(agentBody);
  log(`  agent sees "Users" nav: ${seesUsers}`);
  log(`  agent sees "Quality" nav: ${seesQuality}`);
  log(`  agent sees "Performance" nav: ${seesPerformance}`);
  results.push({
    step: 'agent nav hides admin items',
    ok: !seesUsers && !seesQuality && !seesPerformance,
    detail: `users=${seesUsers} quality=${seesQuality} performance=${seesPerformance}`,
  });
  await p2.screenshot({ path: `${SHOTS}/agent-view.png`, fullPage: true });

  // agent direct-navigating to /users
  await p2.goto(`${BASE}/users`, { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(2000);
  const agentUsers = await p2.innerText('body');
  const blockedOrEmpty = !agentUsers.includes('Create User') && !agentUsers.includes('Reset Password');
  log(`  agent on /users sees admin UI: ${!blockedOrEmpty}`);
  results.push({ step: 'agent blocked from /users UI', ok: blockedOrEmpty, detail: blockedOrEmpty ? 'no admin controls' : 'ADMIN UI LEAKED' });

  await ctx2.close();

  // ── 5. MARKETING SITE ──
  log('\n=== MARKETING SITE ===');
  const m = await ctx.newPage();
  await m.goto('http://localhost:3002/', { waitUntil: 'domcontentloaded' });
  await m.waitForTimeout(1800);
  const mText = await m.innerText('body');
  const mOk = /Unleash|Callio/i.test(mText);
  log(`  renders content: ${mOk} (${mText.length}ch)`);
  await m.screenshot({ path: `${SHOTS}/marketing.png`, fullPage: true });
  results.push({ step: 'marketing site', ok: mOk, detail: `${mText.length}ch` });

  // mobile viewport
  await m.setViewportSize({ width: 390, height: 844 });
  await m.waitForTimeout(800);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  log(`  mobile horizontal overflow: ${overflow}`);
  results.push({ step: 'marketing mobile no-overflow', ok: !overflow, detail: `overflow=${overflow}` });
  await m.screenshot({ path: `${SHOTS}/marketing-mobile.png`, fullPage: true });

  // ── 6. SUMMARY ──
  log('\n' + '='.repeat(64));
  log('SUMMARY');
  log('='.repeat(64));
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  log(`PASS: ${pass}   FAIL: ${fail}`);
  log('');
  results.forEach((r) => log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.step.padEnd(34)} ${r.detail}`));
  log('');
  log(`console errors: ${consoleErrors.length}`);
  consoleErrors.slice(0, 12).forEach((e) => log(`  [${e.route}] ${e.text}`));
  log(`failed requests: ${failedRequests.length}`);
  failedRequests.slice(0, 12).forEach((e) => log(`  ${e.status || ''} ${e.url} ${e.err || ''}`));

  fs.writeFileSync(
    '/root/e2e/report.json',
    JSON.stringify({ results, consoleErrors, failedRequests, pass, fail }, null, 2)
  );

  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(2);
});