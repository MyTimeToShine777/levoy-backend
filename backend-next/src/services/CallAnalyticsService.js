'use strict';

const { q } = require('../config/db');
const PlanService = require('./PlanService');
const WorkspaceSettingsService = require('./WorkspaceSettingsService');
const CallHistoryService = require('./CallHistoryService');
const { workingHours } = require('../utils/workHours');
const { KIND_SQL, NEVER_ATTENDED_SQL, NOT_PICKUP_SQL, CONNECTED_SQL } = require('../utils/callKinds');

const MIN = 60000, DAY = 86400000;

const tzOf = query => {
  const n = parseInt(query.tz);
  return Number.isInteger(n) && Math.abs(n) <= 14 * 60 ? n : 0;       // minutes EAST of UTC
};

// Pick the bucket size from how long the range is: a day or two reads by hour, a quarter by day, longer by month.
function unitFor(fromMs, toMs) {
  const span = toMs - fromMs;
  if (span <= 2 * DAY + 1000) return 'hour';
  if (span <= 92 * DAY) return 'day';
  return 'month';
}

function bucketKeys(unit, fromMs, toMs, tz) {
  const keys = [];
  const cur = new Date(fromMs + tz * MIN);
  const end = new Date(toMs + tz * MIN);
  if (unit === 'hour') cur.setUTCMinutes(0, 0, 0);
  else if (unit === 'day') cur.setUTCHours(0, 0, 0, 0);
  else { cur.setUTCDate(1); cur.setUTCHours(0, 0, 0, 0); }
  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard++ < 800) {
    const iso = cur.toISOString();
    keys.push(unit === 'hour' ? iso.slice(0, 13) + ':00' : unit === 'day' ? iso.slice(0, 10) : iso.slice(0, 7));
    if (unit === 'hour') cur.setUTCHours(cur.getUTCHours() + 1);
    else if (unit === 'day') cur.setUTCDate(cur.getUTCDate() + 1);
    else cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return keys;
}

const LABEL_FMT = { hour: 'YYYY-MM-DD"T"HH24":00"', day: 'YYYY-MM-DD', month: 'YYYY-MM' };

class CallAnalyticsService {
  // One row of numbers for the tiles and the donut. Gated numbers come back null (and are listed in `locked`).
  async summary(ctx, query) {
    const f = await CallHistoryService.filters(ctx, query);
    const tz = tzOf(query);
    const where = f.conds.length ? 'WHERE ' + f.conds.join(' AND ') : '';

    const a = (await q(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(c.duration_seconds), 0)::int AS total_duration,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'incoming')::int AS incoming,
              COALESCE(SUM(c.duration_seconds) FILTER (WHERE (${KIND_SQL}) = 'incoming'), 0)::int AS incoming_duration,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'outgoing')::int AS outgoing,
              COALESCE(SUM(c.duration_seconds) FILTER (WHERE (${KIND_SQL}) = 'outgoing'), 0)::int AS outgoing_duration,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'missed')::int AS missed,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'rejected')::int AS rejected,
              COUNT(*) FILTER (WHERE ${NEVER_ATTENDED_SQL})::int AS never_attended,
              COUNT(*) FILTER (WHERE ${NOT_PICKUP_SQL})::int AS not_pickup,
              COUNT(*) FILTER (WHERE ${CONNECTED_SQL})::int AS connected,
              COUNT(DISTINCT c.phone_key)::int AS unique_calls,
              to_char(MIN(c.timestamp), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_call, to_char(MAX(c.timestamp), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_call
         FROM call_events c ${where}`, f.params)).rows[0];

    const fromIso = query.date_from ? new Date(query.date_from).toISOString() : a.first_call;
    const toIso = query.date_to ? new Date(query.date_to).toISOString() : new Date().toISOString();
    const locked = [];

    const out = {
      range: { from: fromIso, to: toIso, tz },
      totals: { calls: a.total, duration: a.total_duration },
      incoming: { calls: a.incoming, duration: a.incoming_duration },
      outgoing: { calls: a.outgoing, duration: a.outgoing_duration },
      missed: { calls: a.missed },
      rejected: { calls: a.rejected },
      never_attended: { calls: a.never_attended },
      not_pickup: { calls: a.not_pickup },
      unique_calls: null, connected_calls: null, working: null, locked,
    };

    if (await PlanService.has('unique_connected_calls')) { out.unique_calls = a.unique_calls; out.connected_calls = a.connected; }
    else locked.push('unique_calls', 'connected_calls');

    // Series for the graph
    if (fromIso) out.series = await this.series(f, fromIso, toIso, tz);
    else out.series = { unit: 'day', buckets: [] };

    // Working hours and idle time are about ONE person's day, so they need a single telecaller.
    if (await PlanService.has('working_hours')) {
      const uid = ctx.role === 'agent' ? parseInt(ctx.userId) : parseInt(query.user_id) || null;
      if (uid) out.working = await this.workingHours(ctx, query, uid, tz);
      else out.working = { needs_user: true };
    } else locked.push('working_hours', 'ideal_time');

    out.billing = await this.billing(ctx, query, f, tz);
    if (ctx.role !== 'agent' && !query.user_id) {
      if (await PlanService.has('team_call_analytics')) out.leaderboard = await this.leaderboard(f);
      else locked.push('leaderboard');
    }
    return out;
  }

  async series(f, fromIso, toIso, tz) {
    const fromMs = new Date(fromIso).getTime(), toMs = new Date(toIso).getTime();
    const unit = unitFor(fromMs, toMs);
    const where = f.conds.length ? 'WHERE ' + f.conds.join(' AND ') : '';
    const rows = (await q(
      `SELECT to_char(date_trunc('${unit}', c.timestamp + make_interval(mins => ${tz})), '${LABEL_FMT[unit]}') AS bucket,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'incoming')::int AS incoming,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'outgoing')::int AS outgoing,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'missed')::int AS missed,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'rejected')::int AS rejected,
              COALESCE(SUM(c.duration_seconds) FILTER (WHERE (${KIND_SQL}) = 'incoming'), 0)::int AS incoming_duration,
              COALESCE(SUM(c.duration_seconds) FILTER (WHERE (${KIND_SQL}) = 'outgoing'), 0)::int AS outgoing_duration
         FROM call_events c ${where} GROUP BY 1`, f.params)).rows;
    const by = new Map(rows.map(r => [r.bucket, r]));
    const blank = { incoming: 0, outgoing: 0, missed: 0, rejected: 0, incoming_duration: 0, outgoing_duration: 0 };
    return { unit, buckets: bucketKeys(unit, fromMs, toMs, tz).map(k => ({ bucket: k, ...blank, ...(by.get(k) || {}) })) };
  }

  async workingHours(ctx, query, uid, tz) {
    const s = await WorkspaceSettingsService.all();
    // the same filters (SIM, dates…) but for exactly this person
    const f = await CallHistoryService.filters(ctx, { ...query, user_id: uid });
    const rows = (await q(
      `SELECT (extract(epoch FROM c.timestamp) * 1000)::bigint AS start, COALESCE(c.duration_seconds, 0) AS seconds
         FROM call_events c ${f.conds.length ? 'WHERE ' + f.conds.join(' AND ') : ''} ORDER BY c.timestamp`, f.params)).rows;
    const calls = rows.map(r => ({ start: Number(r.start), seconds: r.seconds }));
    return { user_id: uid, ...workingHours(calls, { idleGapMinutes: s.idle_gap_minutes, tzOffsetMinutes: tz }) };
  }

  async billing(ctx, query, f, tz) {
    const cost = await CallHistoryService.costSql();
    if (!cost) return { enabled: false, available: await PlanService.has('billing_cycle') };
    const s = cost.settings;
    const where = f.conds.length ? 'WHERE ' + f.conds.join(' AND ') : '';
    const inRange = (await q(
      `SELECT COALESCE(SUM(${cost.sql}), 0)::numeric(12,2) AS cost FROM call_events c ${where}`, f.params)).rows[0];

    // The current billing cycle, in the viewer's local calendar.
    const nowLocal = new Date(Date.now() + tz * MIN);
    let m = nowLocal.getUTCMonth();
    const y = nowLocal.getUTCFullYear();
    if (nowLocal.getUTCDate() < s.billing_cycle_day) m -= 1;
    const cycleFrom = new Date(Date.UTC(y, m, s.billing_cycle_day) - tz * MIN).toISOString();
    const cycleTo = new Date(Date.UTC(y, m + 1, s.billing_cycle_day) - 1000 - tz * MIN).toISOString();

    const fc = await CallHistoryService.filters(ctx, { ...query, date_from: cycleFrom, date_to: cycleTo });
    const cyc = (await q(
      `SELECT COALESCE(SUM(${cost.sql}), 0)::numeric(12,2) AS cost, COUNT(*)::int AS calls, COALESCE(SUM(c.duration_seconds), 0)::int AS seconds
         FROM call_events c ${fc.conds.length ? 'WHERE ' + fc.conds.join(' AND ') : ''}`, fc.params)).rows[0];
    return {
      enabled: true, available: true, currency: s.billing_currency, rate_per_minute: s.billing_rate_per_minute,
      pulse_seconds: s.billing_pulse_seconds, cycle_day: s.billing_cycle_day,
      range_cost: Number(inRange.cost),
      cycle: { from: cycleFrom, to: cycleTo, cost: Number(cyc.cost), calls: cyc.calls, seconds: cyc.seconds },
    };
  }

  // Biz: every telecaller side by side.
  async leaderboard(f) {
    const where = f.conds.length ? 'WHERE ' + f.conds.join(' AND ') : '';
    const rows = (await q(
      `SELECT c.user_id, u.name,
              COUNT(*)::int AS calls, COALESCE(SUM(c.duration_seconds), 0)::int AS duration,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'outgoing')::int AS outgoing,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'incoming')::int AS incoming,
              COUNT(*) FILTER (WHERE (${KIND_SQL}) IN ('missed', 'rejected'))::int AS missed,
              COUNT(*) FILTER (WHERE ${CONNECTED_SQL})::int AS connected,
              COUNT(DISTINCT c.phone_key)::int AS unique_contacts
         FROM call_events c LEFT JOIN users u ON u.id = c.user_id ${where}
        GROUP BY c.user_id, u.name ORDER BY calls DESC`, f.params)).rows;
    return rows.map(r => ({ ...r, connect_rate: r.calls ? Math.round((r.connected / r.calls) * 1000) / 10 : 0 }));
  }

  // The "Analysis" tab: when calls happen, who gets the most, the longest call.
  async analysis(ctx, query) {
    const f = await CallHistoryService.filters(ctx, query);
    const tz = tzOf(query);
    const where = f.conds.length ? 'WHERE ' + f.conds.join(' AND ') : '';
    const loc = `(c.timestamp + make_interval(mins => ${tz}))`;
    const [hour, weekday, longest, frequent, avg] = await Promise.all([
      q(`SELECT EXTRACT(hour FROM ${loc})::int AS h, COUNT(*)::int AS calls FROM call_events c ${where} GROUP BY 1 ORDER BY 1`, f.params),
      q(`SELECT EXTRACT(dow FROM ${loc})::int AS d, COUNT(*)::int AS calls FROM call_events c ${where} GROUP BY 1 ORDER BY 1`, f.params),
      q(`SELECT c.id, c.phone_number, c.caller_id AS contact_name, (${KIND_SQL}) AS kind, c.duration_seconds,
                to_char(c.timestamp, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS timestamp
           FROM call_events c ${where} ORDER BY c.duration_seconds DESC NULLS LAST LIMIT 1`, f.params),
      q(`SELECT c.phone_key, MAX(c.phone_number) AS phone_number, MAX(c.caller_id) AS contact_name, COUNT(*)::int AS calls,
                COALESCE(SUM(c.duration_seconds), 0)::int AS duration
           FROM call_events c ${where} GROUP BY c.phone_key ORDER BY calls DESC, duration DESC LIMIT 5`, f.params),
      q(`SELECT COALESCE(AVG(c.duration_seconds) FILTER (WHERE ${CONNECTED_SQL}), 0)::int AS avg_connected,
                COUNT(*) FILTER (WHERE c.direction = 'outgoing' AND ${CONNECTED_SQL})::int AS out_connected,
                COUNT(*) FILTER (WHERE c.direction = 'outgoing')::int AS out_total
           FROM call_events c ${where}`, f.params),
    ]);
    const fill = (rows, key, n) => Array.from({ length: n }, (_, i) => ({ [key]: i, calls: (rows.rows.find(r => r[key === 'hour' ? 'h' : 'd'] === i) || {}).calls || 0 }));
    const a = avg.rows[0];
    return {
      by_hour: fill(hour, 'hour', 24),
      by_weekday: fill(weekday, 'day', 7),
      longest_call: longest.rows[0] && longest.rows[0].duration_seconds > 0 ? longest.rows[0] : null,
      most_frequent: frequent.rows,
      avg_connected_duration: a.avg_connected,
      outgoing_connect_rate: a.out_total ? Math.round((a.out_connected / a.out_total) * 1000) / 10 : 0,
    };
  }
}

module.exports = new CallAnalyticsService();
module.exports.unitFor = unitFor;
module.exports.bucketKeys = bucketKeys;
