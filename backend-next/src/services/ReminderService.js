'use strict';

const { q } = require('../config/db');
const { ValidationError, NotFoundError } = require('../exceptions');
const { phoneKeyOf } = require('../utils/callKinds');

// "Missed Call Reminder": a note tied to a phone number, optionally with a time. Personal to the person
// who wrote it. When the time arrives it turns into a notification (see fireDue).
class ReminderService {
  async list(ctx, query) {
    const params = [parseInt(ctx.userId)];
    let where = 'r.user_id = $1';
    if (query.done === 'true' || query.done === 'false') { params.push(query.done === 'true'); where += ` AND r.done = $${params.length}`; }
    if (query.phone) { params.push(phoneKeyOf(query.phone)); where += ` AND right(regexp_replace(r.phone_number, '\\D', '', 'g'), 10) = $${params.length}`; }
    const r = await q(
      `SELECT r.id, r.phone_number, r.note, r.done,
              to_char(r.remind_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS remind_at,
              (SELECT btrim(c.caller_id) FROM call_events c WHERE c.phone_key = right(regexp_replace(r.phone_number, '\\D', '', 'g'), 10)
                 AND c.caller_id IS NOT NULL AND btrim(c.caller_id) <> '' ORDER BY c.timestamp DESC LIMIT 1) AS contact_name
         FROM call_reminders r WHERE ${where}
        ORDER BY r.done ASC, r.remind_at ASC NULLS LAST, r.id DESC LIMIT 200`, params);
    return r.rows;
  }

  async create(ctx, body) {
    const phone = String((body && body.phone_number) || '').trim();
    const note = String((body && body.note) || '').trim();
    if (phoneKeyOf(phone).length < 6) throw new ValidationError('phone_number required');
    if (!note) throw new ValidationError('note required');
    let remindAt = null;
    if (body.remind_at) {
      const d = new Date(body.remind_at);
      if (Number.isNaN(d.getTime())) throw new ValidationError('remind_at is not a valid date');
      remindAt = d.toISOString();
    }
    const r = await q(
      `INSERT INTO call_reminders (user_id, phone_number, note, remind_at) VALUES ($1, $2, $3, $4::timestamp)
       RETURNING id, phone_number, note, done, to_char(remind_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS remind_at`,
      [parseInt(ctx.userId), phone, note.slice(0, 500), remindAt]);
    return r.rows[0];
  }

  async update(ctx, id, body) {
    const sets = [], params = [];
    if (body.done !== undefined) { params.push(body.done === true || body.done === 'true'); sets.push(`done = $${params.length}`); }
    if (body.note !== undefined) { const n = String(body.note).trim(); if (!n) throw new ValidationError('note cannot be empty'); params.push(n.slice(0, 500)); sets.push(`note = $${params.length}`); }
    if (body.remind_at !== undefined) {
      if (body.remind_at === null) sets.push('remind_at = NULL, notified_at = NULL');
      else {
        const d = new Date(body.remind_at);
        if (Number.isNaN(d.getTime())) throw new ValidationError('remind_at is not a valid date');
        params.push(d.toISOString()); sets.push(`remind_at = $${params.length}::timestamp, notified_at = NULL`);
      }
    }
    if (!sets.length) throw new ValidationError('nothing to update');
    params.push(id, parseInt(ctx.userId));
    const r = await q(
      `UPDATE call_reminders SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length}
       RETURNING id, phone_number, note, done, to_char(remind_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS remind_at`, params);
    if (!r.rows.length) throw new NotFoundError('Reminder not found');
    return r.rows[0];
  }

  async remove(ctx, id) {
    const r = await q('DELETE FROM call_reminders WHERE id = $1 AND user_id = $2 RETURNING id', [id, parseInt(ctx.userId)]);
    if (!r.rows.length) throw new NotFoundError('Reminder not found');
    return { deleted: true, id };
  }

  // Turn due reminders into notifications, once each. Called whenever the notification list is read.
  async fireDue(userId) {
    const due = await q(
      `UPDATE call_reminders SET notified_at = (NOW() AT TIME ZONE 'UTC')
        WHERE user_id = $1 AND done = false AND notified_at IS NULL AND remind_at IS NOT NULL AND remind_at <= (NOW() AT TIME ZONE 'UTC')
        RETURNING id, phone_number, note`, [userId]);
    for (const r of due.rows) {
      await q(`INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, 'call_reminder', $2, $3, $4)`,
        [userId, `Reminder: ${r.phone_number}`, r.note, JSON.stringify({ reminder_id: r.id, phone_number: r.phone_number })]);
    }
    return due.rows.length;
  }
}

module.exports = new ReminderService();
