'use strict';

const { pool, q } = require('../config/db');
const { ValidationError, NotFoundError, ForbiddenError } = require('../exceptions');
const { visibleSql } = require('../utils/leadAccess');
const SimService = require('./SimService');
const { phoneKey, splitByLeadNumbers } = require('../utils/phoneKey');
const WorkspaceSettingsService = require('./WorkspaceSettingsService');
const { toE164 } = require('../utils/phoneFormat');
const LeadScoringService = require('./LeadScoringService');
const { normalizeCallStatus, dropDuplicates, leadsTouchedBy, durationOf, directionOf, DUPLICATE_WINDOW_MS } = require('../utils/callIngest');

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

// Callio only tracks calls to the leads assigned to a person. The phone app already sends only those, but an older app (or a
// stray client) may send the whole call log, so the server enforces it too. Set CALLS_LEAD_ONLY=false to switch this off.
const leadOnly = () => !['0', 'false', 'off', 'no'].includes(String(process.env.CALLS_LEAD_ONLY || 'true').trim().toLowerCase());

// Last-10-digit keys of the leads assigned to this user.
async function assignedLeadKeys(userId) {
  const r = await q(
    `SELECT DISTINCT right(regexp_replace(phone, '\\D', '', 'g'), 10) AS k
       FROM leads
      WHERE assigned_to = $1 AND deleted_at IS NULL AND merged_into_lead_id IS NULL AND phone IS NOT NULL`,
    [parseInt(userId)]);
  return new Set(r.rows.map(x => x.k).filter(Boolean));
}

// Calls this user already has around the given moments, so a call uploaded twice (a retry, or the same call from both the
// live recorder and the call-log sync) is stored once.
async function storedCallsBetween(userId, fromMs, toMs) {
  const r = await q(
    // The column is a plain timestamp that holds UTC clock time; hand it back as an explicit UTC string so the comparison
    // does not depend on the time zone the server happens to run in.
    `SELECT id, phone_key, direction, duration_seconds,
            to_char(timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS') || 'Z' AS timestamp
       FROM call_events
      WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3`,
    [parseInt(userId), new Date(fromMs - DUPLICATE_WINDOW_MS).toISOString(), new Date(toMs + DUPLICATE_WINDOW_MS).toISOString()]);
  return r.rows;
}

// A call to one of your leads counts as having contacted that lead, so keep the lead in step with the call log instead of
// waiting for someone to press "Mark contacted":
//   • "last contacted" only ever moves forward;
//   • a lead still showing "(Not called yet)" becomes "Called" (we spoke) or "Not Answered" (we rang, nobody spoke).
//     A status the agent has already chosen is never overwritten.
// The lead's score, tier and next action are recalculated, as they are after any edit of the call fields.
async function touchLeads(userId, events) {
  const touched = leadsTouchedBy(events);
  if (touched.size === 0) return;
  if ([...touched.values()].some(s => s.outcome === 'Called')) {
    // The "Called" status is not in the original sheet; make sure its rule exists so the lead is not scored as closed.
    await q(`INSERT INTO lead_status_rules (call_status, status_key, base_priority, active_pipeline, win_prob, next_action, reached, interested_plus, demo_plus, sort_order)
             VALUES ('Called', 'called', 30, true, 0.02, 'Record the outcome of the call', true, false, false, 10)
             ON CONFLICT (status_key) DO NOTHING`);
  }
  const NO_STATUS_YET = `lower(regexp_replace(COALESCE(call_status, ''), '[^a-zA-Z0-9]+', '', 'g')) IN ('', 'notcalledyet')`;
  for (const [key, s] of touched) {
    const at = new Date(s.latest).toISOString();
    const r = await q(
      `UPDATE leads SET
              last_contacted_at   = CASE WHEN last_contacted_at IS NULL OR last_contacted_at < $3::timestamp THEN $3::timestamp ELSE last_contacted_at END,
              call_status         = CASE WHEN $4::text IS NOT NULL AND ${NO_STATUS_YET} THEN $4::text ELSE call_status END,
              call_attempted_date = CASE WHEN $4::text IS NOT NULL AND ${NO_STATUS_YET} THEN $3::timestamp::date ELSE call_attempted_date END,
              updated_at = NOW()
        WHERE assigned_to = $1 AND deleted_at IS NULL AND merged_into_lead_id IS NULL
          AND right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $2
        RETURNING id`,
      [parseInt(userId), key, at, s.outcome]);
    for (const row of r.rows) {
      try { await LeadScoringService.rescoreLead(row.id); } catch (e) { console.error(`rescore lead ${row.id} after call failed:`, e.message); }
    }
  }
}

class CallService {
  async create(ctx, body) {
    if (!body.phone_number) throw new ValidationError('phone_number required');
    if (leadOnly() && !(await assignedLeadKeys(ctx.userId)).has(phoneKey(body.phone_number))) return { id: null, ignored: true, reason: 'not_an_assigned_lead' };
    const ts = body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString();
    const sim = simOf(body);
    const duration = durationOf(body);
    const direction = directionOf(body);
    const status = normalizeCallStatus(body.status, direction, duration);
    const number = toE164(body.phone_number, await WorkspaceSettingsService.countryCode()) || body.phone_number;
    const stored = await storedCallsBetween(ctx.userId, new Date(ts).getTime(), new Date(ts).getTime());
    const { duplicates } = dropDuplicates([{ ...body, timestamp: ts }], stored);
    if (duplicates) {                                                   // already have it: hand back the stored call
      const key = phoneKey(body.phone_number);
      const have = stored.find(s => s.phone_key === key && s.direction === direction && durationOf(s) === duration);
      if (have) {
        const row = await q('SELECT * FROM call_events WHERE id = $1', [have.id]);
        return { ...callJson(row.rows[0]), duplicate: true };
      }
    }
    const r = await q(
      `INSERT INTO call_events (user_id,phone_number,direction,status,duration_seconds,timestamp,caller_id,notes,is_pinned,recording_path,source,sim_slot,sim_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [ctx.userId, number, direction, status,
        duration, ts, body.caller_id || null, body.notes || null,
        body.is_pinned || false, body.recording_path || null, sim.source, sim.slot, sim.label]);
    if (sim.slot) await SimService.noteSeen(parseInt(ctx.userId), [{ slot: sim.slot, label: sim.label }]);
    await touchLeads(ctx.userId, [{ ...body, timestamp: ts }]);
    return callJson(r.rows[0]);
  }

  // Bulk ingestion from the Android app: one INSERT with N value tuples.
  async batch(ctx, body) {
    if (!body.events || !Array.isArray(body.events) || body.events.length === 0) throw new ValidationError('events required');
    let events = body.events;
    let ignored = 0;
    if (leadOnly()) {
      ({ kept: events, ignored } = splitByLeadNumbers(events, await assignedLeadKeys(ctx.userId)));
      if (events.length === 0) return { received: 0, ignored, ids: [] };      // nothing here is a call to one of their leads
    }
    // Drop calls this user already has (or that repeat inside this upload) before inserting.
    const times = events.map(e => (e.timestamp ? new Date(e.timestamp).getTime() : Date.now())).filter(Number.isFinite);
    const stored = times.length ? await storedCallsBetween(ctx.userId, Math.min(...times), Math.max(...times)) : [];
    const deduped = dropDuplicates(events, stored);
    events = deduped.kept;
    const duplicates = deduped.duplicates;
    if (events.length === 0) return { received: 0, ignored, duplicates, ids: [] };
    const countryCode = await WorkspaceSettingsService.countryCode();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const params = [];
      const values = [];
      const now = new Date().toISOString();
      const COLS = 12;
      const seen = new Map();
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const ts = e.timestamp ? new Date(e.timestamp).toISOString() : now;
        const sim = simOf(e);
        if (sim.slot && !seen.has(sim.slot)) seen.set(sim.slot, sim.label);
        values.push('(' + Array.from({ length: COLS }, (_, k) => `$${k + 1 + i * COLS}`).join(',') + ')');
        const duration = durationOf(e);
        const direction = directionOf(e);
        params.push(ctx.userId, toE164(e.phone_number, countryCode) || e.phone_number || '', direction, normalizeCallStatus(e.status, direction, duration),
          duration, ts, e.caller_id || null, e.notes || null, e.is_pinned || false,
          sim.source, sim.slot, sim.label);
      }
      const r = await client.query(
        `INSERT INTO call_events (user_id,phone_number,direction,status,duration_seconds,timestamp,caller_id,notes,is_pinned,source,sim_slot,sim_label)
         VALUES ${values.join(',')} RETURNING id`, params);
      const ids = r.rows.map(x => x.id);
      await client.query('COMMIT');
      await SimService.noteSeen(parseInt(ctx.userId), [...seen].map(([slot, label]) => ({ slot, label })));
      await touchLeads(ctx.userId, events);
      return { received: ids.length, ignored, duplicates, ids };
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
