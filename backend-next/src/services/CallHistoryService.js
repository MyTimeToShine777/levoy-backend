'use strict';

const { q, tx } = require('../config/db');
const { ValidationError, NotFoundError, ForbiddenError } = require('../exceptions');
const PlanService = require('./PlanService');
const WorkspaceSettingsService = require('./WorkspaceSettingsService');
const { KIND_SQL, TABS, TAB_WHERE, TS_ISO_SQL, SAVED_CONTACT_SQL, phoneKeyOf } = require('../utils/callKinds');

const isoOrNull = v => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

class CallHistoryService {
  // The WHERE conditions every call view shares (list, tab counts, analytics, exports, contacts).
  // The tab itself is NOT part of it: counts for every tab are taken under the same filters.
  async filters(ctx, query) {
    const conds = [];
    const params = [];
    const add = (sql, v) => { params.push(v); conds.push(sql.replace(/\?/g, `$${params.length}`)); };

    // An agent only ever sees their own calls; managers and admins see the team and may narrow to one person.
    if (ctx.role === 'agent') add('c.user_id = ?', parseInt(ctx.userId));
    else if (query.user_id) {
      const uid = parseInt(query.user_id);
      if (!Number.isInteger(uid)) throw new ValidationError('user_id must be an integer');
      add('c.user_id = ?', uid);
    }

    const from = isoOrNull(query.date_from), to = isoOrNull(query.date_to);
    if (query.date_from && !from) throw new ValidationError('date_from is not a valid date');
    if (query.date_to && !to) throw new ValidationError('date_to is not a valid date');
    // Timestamps are UTC wall-clock in a timestamp-without-zone column; the cast drops the Z consistently.
    if (from) add('c.timestamp >= ?::timestamp', from);
    if (to) add('c.timestamp <= ?::timestamp', to);

    if (query.search) {
      const s = String(query.search).trim();
      if (s) {
        const digits = s.replace(/\D/g, '');
        params.push(`%${s}%`);
        const like = `$${params.length}`;
        let sql = `(c.phone_number ILIKE ${like} OR c.caller_id ILIKE ${like} OR c.notes ILIKE ${like}`;
        if (digits.length >= 3) { params.push(`%${digits}%`); sql += ` OR c.phone_key LIKE $${params.length}`; }
        conds.push(sql + ')');
      }
    }

    // SIM / WhatsApp
    const sim = query.sim;
    if (sim && sim !== 'all') {
      if (sim === 'whatsapp') conds.push("c.source = 'whatsapp'");
      else if (/^\d+$/.test(String(sim))) { add("c.source = 'sim' AND c.sim_slot = ?", parseInt(sim)); }
      else throw new ValidationError("sim must be 'all', 'whatsapp' or a slot number");
    }

    if (query.contact_type === 'saved') conds.push(SAVED_CONTACT_SQL);
    else if (query.contact_type === 'unsaved') conds.push(`NOT ${SAVED_CONTACT_SQL}`);

    if (query.pinned !== undefined && query.pinned !== '') add('c.is_pinned = ?', String(query.pinned) === 'true');

    // Premium Plus filters
    if (query.notes === 'with' || query.notes === 'without') {
      await PlanService.assert('call_notes_tags');
      conds.push(query.notes === 'with' ? "(c.notes IS NOT NULL AND btrim(c.notes) <> '')" : "(c.notes IS NULL OR btrim(c.notes) = '')");
    }
    if (query.tag_id) {
      await PlanService.assert('call_notes_tags');
      const tid = parseInt(query.tag_id);
      if (!Number.isInteger(tid)) throw new ValidationError('tag_id must be an integer');
      add('EXISTS (SELECT 1 FROM call_event_tags ct WHERE ct.call_id = c.id AND ct.tag_id = ?)', tid);
    }
    if (query.group_id) {
      await PlanService.assert('group_filter_export');
      const gid = parseInt(query.group_id);
      if (!Number.isInteger(gid)) throw new ValidationError('group_id must be an integer');
      add('c.phone_key IN (SELECT m.phone_key FROM contact_group_members m WHERE m.group_id = ?)', gid);
    }
    return { conds, params };
  }

  // What one call costs, in SQL, when the workspace has a billing cycle set up (Premium Plus).
  async costSql() {
    if (!(await PlanService.has('billing_cycle'))) return null;
    const s = await WorkspaceSettingsService.all();
    if (!s.billing_enabled) return null;
    const pulse = Math.max(1, Number(s.billing_pulse_seconds) || 60);
    const perPulse = (Number(s.billing_rate_per_minute) || 0) * pulse / 60;
    const incoming = s.billing_charge_incoming ? '' : "AND c.direction = 'outgoing'";
    return {
      sql: `CASE WHEN COALESCE(c.duration_seconds, 0) > 0 ${incoming} THEN ROUND(CEIL(c.duration_seconds::numeric / ${pulse}) * ${perPulse}, 2) END`,
      settings: s,
    };
  }

  async tabCounts(f) {
    const where = f.conds.length ? 'WHERE ' + f.conds.join(' AND ') : '';
    const cols = TABS.map(t => `COUNT(*) FILTER (WHERE ${TAB_WHERE[t]})::int AS ${t}`).join(', ');
    const r = await q(`SELECT ${cols} FROM call_events c ${where}`, f.params);
    return r.rows[0];
  }

  async list(ctx, query) {
    const tab = TABS.includes(query.tab) ? query.tab : 'all';
    const f = await this.filters(ctx, query);
    const cost = await this.costSql();
    const grouped = tab === 'never_attended' || tab === 'not_pickup';
    const limit = Math.min(Math.max(parseInt(query.limit) || (grouped ? 300 : 50), 1), 500);
    const offset = Math.max(parseInt(query.offset) || 0, 0);

    const where = 'WHERE ' + [...f.conds, TAB_WHERE[tab]].join(' AND ');
    const params = [...f.params, limit, offset];
    const rows = (await q(
      `SELECT c.id, c.phone_number, c.phone_key, c.caller_id AS contact_name, c.direction, c.status,
              (${KIND_SQL}) AS kind, COALESCE(c.duration_seconds, 0) AS duration_seconds, ${TS_ISO_SQL} AS timestamp,
              c.sim_slot, c.sim_label, c.source, c.notes, COALESCE(c.is_pinned, false) AS is_pinned,
              (c.recording_path IS NOT NULL OR EXISTS (SELECT 1 FROM call_recordings r WHERE r.call_id = c.id)) AS has_recording,
              c.user_id, u.name AS user_name,
              (SELECT json_build_object('id', l.id, 'name', COALESCE(NULLIF(l.pharmacy_name, ''), l.name))
                 FROM leads l WHERE l.phone_clean = c.phone_key AND l.deleted_at IS NULL AND l.merged_into_lead_id IS NULL ORDER BY l.id LIMIT 1) AS lead,
              COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
                          FROM call_event_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.call_id = c.id), '[]'::json) AS tags
              ${cost ? `, ${cost.sql} AS cost` : ''}
         FROM call_events c LEFT JOIN users u ON u.id = c.user_id
         ${where}
        ORDER BY c.timestamp DESC, c.id DESC
        LIMIT $${f.params.length + 1} OFFSET $${f.params.length + 2}`, params)).rows;

    const counts = await this.tabCounts(f);

    // The SIMs seen in this scope, for the filter (plus whether any WhatsApp calls exist).
    const fNoSim = await this.filters(ctx, { ...query, sim: undefined });
    const sims = (await q(
      `SELECT c.source, c.sim_slot, MAX(c.sim_label) AS sim_label, COUNT(*)::int AS calls
         FROM call_events c ${fNoSim.conds.length ? 'WHERE ' + fNoSim.conds.join(' AND ') : ''}
        GROUP BY c.source, c.sim_slot ORDER BY c.source, c.sim_slot`, fNoSim.params)).rows;

    const out = {
      tab, counts, total: counts[tab], limit, offset, rows,
      sims: sims.map(s => ({ source: s.source, slot: s.sim_slot, label: s.sim_label, calls: s.calls })),
      cost_enabled: !!cost,
      currency: cost ? cost.settings.billing_currency : null,
    };

    if (grouped) {
      // "Never attended" and "Not pickup by client" are about PEOPLE: one card per number with every attempt.
      const by = new Map();
      for (const r of rows) {
        const key = `${r.user_id}:${r.phone_key}`;
        if (!by.has(key)) by.set(key, { phone_number: r.phone_number, phone_key: r.phone_key, contact_name: r.contact_name, user_name: r.user_name, attempts: [] });
        const g = by.get(key);
        if (!g.contact_name && r.contact_name) g.contact_name = r.contact_name;
        g.attempts.push({ id: r.id, timestamp: r.timestamp });
      }
      out.groups = [...by.values()].map(g => ({ ...g, count: g.attempts.length }));
    }
    return out;
  }

  async assertCallAccess(ctx, callId) {
    const r = await q('SELECT id, user_id FROM call_events WHERE id = $1', [callId]);
    if (!r.rows.length) throw new NotFoundError('Call not found');
    if (ctx.role === 'agent' && r.rows[0].user_id !== parseInt(ctx.userId)) throw new ForbiddenError('Not yours');
    return r.rows[0];
  }

  // Premium Plus: a note and tags after the call. `tags` are NAMES (created on first use) or `tag_ids`.
  async annotate(ctx, callId, body) {
    await PlanService.assert('call_notes_tags');
    await this.assertCallAccess(ctx, callId);
    const b = body || {};
    return tx(async ({ q: tq }) => {
      if (b.notes !== undefined) {
        const notes = b.notes === null ? null : String(b.notes).slice(0, 2000);
        await tq('UPDATE call_events SET notes = $1 WHERE id = $2', [notes && notes.trim() ? notes : null, callId]);
      }
      if (Array.isArray(b.tags) || Array.isArray(b.tag_ids)) {
        const ids = new Set((b.tag_ids || []).map(Number).filter(Number.isInteger));
        for (const raw of (b.tags || [])) {
          const name = String(raw || '').trim().slice(0, 60);
          if (!name) continue;
          const t = await tq(
            `INSERT INTO tags (name, created_by) VALUES ($1, $2)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [name, parseInt(ctx.userId)]);
          ids.add(t.rows[0].id);
        }
        if (ids.size > 12) throw new ValidationError('a call can carry at most 12 tags');
        await tq('DELETE FROM call_event_tags WHERE call_id = $1', [callId]);
        for (const id of ids) await tq('INSERT INTO call_event_tags (call_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [callId, id]);
      }
      const r = await tq(
        `SELECT c.id, c.notes,
                COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
                            FROM call_event_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.call_id = c.id), '[]'::json) AS tags
           FROM call_events c WHERE c.id = $1`, [callId]);
      return r.rows[0];
    });
  }

  // The team members whose calls the caller may look at (an agent only sees themselves).
  async people(ctx) {
    const params = [];
    let where = '';
    if (ctx.role === 'agent') { params.push(parseInt(ctx.userId)); where = 'WHERE u.id = $1'; }
    const r = await q(
      `SELECT u.id, u.name, u.role, COUNT(c.id)::int AS calls
         FROM users u LEFT JOIN call_events c ON c.user_id = u.id ${where}
        GROUP BY u.id HAVING COUNT(c.id) > 0 ORDER BY u.name`, params);
    return r.rows;
  }

  // Tags that exist, with how many calls carry each (for the tag filter and the tag picker).
  async tags() {
    const r = await q(
      `SELECT t.id, t.name, t.color, COUNT(ct.call_id)::int AS calls
         FROM tags t LEFT JOIN call_event_tags ct ON ct.tag_id = t.id
        GROUP BY t.id ORDER BY calls DESC, t.name`);
    return r.rows;
  }
}

module.exports = new CallHistoryService();
module.exports.phoneKeyOf = phoneKeyOf;
