'use strict';

const { q } = require('../config/db');
const { KIND_SQL, CONNECTED_SQL } = require('../utils/callKinds');
const { tzMinutes, startOfLocalDay, DAY } = require('../utils/dayBounds');

// One row of numbers per day, worked out by the database for a window of calls. Every call is classified with the same
// rules as Call Analytics and Call History (callKinds), so the reports always agree with those pages.
const COUNTS_SQL = `COUNT(*)::int AS total_calls,
       COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'incoming')::int AS incoming,
       COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'outgoing')::int AS outgoing,
       COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'missed')::int AS missed,
       COUNT(*) FILTER (WHERE (${KIND_SQL}) = 'rejected')::int AS rejected,
       COALESCE(SUM(c.duration_seconds), 0)::int AS total_duration,
       COUNT(DISTINCT COALESCE(c.phone_key, c.phone_number))::int AS unique_contacts,
       COUNT(*) FILTER (WHERE ${CONNECTED_SQL})::int AS connected`;

// Daily call reports. Agents see their own calls; managers and admins the team's.
class ReportService {
  // Days follow the viewer's calendar (?tz= minutes east of UTC), not the server's clock.
  async daily(ctx, query) {
    const days = Math.min(Math.max(parseInt(query.days) || 30, 1), 365);
    const tz = tzMinutes(query);
    const lastDayStart = startOfLocalDay(Date.now(), tz);
    const from = new Date(lastDayStart - (days - 1) * DAY).toISOString();
    const to = new Date(lastDayStart + DAY).toISOString();

    const params = [tz, from, to];
    let mine = '';
    if (ctx.role === 'agent') { params.push(parseInt(ctx.userId)); mine = 'AND c.user_id = $4'; }

    // One query for the whole period. Days with no calls are left out, as before.
    const r = await q(
      `SELECT to_char(c.timestamp + make_interval(mins => $1), 'YYYY-MM-DD') AS date, ${COUNTS_SQL}
         FROM call_events c
        WHERE c.timestamp >= $2::timestamp AND c.timestamp < $3::timestamp ${mine}
        GROUP BY 1 ORDER BY 1`, params);
    return r.rows;
  }

  // Build today's report text and save a snapshot row (daily_reports).
  async generateEmail(ctx, query = {}) {
    const tz = tzMinutes(query);
    const dayStart = startOfLocalDay(Date.now(), tz);
    const ds = new Date(dayStart + tz * 60000).toISOString().slice(0, 10);
    const params = [new Date(dayStart).toISOString(), new Date(dayStart + DAY).toISOString()];
    let mine = '';
    if (ctx.role === 'agent') { params.push(parseInt(ctx.userId)); mine = 'AND c.user_id = $3'; }

    const t = (await q(
      `SELECT ${COUNTS_SQL} FROM call_events c WHERE c.timestamp >= $1::timestamp AND c.timestamp < $2::timestamp ${mine}`, params)).rows[0];

    await q(
      `INSERT INTO daily_reports (user_id,date,total_calls,incoming,outgoing,missed,rejected,total_duration,unique_contacts,sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [ctx.userId, ds, t.total_calls, t.incoming, t.outgoing, t.missed, t.rejected, t.total_duration, t.unique_contacts]);

    const txt = `Daily Call Report - ${ds}\n${ctx.role === 'admin' ? 'Admin' : 'Agent'}\nTotal: ${t.total_calls}  In: ${t.incoming}  Out: ${t.outgoing}  Missed: ${t.missed}  Rejected: ${t.rejected}  Connected: ${t.connected}  Duration: ${t.total_duration}s (${Math.floor(t.total_duration / 60)}m)  Unique: ${t.unique_contacts}`;
    return { report: txt, saved: true };
  }
}

module.exports = new ReportService();
