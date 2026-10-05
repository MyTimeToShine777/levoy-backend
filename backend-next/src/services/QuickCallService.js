'use strict';

const { q } = require('../config/db');
const { ValidationError, ConflictError, NotFoundError } = require('../exceptions');
const PlanService = require('./PlanService');
const { phoneKeyOf } = require('../utils/callKinds');

// "Linked Quick Call Extension": click a number in the browser (Chrome extension or the dashboard) and the
// person's own phone starts dialling it. The phone links itself, then long-polls for commands.
const LINK_FRESH_SECONDS = 90;     // a phone that polled in the last 90 s counts as reachable

const sleep = ms => new Promise(r => setTimeout(r, ms));

class QuickCallService {
  async link(ctx, body) {
    const name = String((body && body.device_name) || '').trim().slice(0, 120);
    if (!name) throw new ValidationError('device_name required');
    await q(
      `INSERT INTO quick_call_devices (user_id, device_name, last_seen_at) VALUES ($1, $2, (NOW() AT TIME ZONE 'UTC'))
       ON CONFLICT (user_id, device_name) DO UPDATE SET last_seen_at = (NOW() AT TIME ZONE 'UTC')`, [parseInt(ctx.userId), name]);
    return { linked: true, device_name: name };
  }

  async unlink(ctx, name) {
    await q('DELETE FROM quick_call_devices WHERE user_id = $1 AND device_name = $2', [parseInt(ctx.userId), String(name || '')]);
    return { linked: false };
  }

  async devices(ctx) {
    const r = await q(
      `SELECT id, device_name, to_char(linked_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS linked_at,
              to_char(last_seen_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
              COALESCE(last_seen_at > (NOW() AT TIME ZONE 'UTC') - make_interval(secs => $2), false) AS online
         FROM quick_call_devices WHERE user_id = $1 ORDER BY last_seen_at DESC NULLS LAST`, [parseInt(ctx.userId), LINK_FRESH_SECONDS]);
    return r.rows;
  }

  // Browser side: ask the person's phone to dial.
  async dial(ctx, body) {
    await PlanService.assert('quick_call_extension');
    const number = String((body && body.number) || '').trim();
    if (phoneKeyOf(number).length < 6 || !/^[+\d\s().-]{6,30}$/.test(number)) throw new ValidationError('that does not look like a phone number');
    const online = (await this.devices(ctx)).filter(d => d.online);
    if (!online.length) throw new ConflictError('No linked phone is online. On the phone open Levoy → More → Linked Quick Call Extension and switch it on.');
    // anything older than two minutes is stale: do not let a forgotten command dial hours later
    await q(`DELETE FROM quick_call_commands WHERE user_id = $1 AND delivered_at IS NULL AND created_at < (NOW() AT TIME ZONE 'UTC') - interval '2 minutes'`, [parseInt(ctx.userId)]);
    const r = await q(
      `INSERT INTO quick_call_commands (user_id, phone_number, name, source) VALUES ($1, $2, $3, $4) RETURNING id`,
      [parseInt(ctx.userId), number, body.name ? String(body.name).slice(0, 120) : null, String(body.source || 'browser').slice(0, 30)]);
    return { id: r.rows[0].id, queued: true, phones_online: online.length };
  }

  // Phone side: wait up to `waitSeconds` for a command, then return it (and mark it delivered).
  async pending(ctx, query, aborted) {
    const name = String((query && query.device_name) || '').trim();
    if (!name) throw new ValidationError('device_name required');
    const wait = Math.min(Math.max(parseInt(query.wait) || 0, 0), 25);
    const uid = parseInt(ctx.userId);
    const known = await q('SELECT 1 FROM quick_call_devices WHERE user_id = $1 AND device_name = $2', [uid, name]);
    if (!known.rows.length) throw new NotFoundError('This phone is not linked');
    const deadline = Date.now() + wait * 1000;
    for (;;) {
      await q(`UPDATE quick_call_devices SET last_seen_at = (NOW() AT TIME ZONE 'UTC') WHERE user_id = $1 AND device_name = $2`, [uid, name]);
      const r = await q(
        `UPDATE quick_call_commands SET delivered_at = (NOW() AT TIME ZONE 'UTC')
          WHERE id IN (SELECT id FROM quick_call_commands WHERE user_id = $1 AND delivered_at IS NULL
                          AND created_at > (NOW() AT TIME ZONE 'UTC') - interval '2 minutes' ORDER BY id LIMIT 5)
          RETURNING id, phone_number, name`, [uid]);
      if (r.rows.length || Date.now() >= deadline || (aborted && aborted())) return { commands: r.rows };
      await sleep(1000);
    }
  }
}

module.exports = new QuickCallService();
