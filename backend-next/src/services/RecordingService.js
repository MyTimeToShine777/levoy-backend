'use strict';

const Storage = require('./StorageService');

const fs = require('fs');
const path = require('path');
const { q } = require('../config/db');
const { MIME_EXTENSION_REVERSE, safeUploadPath } = require('../config/upload');
const { ValidationError, NotFoundError, ForbiddenError } = require('../exceptions');
const { audit } = require('../utils/audit');

// Who may see a recording: admin and manager see everything, an agent sees only
// their own.
const canAccess = (ctx, rec) =>
  ctx.role === 'admin' || ctx.role === 'manager' || rec.user_id === parseInt(ctx.userId);

const unlinkQuiet = p => { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (_) { /* best effort */ } };

class RecordingService {
  // `file` is the multer-written file (already on disk). Every failure path removes
  // it again, so a rejected upload never strands bytes in uploads/.
  async upload(ctx, callIdRaw, file, body) {
    const callId = parseInt(callIdRaw);
    try {
      if (!file) throw new ValidationError('No file');
      // The call must exist regardless of role — otherwise an agent could attach a
      // recording to a call id that does not exist and leave an orphan row.
      const c = await q('SELECT id,user_id FROM call_events WHERE id = $1', [callId]);
      if (c.rows.length === 0) throw new NotFoundError('Call not found');
      if (ctx.role === 'agent' && c.rows[0].user_id !== parseInt(ctx.userId)) throw new ForbiddenError('Not your call');

      const filePath = `/uploads/recordings/${file.filename}`;
      await Storage.persist(filePath);       // R2 when STORAGE_DRIVER=r2; a no-op for local files
      // Attributed to the CALL's agent, not the uploader: a manager attaching a
      // recording to an agent's call must not reassign the call's ownership.
      const duration = body && body.duration !== undefined ? parseInt(body.duration) : null;
      const r = await q(
        'INSERT INTO call_recordings (call_id, user_id, file_path, file_size, duration_seconds) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [callId, c.rows[0].user_id, filePath, file.size, Number.isFinite(duration) ? duration : null]);
      // call_events.recording_path is the legacy single-recording pointer; it is
      // cleared on delete only when it still points at THIS file.
      await q('UPDATE call_events SET recording_path = $1 WHERE id = $2 AND (recording_path IS NULL OR recording_path = $1)', [filePath, callId]);
      await audit(null, ctx, 'call.recording_uploaded', 'call_recording', r.rows[0].id,
        { call_id: callId, file_size: file.size, mime: file.mimetype, duration_seconds: Number.isFinite(duration) ? duration : null });
      return {
        id: r.rows[0].id, call_id: callId, file_path: r.rows[0].file_path,
        file_size: r.rows[0].file_size, duration_seconds: r.rows[0].duration_seconds,
        mime_type: file.mimetype, uploaded_at: r.rows[0].uploaded_at,
      };
    } catch (e) {
      unlinkQuiet(file && file.path);          // never leave an orphaned file behind
      throw e;
    }
  }

  async listForCall(ctx, callIdRaw) {
    const callId = parseInt(callIdRaw);
    // Ownership is checked on the CALL, so an agent cannot list another agent's
    // recordings by guessing call ids.
    const c = await q('SELECT id,user_id FROM call_events WHERE id = $1', [callId]);
    if (c.rows.length === 0) throw new NotFoundError('Call not found');
    if (ctx.role === 'agent' && c.rows[0].user_id !== parseInt(ctx.userId)) throw new ForbiddenError('Not your call');
    const r = await q('SELECT * FROM call_recordings WHERE call_id = $1 ORDER BY uploaded_at DESC', [callId]);
    return r.rows.map(x => ({
      id: x.id, call_id: x.call_id, file_path: x.file_path, file_size: x.file_size,
      duration_seconds: x.duration_seconds, uploaded_at: x.uploaded_at,
      file_url: `/api/calls/${callId}/recordings/${x.id}/file`,
    }));
  }

  // Resolve a recording to a file on disk the caller may read.
  async fileFor(ctx, callId, recId) {
    const r = await q('SELECT * FROM call_recordings WHERE id = $1 AND call_id = $2', [recId, callId]);
    if (r.rows.length === 0) throw new NotFoundError('Not found');
    if (!canAccess(ctx, r.rows[0])) throw new ForbiddenError('Forbidden');
    if (!safeUploadPath(r.rows[0].file_path)) throw new ValidationError('Invalid recording path');
    const filePath = await Storage.ensureLocal(r.rows[0].file_path);       // downloads from R2 into the cache if needed
    if (!filePath) throw new NotFoundError('File not found');
    // The stored extension is authoritative for the content type, NOT the client's
    // original filename — served as audio so <audio> plays it inline.
    const type = MIME_EXTENSION_REVERSE[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    return { filePath, type };
  }

  async remove(ctx, recId) {
    const r = await q('SELECT * FROM call_recordings WHERE id = $1', [recId]);
    if (r.rows.length === 0) throw new NotFoundError('Not found');
    const rec = r.rows[0];
    // Deletion is destructive, so it needs the same access as reading the bytes.
    if (!canAccess(ctx, rec)) throw new ForbiddenError('Forbidden');
    const filePath = safeUploadPath(rec.file_path);
    // Row first: a failed unlink must not leave a DB row pointing at nothing.
    await q('DELETE FROM call_recordings WHERE id = $1', [rec.id]);
    if (filePath) {
      try { await Storage.remove(rec.file_path); }
      catch (e) { console.error('Recording file removal failed (row deleted):', e.message); }
    } else {
      console.error(`Refused to unlink out-of-tree recording path for recording ${rec.id}: ${rec.file_path}`);
    }
    // Clear the legacy pointer only if it still refers to the file just deleted.
    await q('UPDATE call_events SET recording_path = NULL WHERE id = $1 AND recording_path = $2', [rec.call_id, rec.file_path]);
    await audit(null, ctx, 'call.recording_deleted', 'call_recording', rec.id,
      { call_id: rec.call_id, file_path: rec.file_path, file_removed: !!(filePath && !fs.existsSync(filePath)) });
    return { deleted: true, id: rec.id, call_id: rec.call_id };
  }

  // Cross-call list for the dashboard screen, with the call metadata joined so the
  // UI renders a populated table in one request.
  async listAll(ctx, query) {
    let where = ' WHERE 1=1';
    // Where-clause params are kept separate from the page params so the total
    // count can reuse them verbatim.
    const filterParams = [];
    const push = v => { filterParams.push(v); return `$${filterParams.length}`; };

    // An agent is hard-scoped to their own recordings; not a filter the client can influence.
    if (ctx.role === 'agent') where += ` AND cr.user_id = ${push(ctx.userId)}`;
    if (query.call_id) where += ` AND cr.call_id = ${push(parseInt(query.call_id))}`;
    if (query.user_id && ctx.role !== 'agent') where += ` AND cr.user_id = ${push(parseInt(query.user_id))}`;
    if (query.date_from) where += ` AND ce.timestamp >= ${push(new Date(query.date_from).toISOString())}`;
    if (query.date_to) where += ` AND ce.timestamp <= ${push(new Date(query.date_to).toISOString())}`;
    if (query.phone) where += ` AND ce.phone_number ILIKE ${push(`%${query.phone}%`)}`;

    const limit = Math.min(Math.max(parseInt(query.limit) || 100, 1), 500);
    const offset = Math.max(parseInt(query.offset) || 0, 0);
    const rows = await q(
      `SELECT cr.id, cr.call_id, cr.user_id, cr.file_path, cr.file_size, cr.duration_seconds, cr.uploaded_at,
              ce.phone_number, ce.direction, ce.status, ce.timestamp, ce.duration_seconds AS call_duration_seconds,
              u.name AS agent_name, u.email AS agent_email
         FROM call_recordings cr
         JOIN call_events ce ON ce.id = cr.call_id
         LEFT JOIN users u ON u.id = cr.user_id${where}
        ORDER BY cr.uploaded_at DESC
        LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
      [...filterParams, limit, offset]);
    const total = await q(
      `SELECT count(*)::int AS n
         FROM call_recordings cr
         JOIN call_events ce ON ce.id = cr.call_id${where}`, filterParams);
    return {
      total: total.rows[0].n, limit, offset,
      recordings: rows.rows.map(x => ({
        id: x.id, call_id: x.call_id, user_id: x.user_id,
        file_path: x.file_path, file_size: x.file_size,
        duration_seconds: x.duration_seconds, uploaded_at: x.uploaded_at,
        file_url: `/api/calls/${x.call_id}/recordings/${x.id}/file`,
        call: { id: x.call_id, phone_number: x.phone_number, direction: x.direction,
          status: x.status, timestamp: x.timestamp, duration_seconds: x.call_duration_seconds },
        agent: { id: x.user_id, name: x.agent_name, email: x.agent_email },
      })),
    };
  }
}

module.exports = new RecordingService();
