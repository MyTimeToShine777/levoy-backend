'use strict';

const { q } = require('../config/db');

// Daily call reports. Agents see their own calls; managers and admins the team's.
class ReportService {
  baseFor(ctx, dayStart, dayEnd) {
    const isAgent = ctx.role === 'agent';
    return {
      params: isAgent ? [ctx.userId, dayStart, dayEnd] : [dayStart, dayEnd],
      base: isAgent
        ? 'FROM call_events WHERE user_id = $1 AND timestamp >= $2 AND timestamp < $3'
        : 'FROM call_events WHERE timestamp >= $1 AND timestamp < $2',
    };
  }

  async daily(ctx, query) {
    const days = Math.min(Math.max(parseInt(query.days) || 30, 1), 365);
    const today = new Date();
    const reports = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();

      try {
        const { params: rp, base } = this.baseFor(ctx, dayStart, dayEnd);
        const totalR = await q(`SELECT COUNT(*) ${base}`, rp);
        if (parseInt(totalR.rows[0].count) === 0) continue;

        const data = await Promise.all([
          q(`SELECT COUNT(*) ${base}`, rp),
          q(`SELECT COUNT(*) ${base} AND direction = 'incoming'`, rp),
          q(`SELECT COUNT(*) ${base} AND direction = 'outgoing'`, rp),
          q(`SELECT COUNT(*) ${base} AND status = 'missed'`, rp),
          q(`SELECT COUNT(*) ${base} AND status = 'rejected'`, rp),
          q(`SELECT COALESCE(SUM(duration_seconds),0) ${base}`, rp),
          q(`SELECT COUNT(DISTINCT phone_number) ${base}`, rp),
        ]);

        reports.push({
          date: ds,
          total_calls: parseInt(data[0].rows[0].count),
          incoming: parseInt(data[1].rows[0].count),
          outgoing: parseInt(data[2].rows[0].count),
          missed: parseInt(data[3].rows[0].count),
          rejected: parseInt(data[4].rows[0].count),
          total_duration: parseInt(data[5].rows[0].coalesce),
          unique_contacts: parseInt(data[6].rows[0].count),
        });
      } catch (e) { console.error(`Report day ${ds}:`, e.message); }
    }
    return reports;
  }

  // Build today's report text and save a snapshot row (daily_reports).
  async generateEmail(ctx) {
    const today = new Date();
    const ds = today.toISOString().split('T')[0];
    const ts = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const te = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
    const { params: rp, base } = this.baseFor(ctx, ts, te);

    const totalR = await q(`SELECT COUNT(*) ${base}`, rp);
    const total = parseInt(totalR.rows[0].count) || 0;

    const data = await Promise.all([
      q(`SELECT COUNT(*) ${base} AND direction = 'incoming'`, rp),
      q(`SELECT COUNT(*) ${base} AND direction = 'outgoing'`, rp),
      q(`SELECT COUNT(*) ${base} AND status = 'missed'`, rp),
      q(`SELECT COUNT(*) ${base} AND status = 'rejected'`, rp),
      q(`SELECT COUNT(*) ${base} AND status = 'connected'`, rp),
      q(`SELECT COALESCE(SUM(duration_seconds),0) ${base}`, rp),
      q(`SELECT COUNT(DISTINCT phone_number) ${base}`, rp),
    ]);

    const incoming = parseInt(data[0].rows[0].count) || 0;
    const outgoing = parseInt(data[1].rows[0].count) || 0;
    const missed = parseInt(data[2].rows[0].count) || 0;
    const rejected = parseInt(data[3].rows[0].count) || 0;
    const connected = parseInt(data[4].rows[0].count) || 0;
    const dur = parseInt(data[5].rows[0].coalesce) || 0;
    const uniq = parseInt(data[6].rows[0].count) || 0;

    await q(
      `INSERT INTO daily_reports (user_id,date,total_calls,incoming,outgoing,missed,rejected,total_duration,unique_contacts,sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [ctx.userId, ds, total, incoming, outgoing, missed, rejected, dur, uniq]);

    const txt = `Daily Call Report - ${ds}\n${ctx.role === 'admin' ? 'Admin' : 'Agent'}\nTotal: ${total}  In: ${incoming}  Out: ${outgoing}  Missed: ${missed}  Rejected: ${rejected}  Connected: ${connected}  Duration: ${dur}s (${Math.floor(dur / 60)}m)  Unique: ${uniq}`;
    return { report: txt, saved: true };
  }
}

module.exports = new ReportService();
