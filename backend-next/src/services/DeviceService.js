'use strict';

const { q } = require('../config/db');
const { ValidationError, ForbiddenError } = require('../exceptions');

// What the phone app tells us about itself, so the Troubleshooting page can say what is wrong
// ("call-log permission is off", "battery optimisation will kill the sync") instead of leaving people to guess.
const PERMISSIONS = ['call_log', 'contacts', 'phone', 'notifications', 'microphone'];
const STALE_HOURS = 24;

class DeviceService {
  async report(ctx, body) {
    const b = body || {};
    const name = String(b.device_name || '').trim().slice(0, 120);
    if (!name) throw new ValidationError('device_name required');
    const perms = {};
    if (b.permissions && typeof b.permissions === 'object') {
      for (const k of PERMISSIONS) if (b.permissions[k] !== undefined) perms[k] = b.permissions[k] === true || b.permissions[k] === 'granted';
    }
    const bool = v => (v === undefined || v === null ? null : v === true || v === 'true');
    await q(
      `INSERT INTO user_devices (user_id, device_name, app_version, last_sync_at, permissions, battery_optimized, default_dialer, updated_at)
       VALUES ($1, $2, $3, (NOW() AT TIME ZONE 'UTC'), $4, $5, $6, NOW())
       ON CONFLICT (user_id, device_name) DO UPDATE SET
         app_version = COALESCE(EXCLUDED.app_version, user_devices.app_version), last_sync_at = (NOW() AT TIME ZONE 'UTC'),
         permissions = CASE WHEN EXCLUDED.permissions = '{}'::jsonb THEN user_devices.permissions ELSE EXCLUDED.permissions END,
         battery_optimized = COALESCE(EXCLUDED.battery_optimized, user_devices.battery_optimized),
         default_dialer = COALESCE(EXCLUDED.default_dialer, user_devices.default_dialer), updated_at = NOW()`,
      [parseInt(ctx.userId), name, b.app_version ? String(b.app_version).slice(0, 30) : null, JSON.stringify(perms),
        bool(b.battery_optimized), bool(b.default_dialer)]);
    return { ok: true };
  }

  // Devices with a plain-language list of problems. An agent sees their own; a manager/admin sees the team's.
  async list(ctx, query) {
    const params = [];
    let where = '';
    if (ctx.role === 'agent') { params.push(parseInt(ctx.userId)); where = 'WHERE d.user_id = $1'; }
    else if (query && query.user_id) {
      const uid = parseInt(query.user_id);
      if (!Number.isInteger(uid)) throw new ValidationError('user_id must be an integer');
      params.push(uid); where = 'WHERE d.user_id = $1';
    }
    const r = await q(
      `SELECT d.id, d.user_id, u.name AS user_name, d.device_name, d.app_version, d.permissions, d.battery_optimized, d.default_dialer,
              to_char(d.last_sync_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_sync_at,
              EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE 'UTC') - d.last_sync_at)) / 3600 AS hours_since_sync,
              (SELECT to_char(MAX(c.timestamp), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM call_events c WHERE c.user_id = d.user_id) AS last_call_at
         FROM user_devices d JOIN users u ON u.id = d.user_id ${where}
        ORDER BY d.last_sync_at DESC NULLS LAST`, params);
    return r.rows.map(d => ({ ...d, hours_since_sync: d.hours_since_sync == null ? null : Math.round(Number(d.hours_since_sync) * 10) / 10, problems: this.problems(d) }));
  }

  problems(d) {
    const out = [];
    const p = d.permissions || {};
    if (p.call_log === false) out.push({ code: 'call_log_permission', fix: 'Allow the Call logs permission for the app in Android Settings → Apps → Permissions. Without it no calls can be read.' });
    if (p.contacts === false) out.push({ code: 'contacts_permission', fix: 'Allow Contacts so saved names show up instead of bare numbers.' });
    if (p.phone === false) out.push({ code: 'phone_permission', fix: 'Allow the Phone permission so the SIM and call state can be read.' });
    if (p.notifications === false) out.push({ code: 'notification_permission', fix: 'Allow Notifications to receive reminders.' });
    if (d.battery_optimized === true) out.push({ code: 'battery_optimization', fix: 'Set the app to "Unrestricted" battery use; otherwise Android stops background syncing.' });
    if (d.hours_since_sync != null && Number(d.hours_since_sync) > STALE_HOURS) out.push({ code: 'stale_sync', fix: `No sync for over ${STALE_HOURS} hours. Open the app once and check that it has internet.` });
    return out;
  }

  async remove(ctx, id) {
    const r = await q('SELECT user_id FROM user_devices WHERE id = $1', [id]);
    if (!r.rows.length) return { deleted: false };
    if (ctx.role === 'agent' && r.rows[0].user_id !== parseInt(ctx.userId)) throw new ForbiddenError('Not yours');
    await q('DELETE FROM user_devices WHERE id = $1', [id]);
    return { deleted: true };
  }
}

module.exports = new DeviceService();
