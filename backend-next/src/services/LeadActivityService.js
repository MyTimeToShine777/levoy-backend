'use strict';

const { pool, q } = require('../config/db');
const { ValidationError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { humanDuration } = require('../utils/leadMath');
const { loadLeadForRead } = require('../utils/leadAccess');

// Only notes / status changes / manual email-whatsapp-meeting entries are stored
// (lead_activities). Calls, follow-ups, assignments and reviews are read from
// their own tables and normalised in the timeline, so it can never double-count.
const MANUAL_ACTIVITY_TYPES = ['note', 'email', 'whatsapp', 'meeting'];

class LeadActivityService {
  // Insert one lead_activities row. Takes a client (or the pool) so it can share
  // the caller's transaction: a status change and its activity must land together.
  async record(client, { leadId, userId, type, summary, metadata }) {
    const r = await client.query(
      `INSERT INTO lead_activities (lead_id, user_id, activity_type, summary, metadata)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [leadId, userId == null ? null : userId, type, summary || null,
        metadata ? JSON.stringify(metadata) : null]);
    return r.rows[0];
  }

  // Everything that happened to a lead, in one reverse-chronological list.
  async timeline(ctx, leadId, query) {
    const lead = await loadLeadForRead(ctx, leadId);

    // call_events has no lead_id, so calls are attached by phone: exact match or
    // the last 9 digits. Spreadsheet imports keep "+91…" while call logs usually
    // do not, and both belong to the same person.
    const digits = String(lead.phone || '').replace(/\D/g, '');
    const last9 = digits.length >= 9 ? digits.slice(-9) : null;

    const [callsR, fuR, asR, revR, actR, usersR] = await Promise.all([
      last9
        ? q(`SELECT ce.id, ce.user_id, ce.direction, ce.status, ce.duration_seconds,
                    ce.timestamp, ce.notes
               FROM call_events ce
              WHERE ce.phone_number = $1
                 OR RIGHT(regexp_replace(COALESCE(ce.phone_number, ''), '\\D', '', 'g'), 9) = $2
              ORDER BY ce.timestamp DESC LIMIT 300`, [lead.phone, last9])
        : Promise.resolve({ rows: [] }),
      q(`SELECT f.id,f.user_id,f.type,f.due_at,f.completed_at,f.outcome,f.notes,f.created_at
           FROM lead_follow_ups f WHERE f.lead_id = $1
          ORDER BY f.created_at DESC, f.id DESC LIMIT 300`, [lead.id]),
      q(`SELECT a.id,a.user_id,a.previous_user_id,a.assigned_by,a.note,a.created_at
           FROM lead_assignments a WHERE a.lead_id = $1
          ORDER BY a.created_at DESC, a.id DESC LIMIT 200`, [lead.id]),
      q(`SELECT r.id,r.agent_id,r.reviewer_id,r.overall_score,r.is_compliance_violation,
                r.notes,r.created_at
           FROM call_reviews r WHERE r.lead_id = $1
          ORDER BY r.created_at DESC, r.id DESC LIMIT 100`, [lead.id]),
      q(`SELECT * FROM lead_activities WHERE lead_id = $1
          ORDER BY created_at DESC, id DESC LIMIT 300`, [lead.id]),
      q('SELECT id, name, role FROM users'),
    ]);

    // One lookup table for every actor instead of a users join per source query.
    const userMap = new Map(usersR.rows.map(u => [u.id, u]));
    const actor = id => {
      const u = userMap.get(id);
      return u ? { id: u.id, name: u.name, role: u.role } : null;
    };

    // `id` is prefixed with its source table ("call:41", "act:7"): a bare integer
    // would be ambiguous once two sources are merged into one list.
    const entries = [];
    const push = (source, row, type, summary, at, actorId, metadata) => {
      entries.push({
        id: `${source}:${row.id}`, source, source_id: row.id, type,
        summary, actor: actor(actorId), at, metadata: metadata || {},
      });
    };

    for (const c of callsR.rows) {
      push('call', c, 'call',
        `${c.direction === 'incoming' ? 'Incoming' : 'Outgoing'} call · ${c.status} · ${humanDuration(c.duration_seconds)}`,
        c.timestamp, c.user_id,
        { direction: c.direction, status: c.status, duration_seconds: c.duration_seconds, notes: c.notes });
    }
    for (const f of fuR.rows) {
      push('follow_up', f, 'follow_up',
        `Follow-up scheduled · ${f.type} · due ${new Date(f.due_at).toISOString()}`,
        f.created_at, f.user_id,
        { type: f.type, due_at: f.due_at, notes: f.notes });
      // A completed task is a second, distinct event.
      if (f.completed_at) {
        entries.push({
          id: `follow_up_done:${f.id}`, source: 'follow_up_done', source_id: f.id, type: 'follow_up',
          summary: `Follow-up ${f.outcome || 'completed'}`,
          actor: actor(f.user_id), at: f.completed_at,
          metadata: { outcome: f.outcome, completed_at: f.completed_at, notes: f.notes },
        });
      }
    }
    for (const a of asR.rows) {
      const to = actor(a.user_id), from = actor(a.previous_user_id);
      push('assignment', a, 'assignment',
        from ? `Reassigned from ${from.name} to ${to ? to.name : `user ${a.user_id}`}`
          : `Assigned to ${to ? to.name : `user ${a.user_id}`}`,
        a.created_at, a.assigned_by,
        { assigned_to: a.user_id, previous_user_id: a.previous_user_id, assigned_by: a.assigned_by, note: a.note });
    }
    for (const r of revR.rows) {
      push('review', r, 'review',
        `QA review scored ${Number(r.overall_score)}${r.is_compliance_violation ? ' · compliance violation' : ''}`,
        r.created_at, r.reviewer_id,
        { agent_id: r.agent_id, overall_score: Number(r.overall_score),
          is_compliance_violation: r.is_compliance_violation, notes: r.notes });
    }
    for (const a of actR.rows) {
      push('activity', a, a.activity_type, a.summary || a.activity_type,
        a.created_at, a.user_id, a.metadata || {});
    }

    // Reverse-chronological, then newest-id-first inside the same second so the
    // order is stable across reloads.
    entries.sort((a, b) => {
      const d = new Date(b.at).getTime() - new Date(a.at).getTime();
      return d !== 0 ? d : b.source_id - a.source_id;
    });

    const limit = Math.min(Math.max(parseInt(query.limit) || 100, 1), 500);
    const offset = Math.max(parseInt(query.offset) || 0, 0);
    return {
      lead_id: lead.id,
      lead_name: lead.name,
      total: entries.length,
      limit, offset,
      counts: entries.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {}),
      timeline: entries.slice(offset, offset + limit),
    };
  }

  // Log a manual activity against a lead. Agents may do this on their own lead —
  // a note is work product, not an administrative change.
  async add(ctx, leadId, body) {
    const lead = await loadLeadForRead(ctx, leadId);
    const type = String(body.type || '').toLowerCase();
    if (!MANUAL_ACTIVITY_TYPES.includes(type)) {
      throw new ValidationError(`type must be one of ${MANUAL_ACTIVITY_TYPES.join(', ')}`);
    }
    const summary = String(body.summary || '').trim();
    if (!summary) throw new ValidationError('summary required');

    const client = await pool.connect();
    let created;
    try {
      await client.query('BEGIN');
      created = await this.record(client, {
        leadId: lead.id, userId: parseInt(ctx.userId), type, summary,
        metadata: body.metadata || null,
      });
      // A note is also the lead's notes field: the detail panel shows leads.notes,
      // so leaving it stale would hide what was just written. Appended (never
      // overwritten) so the running log is preserved.
      if (type === 'note') {
        await client.query(
          `UPDATE leads
              SET notes = CASE WHEN notes IS NULL OR notes = '' THEN $2
                               ELSE notes || E'\n' || $2 END,
                  updated_at = NOW()
            WHERE id = $1`, [lead.id, summary]);
      }
      await audit(client, ctx, 'lead.activity_added', 'lead', lead.id, { type, summary });
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

    return {
      id: created.id, lead_id: created.lead_id, type: created.activity_type,
      summary: created.summary, metadata: created.metadata,
      user_id: created.user_id, created_at: created.created_at,
      leads_notes_updated: type === 'note',
    };
  }
}

module.exports = new LeadActivityService();
