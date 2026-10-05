'use strict';

const { pool, q } = require('../config/db');
const { ValidationError, NotFoundError, ForbiddenError } = require('../exceptions');
const { visibleSql } = require('../utils/leadAccess');
const SimService = require('./SimService');

const callJson = c => ({
  id: c.id, phone_number: c.phone_number, direction: c.direction, status: c.status,
  duration_seconds: c.duration_seconds, timestamp: c.timestamp, caller_id: c.caller_id,
  notes: c.notes, is_pinned: c.is_pinned, recording_path: c.recording_path,
});

// Which SIM (or WhatsApp) a call came from. Optional: older app builds send neither.
function simOf(e) {
  const source = e.source === 'whatsapp' ? 'whatsapp' : 'sim';
  if (e.source !== undefined && e.source !== null && e.source !== 'sim' && e.source !== 'whatsapp') throw new ValidationError("source must be 'sim' or 'whatsapp'");
  let slot = null;
  if (source === 'sim' && e.sim_slot !== undefined && e.sim_slot !== null && e.sim_slot !== '') {
    slot = parseInt(e.sim_slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 4) throw new ValidationError('sim_slot must be 1–4');
  }
  return { source, slot, label: e.sim_label ? String(e.sim_label).trim().slice(0, 100) || null : null };
}

class CallService {
  async create(ctx, body) {
    if (!body.phone_number) throw new ValidationError('phone_number required');
    const ts = body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString();
    const sim = simOf(body);
    const r = await q(
      `INSERT INTO call_events (user_id,phone_number,direction,status,duration_seconds,timestamp,caller_id,notes,is_pinned,recording_path,source,sim_slot,sim_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [ctx.userId, body.phone_number, body.direction || 'outgoing', body.status || 'connected',
        body.duration_seconds ?? body.duration ?? 0, ts, body.caller_id || null, body.notes || null,
        body.is_pinned || false, body.recording_path || null, sim.source, sim.slot, sim.label]);
    if (sim.slot) await SimService.noteSeen(parseInt(ctx.userId), [{ slot: sim.slot, label: sim.label }]);
    return callJson(r.rows[0]);
  }

  // Bulk ingestion from the Android app: one INSERT with N value tuples.
  async batch(ctx, body) {
    if (!body.events || !Array.isArray(body.events) || body.events.length === 0) throw new ValidationError('events required');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const params = [];
      const values = [];
      const now = new Date().toISOString();
      const COLS = 12;
      const seen = new Map();
      for (let i = 0; i < body.events.length; i++) {
        const e = body.events[i];
        const ts = e.timestamp ? new Date(e.timestamp).toISOString() : now;
        const sim = simOf(e);
        if (sim.slot && !seen.has(sim.slot)) seen.set(sim.slot, sim.label);
        values.push('(' + Array.from({ length: COLS }, (_, k) => `$${k + 1 + i * COLS}`).join(',') + ')');
        params.push(ctx.userId, e.phone_number || '', e.direction || 'outgoing', e.status || 'connected',
          e.duration_seconds ?? e.duration ?? 0, ts, e.caller_id || null, e.notes || null, e.is_pinned || false,
          sim.source, sim.slot, sim.label);
      }
      const r = await client.query(
        `INSERT INTO call_events (user_id,phone_number,direction,status,duration_seconds,timestamp,caller_id,notes,is_pinned,source,sim_slot,sim_label)
         VALUES ${values.join(',')} RETURNING id`, params);
      const ids = r.rows.map(x => x.id);
      await client.query('COMMIT');
      await SimService.noteSeen(parseInt(ctx.userId), [...seen].map(([slot, label]) => ({ slot, label })));
      return { received: ids.length, ids };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }

  // Fill in what an earlier upload lacked (a saved name that was not readable then, the SIM slot) for the
  // caller's OWN calls, matched on number + second. Never overwrites a value that is already there.
  async backfill(ctx, body) {
    if (!body.events || !Array.isArray(body.events) || body.events.length === 0) throw new ValidationError('events required');
    if (body.events.length > 2000) throw new ValidationError('at most 2000 events per request');
    const uid = parseInt(ctx.userId);
    let updated = 0;
    for (const e of body.events) {
      if (!e.phone_number || !e.timestamp || Number.isNaN(new Date(e.timestamp).getTime())) continue;
      const sim = simOf(e);
      const r = await q(
        `UPDATE call_events SET
            caller_id = COALESCE(NULLIF(btrim(caller_id), ''), $3),
            sim_slot = COALESCE(sim_slot, $4), sim_label = COALESCE(sim_label, $5)
          WHERE user_id = $1 AND phone_number = $2 AND date_trunc('second', timestamp) = date_trunc('second', $6::timestamp)
            AND ((caller_id IS NULL OR btrim(caller_id) = '') AND $3::text IS NOT NULL OR (sim_slot IS NULL AND $4::int IS NOT NULL))`,
        [uid, String(e.phone_number).slice(0, 50), e.caller_id ? String(e.caller_id).slice(0, 255) : null, sim.slot, sim.label, new Date(e.timestamp).toISOString()]);
      updated += r.rowCount;
    }
    return { received: body.events.length, updated };
  }

  async list(ctx, query) {
    const conds = [];
    const params = [];
    const add = (sql, v) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
    if (ctx.role === 'agent') add('user_id = ?', ctx.userId);
    if (query.direction) add('direction = ?', query.direction);
    if (query.status) add('status = ?', query.status);
    if (query.phone) add('phone_number ILIKE ?', `%${query.phone}%`);
    if (query.date_from) add('timestamp >= ?', new Date(query.date_from).toISOString());
    if (query.date_to) add('timestamp <= ?', new Date(query.date_to).toISOString());
    if (query.pinned !== undefined) add('is_pinned = ?', query.pinned === 'true');

    const limit = Math.min(Math.max(parseInt(query.limit) || 100, 1), 1000);
    const offset = Math.max(parseInt(query.offset) || 0, 0);
    const where = (conds.length ? ' WHERE ' + conds.join(' AND ') : '')
      + ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    // recording_count is a correlated subquery rather than a join so the call list
    // stays one row per call (a LEFT JOIN would duplicate a call with several
    // recordings and break the LIMIT window).
    const r = await q(
      `SELECT id,phone_number,direction,status,duration_seconds,timestamp,caller_id,notes,is_pinned,recording_path,
              (recording_path IS NOT NULL) AS has_recording_path,
              (SELECT count(*)::int FROM call_recordings cr WHERE cr.call_id = call_events.id) AS recording_count
         FROM call_events${where}`, params);
    return r.rows.map(c => ({
      ...callJson(c),
      // has_recording is true if EITHER a file is attached or the recordings table
      // has a row (a call can have recordings whose legacy pointer was never written).
      has_recording: c.has_recording_path || c.recording_count > 0,
      recording_count: c.recording_count,
    }));
  }

  // Dashboard numbers. An agent sees their own calls; managers/admins the whole book.
  async stats(ctx) {
    const today = new Date();
    const ts = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const te = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
    const isAgent = ctx.role === 'agent';

    const base = isAgent
      ? 'FROM call_events WHERE timestamp >= $2 AND timestamp < $3 AND user_id = $1'
      : 'FROM call_events WHERE timestamp >= $1 AND timestamp < $2';
    const bp = isAgent ? [ctx.userId, ts, te] : [ts, te];

    const tr = await q(`SELECT COUNT(*) as total, COALESCE(SUM(duration_seconds),0) as dur, COUNT(DISTINCT phone_number) as uniq ${base}`, bp);
    const tRow = tr.rows[0];

    const breakdown = await Promise.all([
      q(`SELECT COUNT(*) ${base} AND direction = 'incoming'`, bp),
      q(`SELECT COUNT(*) ${base} AND direction = 'outgoing'`, bp),
      q(`SELECT COUNT(*) ${base} AND status = 'missed'`, bp),
      q(`SELECT COUNT(*) ${base} AND status = 'rejected'`, bp),
      q(`SELECT COUNT(*) ${base} AND status = 'connected'`, bp),
    ]);

    const allR = await q(
      isAgent ? 'SELECT COUNT(*), AVG(duration_seconds) FROM call_events WHERE user_id = $1' : 'SELECT COUNT(*), AVG(duration_seconds) FROM call_events',
      isAgent ? [ctx.userId] : []);
    const totalAll = parseInt(allR.rows[0].count) || 0;
    const avgDur = parseFloat(allR.rows[0].avg) || 0;

    // Leads: an agent counts the leads they may see (created, assigned or collaborating).
    const lp = [];
    const scope = visibleSql(ctx, 'l', lp);
    const leadsR = await q(`SELECT COUNT(*) FROM leads l WHERE 1=1${scope}`, lp);
    const convR = await q(`SELECT COUNT(*) FROM leads l WHERE l.status = 'converted'${scope}`, lp);

    const tR = isAgent
      ? await q('SELECT COUNT(*) FROM team_members WHERE user_id = $1', [ctx.userId])
      : await q('SELECT COUNT(*) FROM team_members');

    return {
      total_calls_today: parseInt(tRow.total) || 0,
      incoming_today: parseInt(breakdown[0].rows[0].count) || 0,
      outgoing_today: parseInt(breakdown[1].rows[0].count) || 0,
      missed_today: parseInt(breakdown[2].rows[0].count) || 0,
      rejected_today: parseInt(breakdown[3].rows[0].count) || 0,
      connected_today: parseInt(breakdown[4].rows[0].count) || 0,
      total_duration_today: parseInt(tRow.dur) || 0,
      unique_contacts_today: parseInt(tRow.uniq) || 0,
      total_calls_all: totalAll,
      total_leads: parseInt(leadsR.rows[0].count) || 0,
      converted_leads: parseInt(convR.rows[0].count) || 0,
      team_members: parseInt(tR.rows[0].count) || 0,
      avg_call_duration: avgDur,
    };
  }

  async assertOwnCall(ctx, callId) {
    if (ctx.role !== 'agent') return;
    const c = await q('SELECT user_id FROM call_events WHERE id = $1', [callId]);
    if (c.rows.length === 0) throw new NotFoundError('Not found');
    if (c.rows[0].user_id !== parseInt(ctx.userId)) throw new ForbiddenError('Not yours');
  }

  async setPin(ctx, callId, body, query) {
    await this.assertOwnCall(ctx, callId);
    const pinned = body.is_pinned !== undefined ? body.is_pinned : query.pinned;
    const r = await q('UPDATE call_events SET is_pinned = $1 WHERE id = $2 RETURNING id, is_pinned',
      [pinned === true || pinned === 'true', callId]);
    if (r.rows.length === 0) throw new NotFoundError('Not found');
    return { id: r.rows[0].id, is_pinned: r.rows[0].is_pinned };
  }

  async setNotes(ctx, callId, body, query) {
    await this.assertOwnCall(ctx, callId);
    const notes = body.notes !== undefined ? body.notes : query.notes;
    const r = await q('UPDATE call_events SET notes = $1 WHERE id = $2 RETURNING id, notes', [notes, callId]);
    if (r.rows.length === 0) throw new NotFoundError('Not found');
    return { id: r.rows[0].id, notes: r.rows[0].notes };
  }
}

module.exports = new CallService();
