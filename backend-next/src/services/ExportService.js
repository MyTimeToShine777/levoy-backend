'use strict';

const Storage = require('./StorageService');

const fs = require('fs');
const path = require('path');
const { q } = require('../config/db');
const { UPLOADS_DIR, ROOT_DIR } = require('../config/upload');
const { tenantTag } = require('../utils/tenantPath');
const { ValidationError, NotFoundError, AppError } = require('../exceptions');
const { visibleSql } = require('../utils/leadAccess');

const EXPORT_TYPES = ['calls', 'calls_summary', 'leads', 'leads_pipeline'];
// ORDER BY cannot be parameterised, so the column and direction are matched against
// a whitelist (the legacy code interpolated the raw request values into the SQL).
const CALL_ORDER_COLS = ['timestamp', 'id', 'phone_number', 'direction', 'status', 'duration_seconds'];

// RFC 4180 quoting: a field containing a comma, quote or newline is wrapped in
// quotes with embedded quotes doubled. Legacy joined raw values with commas, so a
// note like "called, no answer" broke the column layout.
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvRow = vals => vals.map(csvCell).join(',');

class ExportService {
  async create(ctx, body) {
    const { type } = body;
    const params = body.params && typeof body.params === 'object' ? body.params : {};
    if (!type) throw new ValidationError('type required');
    if (!EXPORT_TYPES.includes(type)) throw new AppError(400, `Unknown export type '${type}'`, { allowed: EXPORT_TYPES });

    const isAgent = ctx.role === 'agent';
    const where = isAgent ? ' WHERE user_id = $1' : '';
    const baseParams = isAgent ? [ctx.userId] : [];
    let csv = '';
    let filename = '';

    if (type === 'calls') {
      const limit = Math.min(Math.max(parseInt(params.limit) || 10000, 1), 50000);
      const offset = Math.max(parseInt(params.offset) || 0, 0);
      const order = CALL_ORDER_COLS.includes(params.order) ? params.order : 'timestamp';
      const dir = String(params.dir || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      const cols = ['id', 'phone_number', 'direction', 'status', 'duration_seconds', 'timestamp', 'caller_id', 'notes', 'is_pinned'];
      const r = await q(
        `SELECT ${cols.join(', ')} FROM call_events${where} ORDER BY ${order} ${dir} LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}`,
        [...baseParams, limit, offset]);
      csv = [cols.join(',')].concat(r.rows.map(row => csvRow(cols.map(c => row[c])))).join('\n');
      filename = `${tenantTag()}calls_export_${Date.now()}.csv`;
    } else if (type === 'calls_summary') {
      const statsR = await q(
        `SELECT COUNT(*) as total, SUM(duration_seconds) as dur, COUNT(DISTINCT phone_number) as uniq,
                COUNT(CASE WHEN direction='incoming' THEN 1 END) as inc, COUNT(CASE WHEN direction='outgoing' THEN 1 END) as out,
                COUNT(CASE WHEN status='missed' THEN 1 END) as missed, COUNT(CASE WHEN status='rejected' THEN 1 END) as rej,
                COUNT(CASE WHEN status='connected' THEN 1 END) as conn
           FROM call_events${where}`, baseParams);
      const s = statsR.rows[0];
      csv = `Metric,Value\nTotal Calls,${s.total}\nTotal Duration (${Math.floor(parseInt(s.dur) / 60) || 0}m),${s.dur ?? 0}\nUnique Contacts,${s.uniq}\nIncoming,${s.inc}\nOutgoing,${s.out}\nMissed,${s.missed}\nRejected,${s.rej}\nConnected,${s.conn}\n`;
      filename = `${tenantTag()}calls_summary_${Date.now()}.csv`;
    } else if (type === 'leads') {
      const limit = Math.min(Math.max(parseInt(params.limit) || 10000, 1), 50000);
      const cols = ['id', 'name', 'phone', 'email', 'status', 'source', 'priority', 'owner_id', 'assigned_to', 'notes', 'created_at', 'updated_at'];
      const lp = [];
      const scope = visibleSql(ctx, 'l', lp);
      const r = await q(
        `SELECT ${cols.map(c => 'l.' + c).join(', ')} FROM leads l
          WHERE 1=1 AND l.merged_into_lead_id IS NULL${scope}
          ORDER BY l.updated_at DESC LIMIT $${lp.length + 1}`, [...lp, limit]);
      csv = [cols.join(',')].concat(r.rows.map(row => csvRow(cols.map(c => row[c])))).join('\n');
      filename = `${tenantTag()}leads_export_${Date.now()}.csv`;
    } else if (type === 'leads_pipeline') {
      // One row per configured pipeline stage (the stages are data, not a fixed list).
      const stages = await q('SELECT slug FROM pipeline_stages ORDER BY position, id');
      csv = 'Status,Count\n';
      for (const st of stages.rows) {
        const lp = [st.slug];
        const scope = visibleSql(ctx, 'l', lp);
        const r = await q(`SELECT COUNT(*) FROM leads l WHERE l.status = $1 AND l.merged_into_lead_id IS NULL${scope}`, lp);
        csv += `${csvCell(st.slug)},${r.rows[0].count}\n`;
      }
      filename = `${tenantTag()}leads_pipeline_${Date.now()}.csv`;
    }

    // Save the export record + file.
    const fp = `/uploads/exports/${filename}`;
    const dir = path.join(UPLOADS_DIR, 'exports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), csv);
    await Storage.persist(fp);
    await q('INSERT INTO exports (user_id, type, params, file_path) VALUES ($1, $2, $3, $4)', [ctx.userId, type, JSON.stringify(params), fp]);

    return { export_id: 'exp_' + Date.now(), type, filename, file_path: fp, rows: csv.split('\n').length - 1 };
  }

  async list(ctx) {
    const r = await q('SELECT * FROM exports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [ctx.userId]);
    return r.rows.map(e => ({ id: e.id, type: e.type, params: e.params, created_at: e.created_at }));
  }

  // Absolute path of one of the caller's own export files.
  async fileFor(ctx, id) {
    const r = await q('SELECT file_path FROM exports WHERE id = $1 AND user_id = $2', [id, ctx.userId]);
    if (r.rows.length === 0) throw new NotFoundError('Not found');
    // Resolve inside the uploads tree only: never trust a stored path blindly.
    let fp = null;
    try { fp = await Storage.ensureLocal(String(r.rows[0].file_path)); } catch { fp = null; }      // validates the path; fetches from R2 if needed
    if (!fp) throw new NotFoundError('File not found');
    return fp;
  }

  // Removes one of the caller's own exports: the row first (so the list is right even if the
  // file is already gone), then the file — only ever inside the uploads tree.
  async remove(ctx, id) {
    const n = parseInt(id);
    if (!Number.isInteger(n)) throw new ValidationError('Invalid export id');
    const r = await q('DELETE FROM exports WHERE id = $1 AND user_id = $2 RETURNING file_path', [n, ctx.userId]);
    if (r.rows.length === 0) throw new NotFoundError('Not found');
    try { await Storage.remove(String(r.rows[0].file_path || '')); } catch { /* already gone, or not a storage path */ }
    return { deleted: true, id: n };
  }
}

module.exports = new ExportService();
