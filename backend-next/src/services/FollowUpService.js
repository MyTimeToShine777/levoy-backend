'use strict';

const { pool, q } = require('../config/db');
const { ValidationError, NotFoundError, ForbiddenError } = require('../exceptions');
const ScopeService = require('./ScopeService');
const { assertAccess } = require('../utils/leadAccess');

const FOLLOW_UP_TYPES = ['call', 'email', 'meeting', 'whatsapp', 'other'];
const FOLLOW_UP_OUTCOMES = ['completed', 'no_answer', 'rescheduled', 'cancelled'];

class FollowUpService {
  // One row per open follow-up for every lead on the page, reduced in JS: a single
  // query for N leads instead of N round trips. Rows arrive ordered by lead then
  // due_at, so the first row seen for a lead IS its next task.
  async statsForLeads(leadIds) {
    const map = new Map();
    for (const id of leadIds) map.set(id, { next: null, open: 0, overdue: 0 });
    if (!leadIds.length) return map;
    const r = await q(
      `SELECT lead_id, id, type, due_at, user_id
         FROM lead_follow_ups
        WHERE lead_id = ANY($1) AND completed_at IS NULL
        ORDER BY lead_id, due_at ASC, id ASC`, [leadIds]);
    const now = Date.now();
    for (const f of r.rows) {
      const s = map.get(f.lead_id);
      if (!s) continue;
      s.open += 1;
      if (new Date(f.due_at).getTime() < now) s.overdue += 1;
      if (!s.next) s.next = { id: f.id, type: f.type, due_at: f.due_at, user_id: f.user_id };
    }
    return map;
  }

  // The {id,type,due_at,overdue,days_until} shape shared by the list and detail
  // responses so a row and a detail page render from the same component.
  nextFollowUpJson(s) {
    if (!s || !s.next) return null;
    const ms = new Date(s.next.due_at).getTime() - Date.now();
    return {
      id: s.next.id, type: s.next.type, due_at: s.next.due_at,
      user_id: s.next.user_id, overdue: ms < 0, days_until: Math.ceil(ms / 86400000),
    };
  }

  async create(ctx, leadId, body) {
    const leadR = await q('SELECT id,name,owner_id,assigned_to FROM leads WHERE id = $1', [leadId]);
    if (leadR.rows.length === 0) throw new NotFoundError('Not found');
    const lead = leadR.rows[0];
    await assertAccess(ctx, lead);
    const type = body.type || 'call';
    if (!FOLLOW_UP_TYPES.includes(type)) throw new ValidationError('Invalid type');
    // Default owner: explicit user_id, else the lead's assignee/owner, else me.
    const userId = body.user_id ? parseInt(body.user_id) : (lead.assigned_to || lead.owner_id || parseInt(ctx.userId));
    const dueAt = body.due_at ? new Date(body.due_at).toISOString() : new Date(Date.now() + 86400000).toISOString();

    const r = await q(
      `INSERT INTO lead_follow_ups (lead_id, user_id, type, due_at, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [lead.id, userId, type, dueAt, body.notes || null]);
    const f = r.rows[0];
    const u = await q('SELECT name FROM users WHERE id = $1', [f.user_id]);
    return {
      id: f.id, lead_id: f.lead_id, user_id: f.user_id,
      user_name: u.rows.length ? u.rows[0].name : null,
      type: f.type, due_at: f.due_at, completed_at: f.completed_at,
      outcome: f.outcome, notes: f.notes, created_at: f.created_at,
      lead_name: lead.name,
    };
  }

  // Newest first, as the task list in the UI reads top-down.
  async listForLead(ctx, leadId) {
    const lead = await q('SELECT id,owner_id,assigned_to FROM leads WHERE id = $1', [leadId]);
    if (lead.rows.length === 0) throw new NotFoundError('Not found');
    await assertAccess(ctx, lead.rows[0]);
    const r = await q(
      `SELECT f.*, u.name AS user_name
         FROM lead_follow_ups f
         LEFT JOIN users u ON u.id = f.user_id
        WHERE f.lead_id = $1
        ORDER BY f.created_at DESC, f.id DESC`, [leadId]);
    return r.rows.map(f => ({
      id: f.id, lead_id: f.lead_id, user_id: f.user_id, user_name: f.user_name,
      type: f.type, due_at: f.due_at, completed_at: f.completed_at,
      outcome: f.outcome, notes: f.notes, created_at: f.created_at,
      is_overdue: !f.completed_at && new Date(f.due_at) < new Date(),
    }));
  }

  // Complete / reschedule / cancel one task. "rescheduled" closes the current
  // attempt and (when a new due date is given) opens a fresh follow-up.
  async patch(ctx, fuId, body) {
    const cur = await q(
      `SELECT f.*, l.owner_id AS lead_owner_id, l.assigned_to AS lead_assigned_to, l.name AS lead_name
         FROM lead_follow_ups f JOIN leads l ON l.id = f.lead_id
        WHERE f.id = $1`, [fuId]);
    if (cur.rows.length === 0) throw new NotFoundError('Not found');
    const f = cur.rows[0];
    // Agents may only touch tasks on leads they own or that are assigned to them.
    if (ctx.role === 'agent') {
      const uid = parseInt(ctx.userId);
      const mine = f.lead_owner_id === uid || f.user_id === uid || f.lead_assigned_to === uid;
      if (!mine) throw new ForbiddenError('Not yours');
    }

    let outcome = body.outcome;
    if (outcome === undefined && body.completed === true) outcome = 'completed';
    if (outcome !== undefined && outcome !== null && !FOLLOW_UP_OUTCOMES.includes(outcome)) {
      throw new ValidationError('Invalid outcome');
    }
    // Anything except an explicit reschedule closes the task now.
    const closes = outcome !== undefined && outcome !== 'rescheduled';
    const newDue = body.due_at || body.new_due_at;

    const client = await pool.connect();
    let released = false;
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE lead_follow_ups
            SET outcome = $1,
                notes = COALESCE($2, notes),
                completed_at = CASE WHEN $3::boolean THEN COALESCE(completed_at, NOW()) ELSE completed_at END
          WHERE id = $4
          RETURNING *`,
        [outcome ?? null, body.notes ?? null, closes, f.id]);
      let created = null;
      if (outcome === 'rescheduled') {
        if (!newDue) throw new ValidationError('due_at required to reschedule');
        const c = await client.query(
          `INSERT INTO lead_follow_ups (lead_id, user_id, type, due_at, notes)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [f.lead_id, body.user_id ? parseInt(body.user_id) : f.user_id, f.type,
            new Date(newDue).toISOString(), body.notes || `Rescheduled from follow-up #${f.id}`]);
        created = c.rows[0];
      }
      await client.query('COMMIT');
      client.release(); released = true;   // give the connection back BEFORE the follow-up reads: they need another one
      const u = await q('SELECT name FROM users WHERE id = $1', [upd.rows[0].user_id]);
      return {
        id: upd.rows[0].id, lead_id: upd.rows[0].lead_id,
        user_id: upd.rows[0].user_id, user_name: u.rows.length ? u.rows[0].name : null,
        type: upd.rows[0].type, due_at: upd.rows[0].due_at,
        completed_at: upd.rows[0].completed_at, outcome: upd.rows[0].outcome,
        notes: upd.rows[0].notes, created_at: upd.rows[0].created_at,
        lead_name: f.lead_name,
        rescheduled_to: created ? { id: created.id, due_at: created.due_at, type: created.type } : null,
      };
    } catch (e) { if (!released) await client.query('ROLLBACK'); throw e; } finally { if (!released) client.release(); }
  }

  // Due-up worklist. scope=today|overdue|upcoming|all, optional assigned_to.
  async due(ctx, query) {
    const scope = query.scope || 'today';
    if (!['today', 'overdue', 'upcoming', 'all'].includes(scope)) throw new ValidationError('Invalid scope');
    const includeCompleted = query.include_completed === 'true';

    const d = new Date();
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const now = new Date();

    // Role scoping: agent sees only their own tasks, manager their team, admin all.
    const team = await ScopeService.teamScopeIds({ userId: ctx.userId, userRole: ctx.role });
    const params = [];
    let idx = 1;
    // `WHERE 1=1` so the first appended filter is always a legal AND.
    let where = ' WHERE 1=1';
    if (ctx.role === 'agent') { where += ` AND f.user_id = $${idx}`; params.push(ctx.userId); idx++; }
    else if (team !== null) { where += ` AND f.user_id = ANY($${idx})`; params.push(team); idx++; }

    if (query.assigned_to) { where += ` AND f.user_id = $${idx}`; params.push(query.assigned_to); idx++; }

    if (scope === 'overdue') {
      where += ` AND f.due_at < $${idx} AND f.completed_at IS NULL`; params.push(now.toISOString()); idx++;
    } else if (scope === 'today') {
      where += ` AND f.due_at >= $${idx} AND f.due_at < $${idx + 1} AND f.completed_at IS NULL`;
      params.push(dayStart.toISOString(), dayEnd.toISOString()); idx += 2;
    } else if (scope === 'upcoming') {
      where += ` AND f.due_at >= $${idx} AND f.completed_at IS NULL`; params.push(dayEnd.toISOString()); idx++;
    } else if (scope === 'all' && !includeCompleted) {
      where += ' AND f.completed_at IS NULL';
    }

    const r = await q(
      `SELECT f.id, f.lead_id, f.user_id, u.name AS user_name, f.type, f.due_at,
              f.completed_at, f.outcome, f.notes, f.created_at,
              l.name AS lead_name, l.phone AS lead_phone, l.status AS lead_status
         FROM lead_follow_ups f
         LEFT JOIN users u ON u.id = f.user_id
         LEFT JOIN leads  l ON l.id = f.lead_id
        ${where}
        ORDER BY f.due_at ASC, f.id ASC
        LIMIT 500`,
      params);
    return r.rows.map(f => ({
      id: f.id, lead_id: f.lead_id, lead_name: f.lead_name, lead_phone: f.lead_phone,
      lead_status: f.lead_status, user_id: f.user_id, user_name: f.user_name,
      type: f.type, due_at: f.due_at, completed_at: f.completed_at, outcome: f.outcome,
      notes: f.notes, created_at: f.created_at,
      is_overdue: !f.completed_at && new Date(f.due_at) < now,
    }));
  }
}

module.exports = new FollowUpService();
