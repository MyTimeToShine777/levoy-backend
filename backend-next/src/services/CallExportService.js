'use strict';

const XLSX = require('xlsx');
const { tenantTag } = require('../utils/tenantPath');
const { q, tx } = require('../config/db');
const Storage = require('./StorageService');
const { ValidationError, AppError } = require('../exceptions');
const PlanService = require('./PlanService');
const CallHistoryService = require('./CallHistoryService');
const CallAnalyticsService = require('./CallAnalyticsService');
const ContactService = require('./ContactService');
const { KIND_SQL, TS_ISO_SQL, SAVED_CONTACT_SQL, TABS, TAB_WHERE } = require('../utils/callKinds');
const { audit } = require('../utils/audit');

const MAX_ROWS = 50000;
const MIN = 60000;
const KIND_LABEL = { incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed', rejected: 'Rejected', never_attended: 'Never attended', not_pickup: 'Not picked up by client' };

const tzOf = query => {
  const n = parseInt(query.tz);
  return Number.isInteger(n) && Math.abs(n) <= 14 * 60 ? n : 0;
};
// "2026-10-03T08:15:00Z" shifted to the viewer's clock → ['2026-10-03', '13:45:00']
const localParts = (iso, tz) => {
  if (!iso) return ['', ''];
  const s = new Date(new Date(iso).getTime() + tz * MIN).toISOString();
  return [s.slice(0, 10), s.slice(11, 19)];
};
const mmss = sec => `${Math.floor((sec || 0) / 60)}:${String((sec || 0) % 60).padStart(2, '0')}`;
const hms = sec => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};
const simText = r => (r.source === 'whatsapp' ? 'WhatsApp' : r.sim_slot ? (r.sim_label ? `SIM ${r.sim_slot} (${r.sim_label})` : `SIM ${r.sim_slot}`) : '');

function sheet(rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (widths) ws['!cols'] = widths.map(wch => ({ wch }));
  return ws;
}

class CallExportService {
  // Writes the workbook into uploads/exports and records it in the caller's Exports list.
  async save(ctx, type, params, wb, rows) {
    const filename = `${tenantTag()}${type}_${Date.now()}.xlsx`;
    const fp = `/uploads/exports/${filename}`;
    await Storage.putBuffer(fp, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const r = await q('INSERT INTO exports (user_id, type, params, file_path) VALUES ($1, $2, $3, $4) RETURNING id',
      [parseInt(ctx.userId), type, JSON.stringify(params), fp]);
    return { export_id: r.rows[0].id, type, filename, file_path: fp, rows };
  }

  // Excel call report: a Summary sheet and the Call History sheet, under whatever filters the screen had.
  async callReport(ctx, query) {
    const tz = tzOf(query);
    const excludeContacts = query.exclude_contacts === 'true' || query.exclude_contacts === true;
    if (excludeContacts) await PlanService.assert('export_exclude_contacts');
    const tab = TABS.includes(query.tab) ? query.tab : 'all';

    const f = await CallHistoryService.filters(ctx, query);
    const cost = await CallHistoryService.costSql();
    const conds = [...f.conds, TAB_WHERE[tab]];
    if (excludeContacts) conds.push(`NOT ${SAVED_CONTACT_SQL}`);
    const where = 'WHERE ' + conds.join(' AND ');

    const rows = (await q(
      `SELECT c.phone_number, c.caller_id AS contact_name, (${KIND_SQL}) AS kind, COALESCE(c.duration_seconds, 0) AS duration_seconds,
              ${TS_ISO_SQL} AS ts, c.source, c.sim_slot, c.sim_label, c.notes, u.name AS user_name,
              COALESCE((SELECT string_agg(t.name, ', ' ORDER BY t.name) FROM call_event_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.call_id = c.id), '') AS tags
              ${cost ? `, ${cost.sql} AS cost` : ''}
         FROM call_events c LEFT JOIN users u ON u.id = c.user_id ${where}
        ORDER BY c.timestamp DESC, c.id DESC LIMIT ${MAX_ROWS}`, f.params)).rows;

    const head = ['Date', 'Time', 'Name', 'Number', 'Type', 'Duration (m:ss)', 'Duration (sec)', 'SIM', 'Team member', 'Note', 'Tags'];
    if (cost) head.push(`Cost (${cost.settings.billing_currency})`);
    const body = rows.map(r => {
      const [d, t] = localParts(r.ts, tz);
      const line = [d, t, r.contact_name || '', r.phone_number, KIND_LABEL[r.kind] || r.kind, mmss(r.duration_seconds), r.duration_seconds, simText(r), r.user_name || '', r.notes || '', r.tags];
      if (cost) line.push(r.cost == null ? '' : Number(r.cost));
      return line;
    });

    const by = k => rows.filter(r => r.kind === k);
    const sum = list => list.reduce((n, r) => n + r.duration_seconds, 0);
    const summary = [
      ['Call report'],
      ['Generated', new Date(Date.now() + tz * MIN).toISOString().replace('T', ' ').slice(0, 19)],
      ['Range', `${query.date_from ? localParts(new Date(query.date_from).toISOString(), tz)[0] : 'start'} to ${query.date_to ? localParts(new Date(query.date_to).toISOString(), tz)[0] : 'now'}`],
      ['Tab', tab], ['Contacts excluded', excludeContacts ? 'yes (saved contacts left out)' : 'no'],
      rows.length >= MAX_ROWS ? ['Note', `Only the newest ${MAX_ROWS} calls are included`] : [],
      [],
      ['Type', 'Calls', 'Duration', 'Duration (sec)'],
      ['Total', rows.length, hms(sum(rows)), sum(rows)],
      ['Incoming', by('incoming').length, hms(sum(by('incoming'))), sum(by('incoming'))],
      ['Outgoing', by('outgoing').length, hms(sum(by('outgoing'))), sum(by('outgoing'))],
      ['Missed', by('missed').length],
      ['Rejected', by('rejected').length],
      ['Unique numbers', new Set(rows.map(r => r.phone_number.replace(/\D/g, '').slice(-10))).size],
    ];
    if (cost) summary.push([`Total cost (${cost.settings.billing_currency})`, Math.round(rows.reduce((n, r) => n + (Number(r.cost) || 0), 0) * 100) / 100]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(summary, [22, 26, 14, 14]), 'Summary');
    XLSX.utils.book_append_sheet(wb, sheet([head, ...body], [12, 10, 22, 16, 22, 14, 12, 16, 18, 36, 24, 12]), 'Call History');
    const out = await this.save(ctx, 'call_report', { tab, exclude_contacts: excludeContacts, ...pick(query) }, wb, rows.length);
    await audit(null, ctx, 'export.call_report', 'export', out.export_id, { rows: rows.length, tab, excludeContacts });
    return out;
  }

  // Premium Plus: one row per person with their numbers.
  async contactReport(ctx, query) {
    await PlanService.assert('contact_report_excel');
    const tz = tzOf(query);
    const list = await ContactService.list(ctx, { ...query, limit: 200, offset: 0 });
    let all = list.rows;
    for (let off = 200; off < Math.min(list.total, MAX_ROWS); off += 200) {
      all = all.concat((await ContactService.list(ctx, { ...query, limit: 200, offset: off })).rows);
    }
    const head = ['Name', 'Number', 'Total calls', 'Incoming', 'Outgoing', 'Missed / rejected', 'Total duration', 'Duration (sec)', 'Last call (date)', 'Last call (time)', 'Groups', 'Lead'];
    const body = all.map(c => {
      const [d, t] = localParts(c.last_call, tz);
      return [c.contact_name || '', c.phone_number, c.total_calls, c.incoming, c.outgoing, c.missed, hms(c.total_duration), c.total_duration, d, t,
        (c.groups || []).map(g => g.name).join(', '), c.lead ? c.lead.name : ''];
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet([head, ...body], [22, 16, 11, 10, 10, 16, 14, 14, 14, 12, 24, 24]), 'Contacts');
    return this.save(ctx, 'contact_report', pick(query), wb, all.length);
  }

  // Premium Plus: working hours per day for one telecaller, plus their breaks.
  async workingHoursReport(ctx, query) {
    await PlanService.assert('working_hours');
    const tz = tzOf(query);
    const uid = ctx.role === 'agent' ? parseInt(ctx.userId) : parseInt(query.user_id);
    if (!Number.isInteger(uid)) throw new ValidationError('choose a team member (user_id) for the working-hours report');
    const wh = await CallAnalyticsService.workingHours(ctx, query, uid, tz);
    const name = (await q('SELECT name FROM users WHERE id = $1', [uid])).rows[0];
    const days = [['Date', 'First call', 'Last call ended', 'Working', 'Idle (breaks)', 'Talk time', 'Calls', 'Breaks']]
      .concat(wh.days.map(d => [d.date, localParts(d.first_call_at, tz)[1], localParts(d.last_call_at, tz)[1], hms(d.working_seconds), hms(d.idle_seconds), hms(d.talk_seconds), d.calls, d.breaks.length]));
    days.push([], ['Total', '', '', hms(wh.totals.working_seconds), hms(wh.totals.idle_seconds), hms(wh.totals.talk_seconds), wh.totals.calls, '']);
    const breaks = [['Date', 'From', 'To', 'Length']];
    for (const d of wh.days) for (const b of d.breaks) breaks.push([d.date, localParts(b.from, tz)[1], localParts(b.to, tz)[1], hms(b.seconds)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet([[`Working hours – ${name ? name.name : uid}`], [`A gap longer than ${wh.idle_gap_minutes} minutes between calls counts as a break.`], [], ...days], [14, 12, 16, 12, 14, 12, 8, 8]), 'Working hours');
    XLSX.utils.book_append_sheet(wb, sheet(breaks, [14, 10, 10, 12]), 'Breaks');
    return this.save(ctx, 'working_hours', { user_id: uid, ...pick(query) }, wb, wh.days.length);
  }

  // Premium: a JSON copy of the caller's own call log (+ reminders), restorable later.
  async backup(ctx) {
    await PlanService.assert('auto_backup');
    const uid = parseInt(ctx.userId);
    const calls = (await q(
      `SELECT c.phone_number, c.direction, c.status, c.duration_seconds, ${TS_ISO_SQL} AS timestamp, c.caller_id, c.notes, c.is_pinned, c.source, c.sim_slot, c.sim_label,
              COALESCE((SELECT json_agg(t.name ORDER BY t.name) FROM call_event_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.call_id = c.id), '[]'::json) AS tags
         FROM call_events c WHERE c.user_id = $1 ORDER BY c.timestamp LIMIT 200000`, [uid])).rows;
    const reminders = (await q(
      `SELECT phone_number, note, done, to_char(remind_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS remind_at FROM call_reminders WHERE user_id = $1`, [uid])).rows;
    const sims = (await q('SELECT slot, label, number FROM user_sims WHERE user_id = $1 ORDER BY slot', [uid])).rows;
    await audit(null, ctx, 'backup.created', 'user', uid, { calls: calls.length });
    return { app: 'levoy', version: 1, created_at: new Date().toISOString(), calls, reminders, sims };
  }

  // Puts a backup back. Calls already present (same number, time and direction) are skipped, so restoring twice is harmless.
  async restore(ctx, body) {
    await PlanService.assert('auto_backup');
    const b = body || {};
    if (b.app !== 'levoy' || !Array.isArray(b.calls)) throw new ValidationError('this does not look like a Levoy backup file');
    if (b.calls.length > 200000) throw new AppError(413, 'backup is too large to restore in one go');
    const uid = parseInt(ctx.userId);
    return tx(async ({ q: tq }) => {
      let added = 0, skipped = 0;
      for (const c of b.calls) {
        if (!c || !c.phone_number || !c.timestamp || Number.isNaN(new Date(c.timestamp).getTime())) { skipped++; continue; }
        const ts = new Date(c.timestamp).toISOString();
        const dir = c.direction === 'incoming' ? 'incoming' : 'outgoing';
        // compared to the second: a backup rounds to seconds, the phone sends milliseconds
        const dup = await tq(
          `SELECT id FROM call_events WHERE user_id = $1 AND phone_number = $2 AND direction = $4
              AND date_trunc('second', timestamp) = date_trunc('second', $3::timestamp) LIMIT 1`, [uid, c.phone_number, ts, dir]);
        if (dup.rows.length) { skipped++; continue; }
        const slot = Number.isInteger(parseInt(c.sim_slot)) ? parseInt(c.sim_slot) : null;
        const ins = await tq(
          `INSERT INTO call_events (user_id, phone_number, direction, status, duration_seconds, timestamp, caller_id, notes, is_pinned, source, sim_slot, sim_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [uid, String(c.phone_number).slice(0, 50), dir, c.status || 'connected', Math.max(0, parseInt(c.duration_seconds) || 0), ts, c.caller_id || null,
            c.notes || null, c.is_pinned === true, c.source === 'whatsapp' ? 'whatsapp' : 'sim', slot, c.sim_label || null]);
        for (const name of Array.isArray(c.tags) ? c.tags.slice(0, 12) : []) {
          const n = String(name || '').trim().slice(0, 60);
          if (!n) continue;
          const t = await tq('INSERT INTO tags (name, created_by) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [n, uid]);
          await tq('INSERT INTO call_event_tags (call_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ins.rows[0].id, t.rows[0].id]);
        }
        added++;
      }
      let remindersAdded = 0;
      for (const r of Array.isArray(b.reminders) ? b.reminders : []) {
        if (!r || !r.phone_number || !r.note) continue;
        const ex = await tq('SELECT id FROM call_reminders WHERE user_id = $1 AND phone_number = $2 AND note = $3 LIMIT 1', [uid, r.phone_number, r.note]);
        if (ex.rows.length) continue;
        const at = r.remind_at && !Number.isNaN(new Date(r.remind_at).getTime()) ? new Date(r.remind_at).toISOString() : null;
        await tq('INSERT INTO call_reminders (user_id, phone_number, note, remind_at, done) VALUES ($1,$2,$3,$4::timestamp,$5)', [uid, r.phone_number, r.note, at, r.done === true]);
        remindersAdded++;
      }
      await audit({ query: tq }, ctx, 'backup.restored', 'user', uid, { added, skipped });
      return { calls_added: added, calls_skipped: skipped, reminders_added: remindersAdded };
    });
  }
}

// The few query fields worth keeping on the export record.
function pick(query) {
  const keep = {};
  for (const k of ['date_from', 'date_to', 'user_id', 'sim', 'contact_type', 'notes', 'tag_id', 'group_id', 'search']) if (query[k] !== undefined && query[k] !== '') keep[k] = query[k];
  return keep;
}

module.exports = new CallExportService();
