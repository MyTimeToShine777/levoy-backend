'use strict';

const { q } = require('../config/db');
const { ValidationError, NotFoundError, ForbiddenError, ConflictError } = require('../exceptions');
const PlanService = require('./PlanService');
const CallHistoryService = require('./CallHistoryService');
const CallAnalyticsService = require('./CallAnalyticsService');
const { KIND_SQL, TS_ISO_SQL, phoneKeyOf } = require('../utils/callKinds');
const { leadPhoneKeySql } = require('../utils/leadPhoneKey');
const { audit } = require('../utils/audit');

const DAY = 86400000;

const BEST_NAME = `(array_agg(btrim(c.caller_id) ORDER BY c.timestamp DESC) FILTER (WHERE c.caller_id IS NOT NULL AND btrim(c.caller_id) <> ''))[1]`;

const keyOrThrow = raw => {
  const k = phoneKeyOf(raw);
  if (k.length < 6) throw new ValidationError('that does not look like a phone number');
  return k;
};

class ContactService {
  // One row per person (last 10 digits), with how much they were called and which groups they sit in.
  async list(ctx, query) {
    const f = await CallHistoryService.filters(ctx, query);
    const where = f.conds.length ? 'WHERE ' + f.conds.join(' AND ') : '';
    const sorts = {
      calls: 'total_calls DESC, last_call DESC', recent: 'last_call DESC', duration: 'total_duration DESC, total_calls DESC',
      name: 'contact_name ASC NULLS LAST, phone_number ASC',
    };
    const order = sorts[query.sort] || sorts.calls;
    const limit = Math.min(Math.max(parseInt(query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(query.offset) || 0, 0);

    const rows = (await q(
      `SELECT c.phone_key, (array_agg(c.phone_number ORDER BY c.timestamp DESC))[1] AS phone_number,
              ${BEST_NAME} AS contact_name,
              COUNT(*)::int AS total_calls, COALESCE(SUM(c.duration_seconds), 0)::int AS total_duration,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'incoming')::int AS incoming,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'outgoing')::int AS outgoing,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) IN ('missed', 'rejected'))::int AS missed,
              to_char(MAX(c.timestamp), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_call,
              MAX(c.timestamp) AS last_call_ts,
              (SELECT json_build_object('id', l.id, 'name', COALESCE(NULLIF(l.pharmacy_name, ''), l.name))
                 FROM leads l WHERE ${leadPhoneKeySql('l')} = c.phone_key AND l.deleted_at IS NULL AND l.merged_into_lead_id IS NULL ORDER BY l.id LIMIT 1) AS lead,
              COALESCE((SELECT json_agg(json_build_object('id', g.id, 'name', g.name, 'color', g.color) ORDER BY g.name)
                          FROM contact_group_members m JOIN contact_groups g ON g.id = m.group_id WHERE m.phone_key = c.phone_key), '[]'::json) AS groups
         FROM call_events c ${where}
        GROUP BY c.phone_key
        ORDER BY ${order}
        LIMIT $${f.params.length + 1} OFFSET $${f.params.length + 2}`, [...f.params, limit, offset])).rows;

    const total = (await q(`SELECT COUNT(DISTINCT c.phone_key)::int AS n FROM call_events c ${where}`, f.params)).rows[0].n;
    return { total, limit, offset, rows: rows.map(({ last_call_ts, ...r }) => r) };
  }

  async scopedFilters(ctx, query, key) {
    const f = await CallHistoryService.filters(ctx, query);
    f.params.push(key);
    f.conds.push(`c.phone_key = $${f.params.length}`);
    return f;
  }

  // Everything about one person: the summary table and donut, the analysis (months, longest call,
  // the day they were called most) and the call history.
  async detail(ctx, rawKey, query) {
    const key = keyOrThrow(rawKey);
    const f = await this.scopedFilters(ctx, query, key);
    const where = 'WHERE ' + f.conds.join(' AND ');
    const tz = parseInt(query.tz) || 0;

    const head = (await q(
      `SELECT ${BEST_NAME} AS contact_name, (array_agg(c.phone_number ORDER BY c.timestamp DESC))[1] AS phone_number,
              to_char(MIN(c.timestamp), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_call, to_char(MAX(c.timestamp), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_call,
              COUNT(*)::int AS total_calls
         FROM call_events c ${where}`, f.params)).rows[0];
    if (!head || !head.total_calls) throw new NotFoundError('No calls with this contact in the selected range');

    const kinds = (await q(
      `SELECT (${KIND_SQL}) AS kind, COUNT(*)::int AS calls, COALESCE(SUM(c.duration_seconds), 0)::int AS duration
         FROM call_events c ${where} GROUP BY 1`, f.params)).rows;
    const k = name => kinds.find(x => x.kind === name) || { calls: 0, duration: 0 };
    const total = { calls: head.total_calls, duration: kinds.reduce((n, x) => n + x.duration, 0) };
    const summary = {
      incoming: k('incoming'), outgoing: k('outgoing'), missed: { calls: k('missed').calls, duration: 0 }, rejected: { calls: k('rejected').calls, duration: 0 }, total,
    };

    const fromMs = new Date(query.date_from || head.first_call).getTime();
    const toMs = new Date(query.date_to || head.last_call).getTime();
    const series = await CallAnalyticsService.series(f, new Date(fromMs).toISOString(), new Date(toMs).toISOString(), tz);

    const longest = (await q(
      `SELECT c.id, (${KIND_SQL}) AS kind, c.duration_seconds, ${TS_ISO_SQL} AS timestamp
         FROM call_events c ${where} ORDER BY c.duration_seconds DESC NULLS LAST LIMIT 1`, f.params)).rows[0];
    const frequent = (await q(
      `SELECT to_char(date_trunc('day', c.timestamp + make_interval(mins => ${tz})), 'YYYY-MM-DD') AS day, COUNT(*)::int AS calls,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'incoming')::int AS incoming, COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'outgoing')::int AS outgoing
         FROM call_events c ${where} GROUP BY 1 ORDER BY calls DESC, day DESC LIMIT 1`, f.params)).rows[0];

    const history = (await q(
      `SELECT c.id, (${KIND_SQL}) AS kind, c.direction, c.status, COALESCE(c.duration_seconds, 0) AS duration_seconds, ${TS_ISO_SQL} AS timestamp,
              c.notes, c.sim_slot, c.sim_label, c.source, u.name AS user_name,
              COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
                          FROM call_event_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.call_id = c.id), '[]'::json) AS tags
         FROM call_events c LEFT JOIN users u ON u.id = c.user_id ${where}
        ORDER BY c.timestamp DESC, c.id DESC LIMIT 300`, f.params)).rows;

    const groups = (await q(
      `SELECT g.id, g.name, g.color FROM contact_group_members m JOIN contact_groups g ON g.id = m.group_id WHERE m.phone_key = $1 ORDER BY g.name`, [key])).rows;
    const lead = (await q(
      `SELECT l.id, COALESCE(NULLIF(l.pharmacy_name, ''), l.name) AS name, l.status, l.tier
         FROM leads l WHERE ${leadPhoneKeySql('l')} = $1 AND l.deleted_at IS NULL AND l.merged_into_lead_id IS NULL ORDER BY l.id LIMIT 1`, [key])).rows[0] || null;

    return {
      contact: { phone_key: key, phone_number: head.phone_number, contact_name: head.contact_name, groups, lead },
      range: { from: head.first_call, to: head.last_call, total_days: Math.max(1, Math.round((toMs - fromMs) / DAY)) },
      summary,
      percentages: ['incoming', 'outgoing', 'missed', 'rejected'].map(n => ({ kind: n, calls: summary[n].calls, pct: total.calls ? Math.round((summary[n].calls / total.calls) * 100) : 0 })),
      analysis: { series, longest_call: longest && longest.duration_seconds > 0 ? longest : null, frequently_talked: frequent || null },
      history,
    };
  }

  // Up to five people side by side: how many calls and how long, by type.
  async compare(ctx, query) {
    const keys = [...new Set(String(query.phones || '').split(',').map(s => phoneKeyOf(s)).filter(s => s.length >= 6))];
    if (!keys.length) throw new ValidationError('phones is required (comma-separated, at most 5)');
    if (keys.length > 5) throw new ValidationError('you can compare at most 5 contacts');
    const f = await CallHistoryService.filters(ctx, query);
    f.params.push(keys);
    f.conds.push(`c.phone_key = ANY($${f.params.length})`);
    const rows = (await q(
      `SELECT c.phone_key, ${BEST_NAME} AS contact_name, (array_agg(c.phone_number ORDER BY c.timestamp DESC))[1] AS phone_number,
              COUNT(*)::int AS calls, COALESCE(SUM(c.duration_seconds), 0)::int AS duration,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'incoming')::int AS incoming,
              COALESCE(SUM(c.duration_seconds) FILTER (WHERE (${KIND_SQL}) = 'incoming'), 0)::int AS incoming_duration,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'outgoing')::int AS outgoing,
              COALESCE(SUM(c.duration_seconds) FILTER (WHERE (${KIND_SQL}) = 'outgoing'), 0)::int AS outgoing_duration,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'missed')::int AS missed,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'rejected')::int AS rejected,
              to_char(MAX(c.timestamp), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_call
         FROM call_events c WHERE ${f.conds.join(' AND ')} GROUP BY c.phone_key`, f.params)).rows;
    const byKey = new Map(rows.map(r => [r.phone_key, r]));
    // keep the order the caller asked for, and include people with no calls in the range as zeros
    return keys.map(k => byKey.get(k) || { phone_key: k, contact_name: null, phone_number: k, calls: 0, duration: 0, incoming: 0, incoming_duration: 0, outgoing: 0, outgoing_duration: 0, missed: 0, rejected: 0, last_call: null });
  }

  /* ───────────────────────── groups (Premium Plus) ───────────────────────── */

  async groups() {
    await PlanService.assert('contact_groups');
    const r = await q(
      `SELECT g.id, g.name, g.color, g.created_by, COUNT(m.phone_key)::int AS members
         FROM contact_groups g LEFT JOIN contact_group_members m ON m.group_id = g.id GROUP BY g.id ORDER BY g.name`);
    return r.rows;
  }

  async createGroup(ctx, body) {
    await PlanService.assert('contact_groups');
    const name = String((body && body.name) || '').trim().slice(0, 80);
    if (!name) throw new ValidationError('name required');
    try {
      const r = await q('INSERT INTO contact_groups (name, color, created_by) VALUES ($1, $2, $3) RETURNING id, name, color',
        [name, (body.color || '#f59e0b').slice(0, 20), parseInt(ctx.userId)]);
      await audit(null, ctx, 'contact_group.created', 'contact_group', r.rows[0].id, { name });
      return { ...r.rows[0], members: 0 };
    } catch (e) {
      if (e.code === '23505') throw new ConflictError(`A group called "${name}" already exists`);
      throw e;
    }
  }

  async assertGroupOwner(ctx, groupId) {
    const g = await q('SELECT id, created_by FROM contact_groups WHERE id = $1', [groupId]);
    if (!g.rows.length) throw new NotFoundError('Group not found');
    if (ctx.role === 'agent' && g.rows[0].created_by !== parseInt(ctx.userId)) throw new ForbiddenError('Only the person who made a group (or a manager) can change it');
    return g.rows[0];
  }

  async updateGroup(ctx, id, body) {
    await PlanService.assert('contact_groups');
    await this.assertGroupOwner(ctx, id);
    const sets = [], params = [];
    if (body.name !== undefined) { const n = String(body.name).trim().slice(0, 80); if (!n) throw new ValidationError('name cannot be empty'); params.push(n); sets.push(`name = $${params.length}`); }
    if (body.color !== undefined) { params.push(String(body.color).slice(0, 20)); sets.push(`color = $${params.length}`); }
    if (!sets.length) throw new ValidationError('nothing to update');
    params.push(id);
    try {
      const r = await q(`UPDATE contact_groups SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, name, color`, params);
      return r.rows[0];
    } catch (e) {
      if (e.code === '23505') throw new ConflictError('A group with that name already exists');
      throw e;
    }
  }

  async deleteGroup(ctx, id) {
    await PlanService.assert('contact_groups');
    await this.assertGroupOwner(ctx, id);
    await q('DELETE FROM contact_groups WHERE id = $1', [id]);
    await audit(null, ctx, 'contact_group.deleted', 'contact_group', id, {});
    return { deleted: true, id };
  }

  async addMembers(ctx, id, body) {
    await PlanService.assert('contact_groups');
    await this.assertGroupOwner(ctx, id);
    const keys = [...new Set((body.phones || body.phone_keys || []).map(phoneKeyOf).filter(k => k.length >= 6))];
    if (!keys.length) throw new ValidationError('phones required');
    if (keys.length > 500) throw new ValidationError('at most 500 contacts per request');
    for (const k of keys) await q('INSERT INTO contact_group_members (group_id, phone_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, k]);
    return { group_id: id, added: keys.length };
  }

  async removeMember(ctx, id, rawKey) {
    await PlanService.assert('contact_groups');
    await this.assertGroupOwner(ctx, id);
    await q('DELETE FROM contact_group_members WHERE group_id = $1 AND phone_key = $2', [id, phoneKeyOf(rawKey)]);
    return { group_id: id, removed: true };
  }
}

module.exports = new ContactService();
