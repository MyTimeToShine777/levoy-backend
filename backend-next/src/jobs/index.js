'use strict';

const { q } = require('../config/db');
const PlanService = require('../services/PlanService');
const ReminderService = require('../services/ReminderService');
const CallExportService = require('../services/CallExportService');
const StripeService = require('../services/StripeService');
const PushService = require('../services/PushService');
const Storage = require('../services/StorageService');
const Tenants = require('../platform/TenantService');
const { tenantTag } = require('../utils/tenantPath');

const DAY = 86400000;
const ymd = t => new Date(t).toISOString().slice(0, 10);

// One failing job must not stop the others; the result says what each did.
async function step(results, name, fn) {
  try { results[name] = await fn(); } catch (e) { console.error(`Job ${name} failed:`, e.message); results[name] = { error: e.message }; }
}

// Missed-call reminders whose time has come become notifications (and, through the database trigger, push messages).
async function dueReminders() {
  const users = (await q(`SELECT DISTINCT user_id FROM call_reminders WHERE done = false AND notified_at IS NULL AND remind_at IS NOT NULL AND remind_at <= (NOW() AT TIME ZONE 'UTC')`)).rows;
  let fired = 0;
  for (const u of users) fired += await ReminderService.fireDue(u.user_id);
  return { users: users.length, fired };
}

// Premium: a dated JSON copy of every caller's log in storage, today's file written once, the one from 8 days ago removed.
async function autoBackups() {
  if (!(await PlanService.has('auto_backup'))) return { skipped: 'plan has no auto backup' };
  const users = (await q(`SELECT u.id, u.role FROM users u WHERE EXISTS (SELECT 1 FROM call_events c WHERE c.user_id = u.id)`)).rows;
  const today = ymd(Date.now());
  let written = 0, failed = 0;
  for (const u of users) {
    const rel = `/uploads/backups/${tenantTag()}${u.id}/${today}.json`;
    try {
      if (await Storage.exists(rel)) continue;
      const data = await CallExportService.backup({ userId: u.id, role: u.role, ip: null });
      await Storage.putBuffer(rel, Buffer.from(JSON.stringify(data)), 'application/json');
      written++;
      await Storage.remove(`/uploads/backups/${tenantTag()}${u.id}/${ymd(Date.now() - 8 * DAY)}.json`).catch(() => {});
    } catch (e) { failed++; console.error(`Backup for user ${u.id} failed:`, e.message); }
  }
  return { users: users.length, written, failed };
}

// Tell the workspace's admins once when the trial/period has 2 days left, and once when it has lapsed.
async function planNotices() {
  const row = await PlanService.row();
  if (row.plan === 'free') return { skipped: 'free plan' };
  const ends = row.status === 'trial' ? row.trial_ends_at : row.status === 'active' ? row.current_period_end : null;
  if (!ends) return { skipped: 'no end date' };
  const left = new Date(ends).getTime() - Date.now();
  let kind = null;
  if (left <= 0) kind = 'plan_ended';
  else if (left <= 2 * DAY) kind = 'plan_ending';
  if (!kind) return { due: false };
  const trial = row.status === 'trial';
  const title = kind === 'plan_ended' ? (trial ? 'Your free trial has ended' : 'Your plan has ended') : (trial ? 'Your free trial ends soon' : 'Your plan ends soon');
  const message = kind === 'plan_ended' ? 'Premium features are switched off. Upgrade to keep using them.' : 'Upgrade to keep call history, analytics and backups.';
  const admins = (await q(`SELECT id FROM users WHERE role = 'admin'`)).rows;
  let sent = 0;
  for (const a of admins) {
    const seen = await q(`SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2 AND data->>'ends_at' = $3`, [a.id, kind, ends]);
    if (seen.rows.length) continue;
    await q(`INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5)`, [a.id, kind, title, message, JSON.stringify({ ends_at: ends })]);
    sent++;
  }
  return { kind, sent };
}

// Exports older than 30 days are deleted from storage and the list.
async function purgeExports() {
  const old = (await q(`SELECT id, file_path FROM exports WHERE created_at < (NOW() AT TIME ZONE 'UTC') - interval '30 days'`)).rows;
  for (const e of old) { if (e.file_path) await Storage.remove(e.file_path).catch(() => {}); }
  if (old.length) await q('DELETE FROM exports WHERE id = ANY($1)', [old.map(e => e.id)]);
  return { purged: old.length };
}

async function hourlyForCustomer() {
  const results = {};
  await step(results, 'dueReminders', dueReminders);
  return results;
}

async function dailyForCustomer() {
  const results = {};
  await step(results, 'autoBackups', autoBackups);
  await step(results, 'planNotices', planNotices);
  await step(results, 'purgeExports', purgeExports);
  await step(results, 'sweepStorageCache', async () => ({ removed: Storage.sweepCache(24) }));
  await step(results, 'purgeStalePushTokens', async () => ({ removed: await PushService.purgeStale() }));
  await step(results, 'expirePendingPayments', async () => ({ expired: await StripeService.sweepPending() }));
  return results;
}

// Every job runs once PER CUSTOMER, each inside that customer's own database context; a failure for one
// customer is reported and never stops the others. Result: [{ customer_id, result | error }].
const perCustomer = fn => () => Tenants.forEachCustomer(fn);

module.exports = {
  hourly: perCustomer(hourlyForCustomer),
  daily: perCustomer(dailyForCustomer),
  dueReminders: perCustomer(dueReminders),
};
