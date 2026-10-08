'use strict';

const { pool, q, tx } = require('../config/db');
const { ValidationError, NotFoundError, ForbiddenError, ConflictError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { daysUntil } = require('../utils/leadMath');
const { visibleSql, assertAccess } = require('../utils/leadAccess');
const AssignmentService = require('./AssignmentService');
const AssignmentRuleService = require('./AssignmentRuleService');
const FollowUpService = require('./FollowUpService');
const LeadTagService = require('./LeadTagService');
const LeadActivityService = require('./LeadActivityService');
const PipelineStageService = require('./PipelineStageService');
const LeadScoringService = require('./LeadScoringService');

// Columns the spreadsheet engine adds on top of the generic CRM columns. Returned
// additively so the Leads table can render assignment + scoring without a second call.
const ENGINE_COLUMNS = `l.segment, l.call_status, l.tier, l.priority_score, l.followup_window,
              l.telecaller_name, l.customer_name, l.pharmacy_name, l.locality, l.phone_clean,
              l.is_duplicate, l.next_best_action, l.days_since_last_call, l.external_id,
              l.received_at, l.import_batch_id`;

const SORTS = {
  updated: 'l.updated_at DESC',
  created: 'l.created_at DESC, l.id DESC',
  priority: 'COALESCE(l.priority_score, 0) DESC, l.updated_at DESC',
  followup: 'l.followup_clean ASC NULLS LAST, l.updated_at DESC',
};

class LeadService {
  async create(ctx, body) {
    if (!body.name || !body.phone) throw new ValidationError('name and phone required');
    // The status a client sends has to name a real pipeline stage, otherwise the
    // kanban would silently drop the lead into an "unmapped" bucket.
    const requestedStatus = body.status || 'new';
    if (body.status !== undefined) await PipelineStageService.assertValidStage(requestedStatus);

    const r = await q(
      `INSERT INTO leads (name,phone,email,status,source,priority,notes,owner_id,assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [body.name, body.phone, body.email || null, requestedStatus, body.source || null,
        body.priority || 'normal', body.notes || null, ctx.userId, body.assigned_to || null]);
    const l = r.rows[0];
    // A lead created with assigned_to should immediately have an owner row, or it
    // would be invisible to every multi-assignee query until the first reassignment.
    if (l.assigned_to) {
      await q(
        `INSERT INTO lead_assignees (lead_id, user_id, role, assigned_by) VALUES ($1,$2,'owner',$3)
         ON CONFLICT (lead_id, user_id) DO NOTHING`,
        [l.id, l.assigned_to, ctx.userId]);
    }

    // ── Auto-assign on create ──
    // Stays out of the way when: the client named an assignee (respect it),
    // auto_assign=false (opt out), or there are no enabled rules (nothing to do).
    let autoAssignInfo = null;
    const clientExplicitlyAssigned = body.assigned_to !== undefined && body.assigned_to !== null;
    const optedOut = body.auto_assign === false || body.auto_assign === 'false';
    const wanted = body.auto_assign === true || body.auto_assign === 'true';
    if (!clientExplicitlyAssigned && !optedOut && (wanted || await AssignmentRuleService.anyEnabledRules())) {
      const decision = await AssignmentRuleService.evaluateAutoAssign(ctx, l);
      if (decision.rule && decision.target) {
        const ac = await pool.connect();
        try {
          await ac.query('BEGIN');
          // applyAssignment (not a bare column write) so the owner row, the
          // leads.assigned_to column, the history row and the open follow-ups all
          // move together — same invariants as a manual assign.
          await AssignmentService.applyAssignment(ac, {
            lead: { ...l, assigned_to: null }, toUserId: decision.target.id,
            byUserId: parseInt(ctx.userId),
            note: `auto-assign via rule "${decision.rule.name}"`,
          });
          await audit(ac, ctx, 'lead.auto_assigned', 'lead', l.id, {
            rule: decision.rule, assigned_to: decision.target.id, via: 'lead_create',
          });
          await ac.query('COMMIT');
        } catch (e) { await ac.query('ROLLBACK'); throw e; } finally { ac.release(); }
        l.assigned_to = decision.target.id;
        autoAssignInfo = {
          applied: true, rule: decision.rule,
          assigned_to: decision.target.id, assigned_to_name: decision.target.name,
          evaluated: decision.evaluated,
        };
      } else {
        autoAssignInfo = { applied: false, reason: decision.reason || 'no rule matched', evaluated: decision.evaluated };
      }
    }

    // Every new lead gets a first follow-up task due in 24h so it can never sit
    // unworked. Owner is the assignee if one was given, else the creator.
    const fuOwner = l.assigned_to || l.owner_id || ctx.userId;
    const fu = await q(
      `INSERT INTO lead_follow_ups (lead_id, user_id, type, due_at, notes)
       VALUES ($1, $2, 'call', NOW() + INTERVAL '24 hours', $3) RETURNING id, due_at`,
      [l.id, fuOwner, 'First follow-up call (auto-created on lead creation)']);
    // Fill in tier / score / next action now, so a new lead does not read "Closed · 0" until someone presses Recalculate.
    try { await LeadScoringService.rescoreLead(l.id); } catch (e) { console.error('rescore on create failed:', e.message); }
    return {
      id: l.id, name: l.name, phone: l.phone, email: l.email, status: l.status, source: l.source,
      priority: l.priority, owner_id: l.owner_id, assigned_to: l.assigned_to, notes: l.notes,
      last_contacted_at: l.last_contacted_at, created_at: l.created_at, updated_at: l.updated_at,
      auto_follow_up: { id: fu.rows[0].id, due_at: fu.rows[0].due_at }, tags: [], auto_assign: autoAssignInfo,
    };
  }

  // Build the WHERE for the list/summary endpoints from query filters.
  buildListFilter(ctx, query) {
    const params = [];
    // Every filter is prefixed with `l.` because `name` exists on BOTH leads and
    // users. Merged-away leads are soft-deleted and never appear in a working list.
    let where = ' WHERE 1=1' + visibleSql(ctx, 'l', params);
    let idx = params.length + 1;

    where += ' AND l.merged_into_lead_id IS NULL';
    if (query.assigned_only === 'true' && ctx.role === 'agent') { where += ` AND l.assigned_to = $${idx}`; params.push(ctx.userId); idx++; }
    if (query.status) { where += ` AND l.status = $${idx}`; params.push(query.status); idx++; }
    if (query.priority) { where += ` AND l.priority = $${idx}`; params.push(query.priority); idx++; }
    if (query.assigned_to) { where += ` AND l.assigned_to = $${idx}`; params.push(query.assigned_to); idx++; }
    // assigned = unassigned | mine | <user id>   (the Unassigned / My leads tabs)
    if (query.assigned === 'unassigned') where += ' AND l.assigned_to IS NULL';
    else if (query.assigned === 'assigned') where += ' AND l.assigned_to IS NOT NULL';
    else if (query.assigned === 'mine') { where += ` AND l.assigned_to = $${idx}`; params.push(parseInt(ctx.userId)); idx++; }
    else if (/^\d+$/.test(String(query.assigned || ''))) { where += ` AND l.assigned_to = $${idx}`; params.push(parseInt(query.assigned)); idx++; }
    if (query.import_batch_id) { where += ` AND l.import_batch_id = $${idx}`; params.push(parseInt(query.import_batch_id)); idx++; }
    if (query.segment) { where += ` AND l.segment = $${idx}`; params.push(query.segment); idx++; }
    if (query.tier) { where += ` AND l.tier = $${idx}`; params.push(query.tier); idx++; }
    if (query.followup_window) { where += ` AND l.followup_window = $${idx}`; params.push(query.followup_window); idx++; }
    if (query.call_status) { where += ` AND l.call_status = $${idx}`; params.push(query.call_status); idx++; }
    if (query.tag_id) {
      // EXISTS rather than a JOIN: the join would multiply a lead's row by its tag
      // count and break the LIMIT/OFFSET paging.
      where += ` AND EXISTS (SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = $${idx})`;
      params.push(parseInt(query.tag_id)); idx++;
    }
    if (query.overdue_only === 'true') {
      // "Has at least one task past its due date and not yet completed."
      where += ` AND EXISTS (SELECT 1 FROM lead_follow_ups f
                             WHERE f.lead_id = l.id AND f.completed_at IS NULL AND f.due_at < NOW())`;
    }
    if (query.search) {
      // Each ILIKE needs its own positional placeholder — Postgres counts
      // placeholders, not distinct values.
      where += ` AND (l.name ILIKE $${idx} OR l.phone ILIKE $${idx + 1} OR l.email ILIKE $${idx + 2}
                   OR l.pharmacy_name ILIKE $${idx + 3} OR l.customer_name ILIKE $${idx + 4})`;
      const s = `%${query.search}%`;
      params.push(s, s, s, s, s);
      idx += 5;
    }
    return { where, params, idx };
  }

  async list(ctx, query) {
    const { where, params, idx } = this.buildListFilter(ctx, query);
    const limit = Math.min(Math.max(parseInt(query.limit) || 200, 1), 1000);
    const offset = Math.max(parseInt(query.offset) || 0, 0);
    const order = SORTS[query.sort] || SORTS.updated;

    const totalR = await q(`SELECT COUNT(*)::int AS c FROM leads l${where}`, params);
    const r = await q(
      `SELECT l.id,l.name,l.phone,l.email,l.status,l.source,l.priority,l.owner_id,l.assigned_to,l.notes,l.last_contacted_at,l.created_at,l.updated_at,
              au.name AS assigned_to_name, au.avatar_url AS assigned_to_avatar,
              ${ENGINE_COLUMNS}
         FROM leads l
         LEFT JOIN users au ON au.id = l.assigned_to${where}
        ORDER BY ${order} LIMIT $${idx} OFFSET $${idx + 1}`, [...params, limit, offset]);

    // Two extra queries for the whole page (not per lead) — a 200-lead list is
    // still exactly 3 round trips (+ the count).
    const ids = r.rows.map(l => l.id);
    const byLead = await AssignmentService.assigneesForLeads(ids);
    const fuByLead = await FollowUpService.statsForLeads(ids);
    const tagsByLead = await LeadTagService.tagsForLeads(ids);
    const rows = r.rows.map(l => {
      const assignees = byLead.get(l.id) || [];
      const fu = fuByLead.get(l.id) || { next: null, open: 0, overdue: 0 };
      return {
        id: l.id, name: l.name, phone: l.phone, email: l.email, status: l.status, source: l.source,
        priority: l.priority, owner_id: l.owner_id, assigned_to: l.assigned_to,
        assigned_to_name: l.assigned_to_name, assigned_to_avatar: l.assigned_to_avatar,
        notes: l.notes, last_contacted_at: l.last_contacted_at, created_at: l.created_at, updated_at: l.updated_at,
        segment: l.segment, call_status: l.call_status, tier: l.tier, priority_score: l.priority_score,
        followup_window: l.followup_window, telecaller_name: l.telecaller_name,
        customer_name: l.customer_name, pharmacy_name: l.pharmacy_name, locality: l.locality,
        phone_clean: l.phone_clean, is_duplicate: l.is_duplicate, next_best_action: l.next_best_action,
        days_since_last_call: l.days_since_last_call, external_id: l.external_id,
        received_at: l.received_at, import_batch_id: l.import_batch_id,
        assignees: assignees.map(a => ({ user_id: a.user_id, name: a.name, role: a.role })),
        assignee_count: assignees.length,
        tags: tagsByLead.get(l.id) || [],
        next_follow_up: FollowUpService.nextFollowUpJson(fu),
        open_follow_ups: fu.open,
        overdue_count: fu.overdue,
      };
    });
    return { rows, total: totalR.rows[0].c };
  }

  // Counts for the Leads page tabs / stat bar, under the same visibility rules as
  // the list. One pass with FILTER aggregates.
  async summary(ctx) {
    const params = [];
    const scope = visibleSql(ctx, 'l', params);
    const uidIdx = params.length + 1;
    const r = await q(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE l.assigned_to IS NULL)::int AS unassigned,
              COUNT(*) FILTER (WHERE l.assigned_to IS NOT NULL)::int AS assigned,
              COUNT(*) FILTER (WHERE l.assigned_to = $${uidIdx})::int AS mine,
              COUNT(*) FILTER (WHERE l.tier = 'Hot')::int AS hot,
              COUNT(*) FILTER (WHERE l.tier = 'Warm')::int AS warm,
              COUNT(*) FILTER (WHERE l.followup_window = 'Due Today')::int AS due_today,
              COUNT(*) FILTER (WHERE l.followup_window = 'Overdue')::int AS overdue,
              COUNT(*) FILTER (WHERE COALESCE(l.is_duplicate, false))::int AS duplicates,
              COUNT(*) FILTER (WHERE l.created_at >= NOW() - INTERVAL '7 days')::int AS new_this_week
         FROM leads l
        WHERE 1=1 AND l.merged_into_lead_id IS NULL AND l.deleted_at IS NULL${scope}`,
      [...params, parseInt(ctx.userId)]);
    return r.rows[0];
  }

  async get(ctx, leadId) {
    const r = await q(
      `SELECT l.*, au.name AS assigned_to_name, au.avatar_url AS assigned_to_avatar, au.email AS assigned_to_email
         FROM leads l LEFT JOIN users au ON au.id = l.assigned_to
        WHERE l.id = $1`, [leadId]);
    if (r.rows.length === 0) throw new NotFoundError('Not found');
    const l = r.rows[0];
    await assertAccess(ctx, l);

    // Everything the detail view needs in one round trip: follow-up count, the
    // next thing due, and a compact assignment trail.
    const [fuCounts, nextFu, history] = await Promise.all([
      q('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE completed_at IS NULL) AS open FROM lead_follow_ups WHERE lead_id = $1', [l.id]),
      q(`SELECT f.id,f.type,f.due_at,f.user_id,u.name AS user_name
           FROM lead_follow_ups f LEFT JOIN users u ON u.id = f.user_id
          WHERE f.lead_id = $1 AND f.completed_at IS NULL
          ORDER BY f.due_at ASC LIMIT 1`, [l.id]),
      q(`SELECT a.id,a.previous_user_id,pu.name AS previous_user_name,a.user_id,au.name AS user_name,
                a.assigned_by,ab.name AS assigned_by_name,a.note,a.created_at
           FROM lead_assignments a
           LEFT JOIN users pu ON pu.id = a.previous_user_id
           LEFT JOIN users au ON au.id = a.user_id
           LEFT JOIN users ab ON ab.id = a.assigned_by
          WHERE a.lead_id = $1 ORDER BY a.id DESC LIMIT 10`, [l.id]),
    ]);
    const assignees = await AssignmentService.assigneeList(l.id);
    const [tags, fuStat] = await Promise.all([
      LeadTagService.tagsForLeads([l.id]),
      FollowUpService.statsForLeads([l.id]),
    ]);
    // Same {id,type,due_at,overdue,days_until} shape the list endpoint returns.
    const fuStatRow = fuStat.get(l.id) || { next: null, open: 0, overdue: 0 };

    return {
      id: l.id, name: l.name, phone: l.phone, email: l.email, status: l.status,
      source: l.source, priority: l.priority, owner_id: l.owner_id,
      assigned_to: l.assigned_to, assigned_to_name: l.assigned_to_name,
      assigned_to_avatar: l.assigned_to_avatar, assigned_to_email: l.assigned_to_email,
      notes: l.notes, last_contacted_at: l.last_contacted_at,
      created_at: l.created_at, updated_at: l.updated_at,
      // A merged lead is soft-deleted, not gone: it still renders (with this
      // pointer) so a stale link can redirect to the surviving lead.
      merged_into_lead_id: l.merged_into_lead_id || null,
      deleted_at: l.deleted_at || null,
      tags: tags.get(l.id) || [],
      follow_up_count: parseInt(fuCounts.rows[0].total) || 0,
      open_follow_up_count: parseInt(fuCounts.rows[0].open) || 0,
      open_follow_ups: fuStatRow.open,
      overdue_count: fuStatRow.overdue,
      next_follow_up: nextFu.rows.length ? {
        id: nextFu.rows[0].id, type: nextFu.rows[0].type,
        due_at: nextFu.rows[0].due_at, user_id: nextFu.rows[0].user_id,
        user_name: nextFu.rows[0].user_name,
        overdue: new Date(nextFu.rows[0].due_at) < new Date(),
        days_until: daysUntil(nextFu.rows[0].due_at),
      } : null,
      assignment_count: history.rows.length,
      assignees: assignees.map(a => ({ user_id: a.user_id, name: a.name, role: a.role })),
      assignee_count: assignees.length,
      assignment_history: history.rows.map(a => ({
        id: a.id, assigned_to: a.user_id, assigned_to_name: a.user_name,
        previous_assigned_to: a.previous_user_id, previous_assigned_to_name: a.previous_user_name,
        assigned_by: a.assigned_by, assigned_by_name: a.assigned_by_name,
        note: a.note, created_at: a.created_at,
      })),
      // Spreadsheet engine + provenance (additive)
      segment: l.segment, call_status: l.call_status, call_done: l.call_done, tier: l.tier,
      priority_score: l.priority_score, followup_window: l.followup_window,
      followup_date: l.followup_clean || l.followup_date, call_attempted_date: l.call_attempted_date,
      lead_assigned_date: l.lead_assigned_date, telecaller_name: l.telecaller_name,
      customer_name: l.customer_name, pharmacy_name: l.pharmacy_name, locality: l.locality,
      address: l.address, remarks: l.remarks, phone_clean: l.phone_clean,
      is_duplicate: l.is_duplicate, duplicate_reasons: l.duplicate_reasons,
      next_best_action: l.next_best_action, data_check: l.data_check,
      days_since_last_call: l.days_since_last_call, win_probability: l.win_probability,
      external_id: l.external_id, received_at: l.received_at, lead_meta: l.lead_meta,
      import_batch_id: l.import_batch_id,
    };
  }

  // `canAssign`: whether the caller holds the RBAC `assign` action on leads. Changing
  // the owner through PUT is an assignment, so it needs it (spec §6.5).
  async update(ctx, leadId, body, { canAssign = true } = {}) {
    const c = await q('SELECT id, owner_id, assigned_to, status FROM leads WHERE id = $1', [leadId]);
    if (c.rows.length === 0) throw new NotFoundError('Not found');
    await assertAccess(ctx, c.rows[0]);
    const oldStatus = c.rows[0].status;

    // Reject a status that names no configured stage before touching the row —
    // otherwise the lead silently disappears from the kanban.
    if (body.status !== undefined) await PipelineStageService.assertValidStage(body.status);
    if (body.assigned_to !== undefined && !canAssign) throw new ForbiddenError('Forbidden');

    // assigned_to is excluded from the generic field loop: changing the owner has
    // to go through the assignee set so lead_assignees and the column never
    // disagree. Everything else is a plain column update.
    const fields = [];
    const values = [];
    let idx = 1;
    const CALL_FIELDS = ['call_status', 'remarks', 'followup_date', 'call_attempted_date'];
    for (const k of ['name', 'phone', 'email', 'status', 'source', 'priority', 'notes', ...CALL_FIELDS]) {
      if (body[k] !== undefined) { fields.push(`${k} = $${idx}`); values.push(body[k]); idx++; }
    }
    // Recording a call outcome means a call happened today, unless the client sends the date.
    if (body.call_status !== undefined && body.call_attempted_date === undefined) {
      fields.push('call_attempted_date = CURRENT_DATE');
    }
    if (body.assigned_to !== undefined) {
      const to = body.assigned_to;
      if (to === null) {
        // Explicit null clears the owner so the lead is genuinely unassigned.
        fields.push(`assigned_to = $${idx}`); values.push(null); idx++;
      } else {
        const uid = parseInt(to);
        if (!Number.isInteger(uid)) throw new ValidationError('assigned_to must be an integer or null');
        await AssignmentService.assertAssignable(uid);
        fields.push(`assigned_to = $${idx}`); values.push(uid); idx++;
      }
    }
    if (fields.length === 0) throw new ValidationError('No fields');
    fields.push('updated_at = NOW()');
    values.push(leadId);

    const r = await q(`UPDATE leads SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    let l = r.rows[0];

    // Keep Hot/Warm/Cool, priority score and next best action in step with the call fields.
    if (CALL_FIELDS.some((k) => body[k] !== undefined)) {
      await LeadScoringService.rescoreLead(l.id);
      l = (await q('SELECT * FROM leads WHERE id = $1', [l.id])).rows[0];
    }

    if (body.assigned_to !== undefined) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (body.assigned_to === null) {
          await client.query("DELETE FROM lead_assignees WHERE lead_id = $1 AND role = 'owner'", [l.id]);
        } else {
          await AssignmentService.upsertAssignee(client, { leadId: l.id, userId: parseInt(body.assigned_to), role: 'owner', byUserId: parseInt(ctx.userId) });
        }
        await AssignmentService.syncLeadOwner(client, l.id);
        await audit(client, ctx, 'lead.owner_changed', 'lead', l.id,
          { from: c.rows[0].assigned_to, to: body.assigned_to === null ? null : parseInt(body.assigned_to), via: 'lead_update' });
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }

    // Every status change leaves a trail. A PUT that re-sends the same status is
    // not a change and records nothing.
    let statusActivity = null;
    if (l.status !== oldStatus) {
      statusActivity = await LeadActivityService.record(pool, {
        leadId: l.id, userId: parseInt(ctx.userId), type: 'status_change',
        summary: `Status changed from ${oldStatus} to ${l.status}`,
        metadata: { old_status: oldStatus, new_status: l.status },
      });
      await audit(null, ctx, 'lead.status_changed', 'lead', l.id, { from: oldStatus, to: l.status, via: 'lead_update' });
    }
    const owner = await AssignmentService.assigneeList(l.id);
    const tags = await LeadTagService.tagsForLeads([l.id]);
    return {
      id: l.id, name: l.name, phone: l.phone, email: l.email, status: l.status, source: l.source,
      priority: l.priority, owner_id: l.owner_id, assigned_to: l.assigned_to, notes: l.notes,
      last_contacted_at: l.last_contacted_at, created_at: l.created_at, updated_at: l.updated_at,
      assignees: owner.map(a => ({ user_id: a.user_id, name: a.name, role: a.role })),
      assignee_count: owner.length,
      tags: tags.get(l.id) || [],
      status_change: statusActivity ? {
        id: statusActivity.id, old_status: oldStatus, new_status: l.status, created_at: statusActivity.created_at,
      } : null,
    };
  }

  // Hard delete (there is no deleted_at restore path, so a soft delete would be a
  // half-built feature). Dependency rows are removed explicitly rather than
  // relying on ON DELETE CASCADE, because constraint names differ across tables.
  async remove(ctx, leadId) {
    const c = await q('SELECT id, name, owner_id, status FROM leads WHERE id = $1', [leadId]);
    if (c.rows.length === 0) throw new NotFoundError('Not found');
    const lead = c.rows[0];

    // Same ownership rule as PUT: an agent may only delete their own (created) leads.
    if (ctx.role === 'agent' && lead.owner_id !== parseInt(ctx.userId)) {
      throw new ForbiddenError('You can only delete your own leads');
    }

    // Guard against destroying a lead that still has live work attached. Merging
    // is the correct operation for those. A follow-up is open while completed_at IS NULL.
    const [fu] = (await q(
      'SELECT count(*)::int AS n FROM lead_follow_ups WHERE lead_id = $1 AND completed_at IS NULL', [lead.id])).rows;
    if (fu.n > 0) {
      throw new ConflictError(
        `This lead has ${fu.n} pending follow-up${fu.n === 1 ? '' : 's'}. Complete or cancel them first, or use Merge to fold it into another lead.`,
        { pending_follow_ups: fu.n });
    }

    const deleted = await tx(async ({ q: tq }) => {
      await tq('DELETE FROM lead_assignees WHERE lead_id = $1', [lead.id]);
      await tq('DELETE FROM lead_tags WHERE lead_id = $1', [lead.id]);
      await tq('DELETE FROM lead_follow_ups WHERE lead_id = $1', [lead.id]);
      await tq('DELETE FROM lead_activities WHERE lead_id = $1', [lead.id]);
      const d = await tq('DELETE FROM leads WHERE id = $1 RETURNING id', [lead.id]);
      if (d.rows.length === 0) throw new Error('delete matched no row');
      return d.rows[0].id;
    });

    await audit(null, ctx, 'lead.deleted', 'lead', deleted, {
      name: lead.name, status: lead.status, owner_id: lead.owner_id,
    });
    return { deleted: true, id: deleted, name: lead.name };
  }

  async contact(ctx, leadId) {
    const c = await q('SELECT id, owner_id, assigned_to, status FROM leads WHERE id = $1', [leadId]);
    if (c.rows.length === 0) throw new NotFoundError('Not found');
    await assertAccess(ctx, c.rows[0]);
    const oldStatus = c.rows[0].status;
    const newStatus = oldStatus === 'new' ? 'contacted' : oldStatus;
    const r = await q(
      'UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW(), status = $1 WHERE id = $2 RETURNING id, last_contacted_at, status',
      [newStatus, leadId]);
    // Logging a contact IS a status change for a fresh lead.
    if (newStatus !== oldStatus) {
      await LeadActivityService.record(pool, {
        leadId: r.rows[0].id, userId: parseInt(ctx.userId), type: 'status_change',
        summary: `Status changed from ${oldStatus} to ${newStatus}`,
        metadata: { old_status: oldStatus, new_status: newStatus, via: 'contact' },
      });
    }
    return { id: r.rows[0].id, last_contacted_at: r.rows[0].last_contacted_at, status: r.rows[0].status };
  }

  // Validated per lead so one bad id reports itself instead of failing the batch,
  // and one audit entry covers the whole run.
  async bulkStatus(ctx, body) {
    const ids = body.lead_ids;
    const status = body.status;
    if (!Array.isArray(ids) || ids.length === 0) throw new ValidationError('lead_ids must be a non-empty array');
    if (ids.length > 1000) throw new ValidationError('lead_ids limited to 1000 per call');
    await PipelineStageService.assertValidStage(status);
    const leadIds = ids.map(x => parseInt(x)).filter(Number.isInteger);
    const rows = await q('SELECT id, name, status, merged_into_lead_id FROM leads WHERE id = ANY($1)', [leadIds]);
    const found = new Map(rows.rows.map(l => [l.id, l]));

    const updated = [], skipped = [];
    const toUpdate = [];
    for (const rawId of ids) {
      const id = parseInt(rawId);
      if (!Number.isInteger(id)) { skipped.push({ id: rawId, reason: 'not an integer id' }); continue; }
      const lead = found.get(id);
      if (!lead) { skipped.push({ id: rawId, reason: 'Lead not found' }); continue; }
      if (lead.merged_into_lead_id) { skipped.push({ id, reason: `already merged into #${lead.merged_into_lead_id}` }); continue; }
      toUpdate.push(lead);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const lead of toUpdate) {
        // Same status as before: no change, so no activity row.
        if (lead.status === status) { skipped.push({ id: lead.id, reason: `already '${status}'` }); continue; }
        await client.query('UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2', [status, lead.id]);
        await LeadActivityService.record(client, {
          leadId: lead.id, userId: parseInt(ctx.userId), type: 'status_change',
          summary: body.note ? `Bulk status change to ${status} — ${body.note}` : `Bulk status change to ${status}`,
          metadata: { old_status: lead.status, new_status: status, note: body.note || null, bulk: true },
        });
        updated.push(lead.id);
      }
      await audit(client, ctx, 'lead.bulk_status', 'lead_batch', null, {
        status, updated: updated.length, skipped: skipped.length, lead_ids: updated, note: body.note || null,
      });
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

    return { status, updated, skipped, updated_count: updated.length, skipped_count: skipped.length };
  }
}

module.exports = new LeadService();
