'use strict';

const { q } = require('../config/db');
const { ValidationError, NotFoundError, ForbiddenError } = require('../exceptions');

const METHODS = ['call_log', 'call', 'skip'];
const cleanNumber = v => String(v || '').replace(/[^\d+]/g, '').slice(0, 20);

// The SIM cards a person's phone reports (slot 1, slot 2 ...), with the number on each and whether it was verified.
// Verification mirrors the competitor's three ways: from the call log, by placing a test call, or skipped.
class SimService {
  async list(ctx, userId) {
    const uid = this.target(ctx, userId);
    const r = await q(
      `SELECT slot, label, number, verified, verify_method,
              to_char(verified_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS verified_at,
              (SELECT COUNT(*)::int FROM call_events c WHERE c.user_id = s.user_id AND c.source = 'sim' AND c.sim_slot = s.slot) AS calls
         FROM user_sims s WHERE user_id = $1 ORDER BY slot`, [uid]);
    return r.rows;
  }

  target(ctx, userId) {
    const uid = userId ? parseInt(userId) : parseInt(ctx.userId);
    if (!Number.isInteger(uid)) throw new ValidationError('user_id must be an integer');
    if (uid !== parseInt(ctx.userId) && ctx.role === 'agent') throw new ForbiddenError('Not yours');
    return uid;
  }

  async upsert(ctx, slot, body, userId) {
    const uid = this.target(ctx, userId);
    const s = parseInt(slot);
    if (!Number.isInteger(s) || s < 1 || s > 4) throw new ValidationError('slot must be 1–4');
    const b = body || {};
    const number = b.number === undefined ? undefined : cleanNumber(b.number);
    if (number !== undefined && number && number.replace(/\D/g, '').length < 6) throw new ValidationError('number looks too short');
    const label = b.label === undefined ? undefined : String(b.label).trim().slice(0, 100) || null;

    let verified, method;
    if (b.verify_method !== undefined) {
      if (!METHODS.includes(b.verify_method)) throw new ValidationError(`verify_method must be one of ${METHODS.join(', ')}`);
      method = b.verify_method;
      // "skip" records that the person chose not to verify; the other two confirm the number.
      verified = method !== 'skip';
      if (verified && !number && number !== undefined) throw new ValidationError('enter the number first');
    }

    // Changing the number invalidates an earlier verification.
    const prev = (await q('SELECT number FROM user_sims WHERE user_id = $1 AND slot = $2', [uid, s])).rows[0];
    const numberChanged = prev && number !== undefined && (prev.number || '') !== number;

    const r = await q(
      `INSERT INTO user_sims (user_id, slot, label, number, verified, verify_method, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 THEN (NOW() AT TIME ZONE 'UTC') END)
       ON CONFLICT (user_id, slot) DO UPDATE SET
         label = COALESCE($3, user_sims.label),
         number = CASE WHEN $4::text IS NULL THEN user_sims.number ELSE $4 END,
         verified = CASE WHEN $7 THEN false WHEN $6::text IS NOT NULL THEN $5 ELSE user_sims.verified END,
         verify_method = CASE WHEN $7 THEN NULL WHEN $6::text IS NOT NULL THEN $6 ELSE user_sims.verify_method END,
         verified_at = CASE WHEN $7 THEN NULL WHEN $6::text IS NOT NULL AND $5 THEN (NOW() AT TIME ZONE 'UTC') WHEN $6::text IS NOT NULL THEN NULL ELSE user_sims.verified_at END
       RETURNING slot, label, number, verified, verify_method`,
      [uid, s, label === undefined ? null : label, number === undefined ? null : number, verified === true, method || null, !!numberChanged && method === undefined]);
    return r.rows[0];
  }

  // Remember the SIMs a batch of calls came from, so the SIM filter works without any set-up.
  async noteSeen(userId, seen) {
    for (const { slot, label } of seen) {
      if (!Number.isInteger(slot)) continue;
      await q(
        `INSERT INTO user_sims (user_id, slot, label) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, slot) DO UPDATE SET label = COALESCE(user_sims.label, EXCLUDED.label)`, [userId, slot, label || null]);
    }
  }

  async remove(ctx, slot, userId) {
    const uid = this.target(ctx, userId);
    const r = await q('DELETE FROM user_sims WHERE user_id = $1 AND slot = $2 RETURNING slot', [uid, parseInt(slot)]);
    if (!r.rows.length) throw new NotFoundError('SIM not found');
    return { deleted: true, slot: parseInt(slot) };
  }
}

module.exports = new SimService();
