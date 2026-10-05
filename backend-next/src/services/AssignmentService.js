'use strict';

const { pool, q } = require('../config/db');
const { OPEN_LEAD_STATUSES, ASSIGNMENT_CAPACITY } = require('../config/constants');
const { ValidationError, NotFoundError } = require('../exceptions');
const { audit } = require('../utils/audit');
const ScopeService = require('./ScopeService');
const { assertAccess } = require('../utils/leadAccess');

const ASSIGNEE_ROLES = ['owner', 'collaborator', 'watcher'];

/*
 * Lead assignment. `lead_assignees` is the source of truth (exactly ONE row per
 * lead may carry role='owner', enforced by a partial unique index);
 * leads.assigned_to mirrors that owner so the single-assignee code keeps working.
 */
class AssignmentService {
  get ROLES() { return ASSIGNEE_ROLES; }

  // Reconcile leads.assigned_to with lead_assignees after ANY change to the set.
  // If a lead somehow has no owner row the column is nulled rather than left
  // pointing at someone who is no longer on the lead.
  async syncLeadOwner(client, leadId) {
    const owner = await client.query(
      `SELECT user_id FROM lead_assignees WHERE lead_id = $1 AND role = 'owner' LIMIT 1`, [leadId]);
    const ownerId = owner.rows.length ? owner.rows[0].user_id : null;
    await client.query('UPDATE leads SET assigned_to = $1, updated_at = NOW() WHERE id = $2', [ownerId, leadId]);
    return ownerId;
  }

  // Upsert one member of the assignee set.
  //
  // OWNER PROMOTION: the partial unique index means a second 'owner' row for the
  // same lead would be rejected, so demotion happens BEFORE the insert. A
  // previous owner is demoted to 'collaborator' rather than removed.
  async upsertAssignee(client, { leadId, userId, role, byUserId }) {
    const existing = await client.query(
      'SELECT id, role FROM lead_assignees WHERE lead_id = $1 AND user_id = $2', [leadId, userId]);
    if (existing.rows.length > 0) {
      if (existing.rows[0].role === role) return { user_id: userId, role, changed: false };
      if (role === 'owner') {
        await client.query(
          `UPDATE lead_assignees SET role = 'collaborator' WHERE lead_id = $1 AND role = 'owner' AND user_id <> $2`,
          [leadId, userId]);
      }
      const r = await client.query(
        `UPDATE lead_assignees SET role = $1, assigned_by = $2 WHERE lead_id = $3 AND user_id = $4 RETURNING id, created_at`,
        [role, byUserId, leadId, userId]);
      return { user_id: userId, role, changed: true, previous_role: existing.rows[0].role, id: r.rows[0].id, created_at: r.rows[0].created_at };
    }
    if (role === 'owner') {
      await client.query(
        `UPDATE lead_assignees SET role = 'collaborator' WHERE lead_id = $1 AND role = 'owner' AND user_id <> $2`,
        [leadId, userId]);
    }
    const r = await client.query(
      `INSERT INTO lead_assignees (lead_id, user_id, role, assigned_by) VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
      [leadId, userId, role, byUserId]);
    return { user_id: userId, role, changed: true, added: true, id: r.rows[0].id, created_at: r.rows[0].created_at };
  }

  // Full assignee list with names, roles, who assigned and when.
  async assigneeList(leadId) {
    const r = await q(
      `SELECT la.id, la.user_id, la.role, la.assigned_by, la.created_at,
              u.name, u.email, u.role AS user_role, u.avatar_url, u.is_active,
              ab.name AS assigned_by_name
         FROM lead_assignees la
         JOIN users u ON u.id = la.user_id
         LEFT JOIN users ab ON ab.id = la.assigned_by
        WHERE la.lead_id = $1
        -- owner first, then collaborators, then watchers; stable within a group
        ORDER BY CASE la.role WHEN 'owner' THEN 0 WHEN 'collaborator' THEN 1 ELSE 2 END, la.id`,
      [leadId]);
    return r.rows.map(a => ({
      id: a.id, user_id: a.user_id, name: a.name, email: a.email,
      role: a.role, user_role: a.user_role, avatar_url: a.avatar_url, is_active: a.is_active,
      assigned_by: a.assigned_by, assigned_by_name: a.assigned_by_name, created_at: a.created_at,
    }));
  }

  // Batch assignee fetch for list endpoints: one query for N leads, grouped in JS.
  async assigneesForLeads(leadIds) {
    if (!leadIds.length) return new Map();
    const r = await q(
      `SELECT la.lead_id, la.user_id, la.role, u.name, u.email
         FROM lead_assignees la JOIN users u ON u.id = la.user_id
        WHERE la.lead_id = ANY($1)
        ORDER BY la.lead_id,
                 CASE la.role WHEN 'owner' THEN 0 WHEN 'collaborator' THEN 1 ELSE 2 END, la.id`,
      [leadIds]);
    const map = new Map();
    for (const a of r.rows) {
      if (!map.has(a.lead_id)) map.set(a.lead_id, []);
      map.get(a.lead_id).push({ user_id: a.user_id, name: a.name, role: a.role, email: a.email });
    }
    return map;
  }

  // Write the assignment, the history row and re-point any still-open follow-up
  // tasks at the new owner — all in one transaction so a reassignment is atomic.
  async applyAssignment(client, { lead, toUserId, byUserId, note }) {
    const prev = lead.assigned_to != null ? lead.assigned_to : null;
    // lead_assignees first: it is the source of truth, and syncLeadOwner writes
    // leads.assigned_to as a side effect.
    await this.upsertAssignee(client, { leadId: lead.id, userId: toUserId, role: 'owner', byUserId });
    await this.syncLeadOwner(client, lead.id);
    const hist = await client.query(
      `INSERT INTO lead_assignments (lead_id, previous_user_id, user_id, assigned_by, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, previous_user_id, user_id, assigned_by, note, created_at`,
      [lead.id, prev, toUserId, byUserId, note || null]);
    // Open tasks follow the lead to its new owner; completed history stays put.
    await client.query('UPDATE lead_follow_ups SET user_id = $1 WHERE lead_id = $2 AND completed_at IS NULL', [toUserId, lead.id]);
    return hist.rows[0];
  }

  // Validate that `userId` can receive leads. Returns the user row.
  async assertAssignable(userId) {
    const t = await q('SELECT id,name,role,is_active FROM users WHERE id = $1', [userId]);
    if (t.rows.length === 0) throw new ValidationError('Assignee does not exist');
    if (!['agent', 'manager'].includes(t.rows[0].role)) throw new ValidationError('Assignee must be an agent or manager');
    if (!t.rows[0].is_active) throw new ValidationError('Assignee is inactive');
    return t.rows[0];
  }

  // Assign one or many people to a lead.
  //
  //   { assigned_to: 8, note? }                       — legacy single-owner
  //   { assignments: [{user_id, role}], note? }       — multi-assignee set
  // The legacy shape is normalised to a one-element assignments array with
  // role='owner', so both run exactly the same code.
  async assign(ctx, leadIdRaw, body) {
    const { assigned_to, note } = body;
    const raw = body.assignments;

    let wanted;
    let legacyShape = false;
    if (Array.isArray(raw)) {
      if (raw.length === 0) throw new ValidationError('assignments must be a non-empty array');
      wanted = raw.map(a => ({ user_id: a.user_id, role: a.role || 'collaborator' }));
    } else if (assigned_to !== undefined && assigned_to !== null && assigned_to !== '') {
      wanted = [{ user_id: assigned_to, role: 'owner' }];
      legacyShape = true;
    } else {
      throw new ValidationError('assigned_to required');
    }

    // Validate every entry up front so a bad member cannot half-apply the set.
    const seen = new Set();
    for (const w of wanted) {
      const uid = parseInt(w.user_id);
      if (!Number.isInteger(uid)) throw new ValidationError('user_id must be an integer');
      if (seen.has(uid)) throw new ValidationError(`Duplicate assignee in set: ${uid}`);
      seen.add(uid);
      if (!ASSIGNEE_ROLES.includes(w.role)) {
        throw new ValidationError(`Invalid role '${w.role}'. Must be one of ${ASSIGNEE_ROLES.join(', ')}`);
      }
      const t = await this.assertAssignable(uid);
      w.name = t.name;
    }

    // At most one owner in the incoming set; the FIRST is authoritative and any
    // later 'owner' is downgraded to collaborator.
    const ownerIdx = wanted.findIndex(w => w.role === 'owner');
    if (ownerIdx > 0) wanted[ownerIdx].role = 'collaborator';
    const ownerWanted = ownerIdx === -1 ? null : wanted[ownerIdx];

    const leadR = await q('SELECT id,name,status,owner_id,assigned_to FROM leads WHERE id = $1', [leadIdRaw]);
    if (leadR.rows.length === 0) throw new NotFoundError('Not found');
    const lead = leadR.rows[0];
    const previousOwner = lead.assigned_to != null ? lead.assigned_to : null;
    const byUserId = parseInt(ctx.userId);

    const client = await pool.connect();
    let released = false;
    try {
      await client.query('BEGIN');
      // Two people assigning the same lead at the same moment must take turns, otherwise both see "no owner yet"
      // and both try to become the owner (the one-owner rule then fails one of them with a 500).
      await client.query('SELECT id FROM leads WHERE id = $1 FOR UPDATE', [lead.id]);
      // Who was the owner BEFORE we touch anything, so we can report them as
      // demoted rather than relying on a post-hoc diff.
      const beforeOwnerRow = await client.query(
        `SELECT user_id FROM lead_assignees WHERE lead_id = $1 AND role = 'owner' LIMIT 1`, [lead.id]);
      const beforeOwner = beforeOwnerRow.rows.length ? beforeOwnerRow.rows[0].user_id : null;

      let hist = null;
      if (ownerWanted) {
        // The legacy {assigned_to} shape ALWAYS writes a history row, even when
        // the owner is unchanged. The multi form only writes one when the owner
        // actually moves, so re-posting an identical set is not noise.
        if (legacyShape || ownerWanted.user_id !== beforeOwner) {
          hist = await this.applyAssignment(client, { lead, toUserId: ownerWanted.user_id, byUserId, note });
        } else {
          await this.upsertAssignee(client, { leadId: lead.id, userId: ownerWanted.user_id, role: 'owner', byUserId });
        }
      }
      // Everyone else in the set (collaborators/watchers).
      for (const w of wanted) {
        if (ownerWanted && w.user_id === ownerWanted.user_id) continue;
        await this.upsertAssignee(client, { leadId: lead.id, userId: w.user_id, role: w.role, byUserId });
      }
      const ownerId = await this.syncLeadOwner(client, lead.id);
      await audit(client, ctx, 'lead.assignment_changed', 'lead', lead.id, {
        assignments: wanted.map(w => ({ user_id: w.user_id, role: w.role })),
        previous_owner: beforeOwner, owner: ownerId, note: note || null,
      });
      await client.query('COMMIT');
      client.release(); released = true;   // give the connection back BEFORE the follow-up reads: they need another one

      const list = await this.assigneeList(lead.id);
      const demoted = beforeOwner && ownerWanted && beforeOwner !== ownerWanted.user_id
        ? (await q('SELECT name FROM users WHERE id = $1', [beforeOwner])).rows[0]?.name || null
        : null;

      return {
        lead_id: lead.id,
        lead_name: lead.name,
        assigned_to: ownerId,
        assigned_to_name: (list.find(a => a.role === 'owner') || {}).name || null,
        previous_assigned_to: previousOwner,
        reassigned: previousOwner != null && previousOwner !== ownerId,
        note: note || null,
        history: hist ? {
          id: hist.id, previous_user_id: hist.previous_user_id, user_id: hist.user_id,
          assigned_by: hist.assigned_by, note: hist.note, created_at: hist.created_at,
        } : null,
        assignees: list.map(a => ({ user_id: a.user_id, name: a.name, role: a.role })),
        assignee_count: list.length,
        demoted_owner: demoted,
      };
    } catch (e) { if (!released) await client.query('ROLLBACK'); throw e; } finally { if (!released) client.release(); }
  }

  // Full multi-assignee list for one lead.
  async listAssignees(ctx, leadIdRaw) {
    const lead = await q('SELECT id,name,owner_id,assigned_to FROM leads WHERE id = $1', [leadIdRaw]);
    if (lead.rows.length === 0) throw new NotFoundError('Not found');
    await assertAccess(ctx, lead.rows[0]);
    const list = await this.assigneeList(lead.rows[0].id);
    return {
      lead_id: lead.rows[0].id, lead_name: lead.rows[0].name,
      assigned_to: lead.rows[0].assigned_to, assignee_count: list.length, assignees: list,
    };
  }

  // Remove one assignee.
  //
  // OWNER PROMOTION: if the person removed WAS the owner and a collaborator
  // remains, the longest-serving collaborator is promoted so the lead is never
  // left ownerless. Watchers are not eligible — they were never doing the work.
  async removeAssignee(ctx, leadIdRaw, userIdRaw) {
    const leadId = parseInt(leadIdRaw);
    const userId = parseInt(userIdRaw);
    if (!Number.isInteger(leadId) || !Number.isInteger(userId)) throw new ValidationError('Invalid id');
    const leadR = await q('SELECT id,name,assigned_to FROM leads WHERE id = $1', [leadId]);
    if (leadR.rows.length === 0) throw new NotFoundError('Not found');

    const client = await pool.connect();
    let released = false;
    let promoted = null;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM leads WHERE id = $1 FOR UPDATE', [leadId]);
      const cur = await client.query(
        'SELECT id, role FROM lead_assignees WHERE lead_id = $1 AND user_id = $2', [leadId, userId]);
      if (cur.rows.length === 0) throw new NotFoundError('Not assigned to this lead');
      const wasOwner = cur.rows[0].role === 'owner';
      await client.query('DELETE FROM lead_assignees WHERE lead_id = $1 AND user_id = $2', [leadId, userId]);

      if (wasOwner) {
        const cand = await client.query(
          `SELECT la.user_id, u.name FROM lead_assignees la JOIN users u ON u.id = la.user_id
            WHERE la.lead_id = $1 AND la.role = 'collaborator' ORDER BY la.id ASC LIMIT 1`, [leadId]);
        if (cand.rows.length > 0) {
          await client.query(`UPDATE lead_assignees SET role = 'owner' WHERE lead_id = $1 AND user_id = $2`, [leadId, cand.rows[0].user_id]);
          promoted = { user_id: cand.rows[0].user_id, name: cand.rows[0].name };
        }
      }
      const ownerId = await this.syncLeadOwner(client, leadId);
      await audit(client, ctx, 'lead.assignee_removed', 'lead', leadId, {
        removed_user_id: userId, was_owner: wasOwner,
        promoted_user_id: promoted ? promoted.user_id : null, owner: ownerId,
      });
      await client.query('COMMIT');
      client.release(); released = true;   // give the connection back BEFORE the follow-up reads: they need another one

      const list = await this.assigneeList(leadId);
      return {
        lead_id: leadId, removed_user_id: userId, was_owner: wasOwner,
        promoted_to: promoted, assigned_to: ownerId, assignee_count: list.length,
        assignees: list.map(a => ({ user_id: a.user_id, name: a.name, role: a.role })),
      };
    } catch (e) { if (!released) await client.query('ROLLBACK'); throw e; } finally { if (!released) client.release(); }
  }

  async history(ctx, leadIdRaw) {
    const lead = await q('SELECT id,owner_id,assigned_to FROM leads WHERE id = $1', [leadIdRaw]);
    if (lead.rows.length === 0) throw new NotFoundError('Not found');
    await assertAccess(ctx, lead.rows[0]);
    const r = await q(
      `SELECT a.id, a.lead_id, a.previous_user_id, pu.name AS previous_user_name,
              a.user_id, au.name AS user_name, au.role AS user_role,
              a.assigned_by, ab.name AS assigned_by_name, ab.role AS assigned_by_role,
              a.note, a.created_at
         FROM lead_assignments a
         LEFT JOIN users pu ON pu.id = a.previous_user_id
         LEFT JOIN users au ON au.id = a.user_id
         LEFT JOIN users ab ON ab.id = a.assigned_by
        WHERE a.lead_id = $1
        ORDER BY a.id DESC`,
      [leadIdRaw]);
    return r.rows.map(a => ({
      id: a.id, lead_id: a.lead_id,
      assigned_to: a.user_id, assigned_to_name: a.user_name, assigned_to_role: a.user_role,
      previous_assigned_to: a.previous_user_id, previous_assigned_to_name: a.previous_user_name,
      assigned_by: a.assigned_by, assigned_by_name: a.assigned_by_name, assigned_by_role: a.assigned_by_role,
      note: a.note, created_at: a.created_at,
    }));
  }

  // Effective cap for an agent: a personal cap REPLACES the global backstop when
  // lower and is itself capped by it when higher, so this is never null.
  capOf(caps, id) {
    const personal = caps.get(id);
    if (personal === null || personal === undefined) return ASSIGNMENT_CAPACITY;
    return Math.min(parseInt(personal), ASSIGNMENT_CAPACITY);
  }

  // Open-lead load + caps for a set of users.
  async loadAndCaps(userIds) {
    const loadR = await q(
      `SELECT assigned_to AS id, COUNT(*) AS open_count
         FROM leads
        WHERE assigned_to = ANY($1) AND status = ANY($2)
        GROUP BY assigned_to`,
      [userIds, OPEN_LEAD_STATUSES]);
    const load = new Map(userIds.map(id => [id, 0]));
    for (const row of loadR.rows) load.set(row.id, parseInt(row.open_count) || 0);
    const capR = await q('SELECT user_id, max_open_leads FROM user_capacity WHERE user_id = ANY($1)', [userIds]);
    const caps = new Map(capR.rows.map(c => [c.user_id, c.max_open_leads]));
    return { load, caps };
  }

  // Bulk assignment: manual (one person), round_robin (cycle the pool) or
  // least_loaded (always the person with the fewest open leads right now).
  //
  // Also accepts `assignments: [{lead_ids:[], user_id, role}]` for assigning the
  // same set of people to many leads at once. `lead_ids` + `assigned_to` remains
  // the legacy single-owner path.
  async bulkAssign(ctx, body) {
    let { assigned_to, strategy = 'manual', note } = body;
    const multi = body.assignments;
    if (!Array.isArray(multi) && (!Array.isArray(body.lead_ids) || body.lead_ids.length === 0)) {
      throw new ValidationError('lead_ids must be a non-empty array');
    }
    if (!['manual', 'round_robin', 'least_loaded'].includes(strategy)) throw new ValidationError('Invalid strategy');

    // Multi form: flatten to lead_id → [members] so it shares all the code below.
    const perLead = new Map();   // lead_id -> [{user_id, role}]
    let leadIds = [];
    if (Array.isArray(multi)) {
      if (multi.length === 0) throw new ValidationError('assignments must be a non-empty array');
      for (const a of multi) {
        if (!Array.isArray(a.lead_ids) || a.lead_ids.length === 0) {
          throw new ValidationError('each assignment needs a non-empty lead_ids array');
        }
        const uid = parseInt(a.user_id);
        if (!Number.isInteger(uid)) throw new ValidationError('user_id must be an integer');
        const role = a.role || 'collaborator';
        if (!ASSIGNEE_ROLES.includes(role)) throw new ValidationError(`Invalid role '${role}'`);
        for (const lid of a.lead_ids) {
          const id = parseInt(lid);
          if (!leadIds.includes(id)) leadIds.push(id);
          if (!perLead.has(id)) perLead.set(id, []);
          if (!perLead.get(id).some(x => x.user_id === uid)) perLead.get(id).push({ user_id: uid, role });
        }
      }
    } else {
      leadIds = body.lead_ids;
    }

    const leadsR = await q('SELECT id,name,assigned_to FROM leads WHERE id = ANY($1)', [leadIds]);
    const found = new Map(leadsR.rows.map(l => [l.id, l]));
    const assigned = [];
    const skipped = [];
    let poolSummary = [];

    // Manual: validate the single target up front so we don't half-apply.
    let manualTarget = null;
    if (strategy === 'manual') {
      // In the multi form an explicit 'owner' entry plays the role of assigned_to.
      if ((assigned_to === undefined || assigned_to === null || assigned_to === '') && perLead.size > 0) {
        const firstOwner = [...perLead.values()].flat().find(x => x.role === 'owner');
        if (firstOwner) assigned_to = firstOwner.user_id;
      }
      if (assigned_to === undefined || assigned_to === null || assigned_to === '') {
        throw new ValidationError('assigned_to required for manual strategy');
      }
      manualTarget = await this.assertAssignable(assigned_to);
    } else {
      // Pool + current open-lead load, used by both auto strategies.
      let poolUsers = await ScopeService.assignableUsers({ userId: ctx.userId, userRole: ctx.role });
      // Optional: balance across ONLY these telecallers (the assign drawer's checkboxes).
      if (Array.isArray(body.user_ids) && body.user_ids.length) {
        const want = new Set(body.user_ids.map(Number));
        poolUsers = poolUsers.filter(u => want.has(u.id));
      }
      if (poolUsers.length === 0) throw new ValidationError('No assignable agents in scope');
      const { load, caps } = await this.loadAndCaps(poolUsers.map(u => u.id));
      const capOf = id => this.capOf(caps, id);
      // `reason` stays the bare machine code so clients can branch on it;
      // `reason_detail` carries the numbers for the human.
      const capDetail = u => `${u.name}: ${load.get(u.id) || 0}/${capOf(u.id)} open leads`;

      const eligible = poolUsers.filter(u => (load.get(u.id) || 0) < capOf(u.id));
      if (eligible.length === 0) {
        for (const id of leadIds) if (!found.has(parseInt(id))) skipped.push({ lead_id: id, reason: 'Lead not found' });
        for (const l of leadsR.rows) skipped.push({ lead_id: l.id, reason: 'at_capacity', reason_detail: poolUsers.map(capDetail).join('; ') });
        return { strategy, assigned: [], skipped, pool: [], capacity: ASSIGNMENT_CAPACITY };
      }

      let cursor = 0;
      for (const rawId of leadIds) {
        const id = parseInt(rawId);
        const lead = found.get(id);
        if (!lead) { skipped.push({ lead_id: rawId, reason: 'Lead not found' }); continue; }
        let pick;
        if (strategy === 'round_robin') {
          // Cycle the pool, skipping anyone at their own capacity limit.
          pick = null;
          for (let k = 0; k < eligible.length; k++) {
            const cand = eligible[(cursor + k) % eligible.length];
            if ((load.get(cand.id) || 0) < capOf(cand.id)) { pick = cand; cursor = (cursor + k + 1) % eligible.length; break; }
          }
        } else {
          // least_loaded: fewest open leads wins, ties broken by lowest id.
          pick = eligible.filter(u => (load.get(u.id) || 0) < capOf(u.id))
            .sort((a, b) => (load.get(a.id) || 0) - (load.get(b.id) || 0) || a.id - b.id)[0];
        }
        if (!pick) {
          const full = poolUsers.filter(u => (load.get(u.id) || 0) >= capOf(u.id));
          skipped.push({ lead_id: id, reason: 'at_capacity',
            reason_detail: full.map(capDetail).join('; ') || 'no agent under capacity' });
          continue;
        }
        load.set(pick.id, (load.get(pick.id) || 0) + 1);
        assigned.push({ lead, target: pick });
      }
      // Return the pool + final load so the UI can show the balancing result.
      poolSummary = eligible.map(u => ({ id: u.id, name: u.name, open_leads: load.get(u.id) || 0, max_open_leads: caps.get(u.id) ?? null, effective_capacity: capOf(u.id) }));
    }

    if (strategy === 'manual') {
      for (const rawId of leadIds) {
        const id = parseInt(rawId);
        const lead = found.get(id);
        if (!lead) { skipped.push({ lead_id: rawId, reason: 'Lead not found' }); continue; }
        assigned.push({ lead, target: manualTarget });
      }
    }

    // Persist in one transaction — a partial bulk assign is worse than none.
    const byUserId = parseInt(ctx.userId);
    const client = await pool.connect();
    const done = [];
    try {
      await client.query('BEGIN');
      // Lock every lead involved, always in id order, so two bulk assignments over the same leads cannot deadlock.
      const lockIds = [...new Set([...assigned.map(a => a.lead.id), ...perLead.keys()])].sort((x, y) => x - y);
      if (lockIds.length) await client.query('SELECT id FROM leads WHERE id = ANY($1) ORDER BY id FOR UPDATE', [lockIds]);
      for (const a of assigned) {
        // A lead already in the multi form keeps its extra members; otherwise the
        // strategy pick is the owner.
        const extra = perLead.get(a.lead.id) || [];
        const isOwner = !extra.length || extra.some(x => x.user_id === a.target.id);
        if (isOwner) {
          await this.applyAssignment(client, { lead: a.lead, toUserId: a.target.id, byUserId, note });
        } else {
          await this.upsertAssignee(client, { leadId: a.lead.id, userId: a.target.id, role: 'collaborator', byUserId });
          await this.syncLeadOwner(client, a.lead.id);
        }
        for (const x of extra) {
          await this.upsertAssignee(client, { leadId: a.lead.id, userId: x.user_id, role: x.role, byUserId });
        }
        await this.syncLeadOwner(client, a.lead.id);
        done.push({ lead_id: a.lead.id, assigned_to: a.target.id, assigned_to_name: a.target.name });
      }
      for (const [leadId, members] of perLead.entries()) {
        if (!assigned.some(x => x.lead.id === leadId) && found.has(leadId)) {
          // The lead had no strategy pick (multi form only): assign its members
          // directly, promoting the first 'owner' if there is one.
          for (const x of members) {
            await this.upsertAssignee(client, { leadId, userId: x.user_id, role: x.role, byUserId });
          }
          await this.syncLeadOwner(client, leadId);
          done.push({ lead_id: leadId, assigned_to: (await client.query('SELECT assigned_to FROM leads WHERE id = $1', [leadId])).rows[0].assigned_to });
        }
      }
      await audit(client, ctx, 'lead.bulk_assigned', 'lead_batch', null,
        { strategy, leads: leadIds.length, assigned: done.length, skipped: skipped.length, note: note || null });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }

    return { strategy, assigned: done, skipped, pool: poolSummary, capacity: ASSIGNMENT_CAPACITY };
  }

  // Remove every assignee from each lead, leaving it UNASSIGNED. One history row
  // per lead (user_id NULL) records who it was taken from.
  async bulkUnassign(ctx, body) {
    const ids = body.lead_ids;
    if (!Array.isArray(ids) || ids.length === 0) throw new ValidationError('lead_ids must be a non-empty array');
    if (ids.length > 1000) throw new ValidationError('lead_ids limited to 1000 per call');
    const leadIds = ids.map(x => parseInt(x)).filter(Number.isInteger);
    const leadsR = await q(
      'SELECT id, assigned_to FROM leads WHERE id = ANY($1) AND merged_into_lead_id IS NULL', [leadIds]);
    const found = new Map(leadsR.rows.map(l => [l.id, l]));
    const unassigned = [], skipped = [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const rawId of ids) {
        const id = parseInt(rawId);
        const lead = found.get(id);
        if (!Number.isInteger(id)) { skipped.push({ lead_id: rawId, reason: 'not an integer id' }); continue; }
        if (!lead) { skipped.push({ lead_id: rawId, reason: 'Lead not found' }); continue; }
        if (lead.assigned_to == null) { skipped.push({ lead_id: id, reason: 'already unassigned' }); continue; }
        await client.query('DELETE FROM lead_assignees WHERE lead_id = $1', [id]);
        await this.syncLeadOwner(client, id);
        await client.query(
          `INSERT INTO lead_assignments (lead_id, previous_user_id, user_id, assigned_by, note)
           VALUES ($1,$2,NULL,$3,$4)`,
          [id, lead.assigned_to, parseInt(ctx.userId), body.note || 'unassigned']);
        unassigned.push(id);
      }
      await audit(client, ctx, 'lead.bulk_unassigned', 'lead_batch', null,
        { requested: ids.length, unassigned: unassigned.length, skipped: skipped.length, lead_ids: unassigned });
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    return { unassigned, skipped, unassigned_count: unassigned.length, skipped_count: skipped.length };
  }

  // How much of the book nobody is working yet. Drives the Unassigned tab and the
  // guidance banner on the Leads page.
  async unassignedSummary() {
    const total = await q(
      `SELECT COUNT(*)::int AS live,
              COUNT(*) FILTER (WHERE assigned_to IS NULL)::int AS unassigned,
              COUNT(*) FILTER (WHERE assigned_to IS NULL AND COALESCE(is_active_lead, true))::int AS unassigned_active
         FROM leads WHERE merged_into_lead_id IS NULL AND deleted_at IS NULL`);
    const bySeg = await q(
      `SELECT COALESCE(NULLIF(btrim(segment), ''), '(unsegmented)') AS segment, COUNT(*)::int AS leads
         FROM leads
        WHERE merged_into_lead_id IS NULL AND deleted_at IS NULL AND assigned_to IS NULL
        GROUP BY 1 ORDER BY leads DESC, 1`);
    const names = await q(
      `SELECT telecaller_name AS name, COUNT(*)::int AS leads
         FROM leads
        WHERE merged_into_lead_id IS NULL AND deleted_at IS NULL AND assigned_to IS NULL
          AND telecaller_name IS NOT NULL AND btrim(telecaller_name) <> ''
        GROUP BY 1 ORDER BY leads DESC, 1 LIMIT 50`);
    return {
      total_live: total.rows[0].live,
      unassigned: total.rows[0].unassigned,
      unassigned_active: total.rows[0].unassigned_active,
      by_segment: bySeg.rows,
      unmatched_telecaller_names: names.rows,
    };
  }

  // Load-balancing snapshot: one row per assignable agent. Managers see their
  // team, admins see everyone.
  async workload(ctx) {
    const scope = await ScopeService.teamScopeIds({ userId: ctx.userId, userRole: ctx.role });
    const d = new Date();
    const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();

    // LATERALs keep this to a single round trip. "Assigned" means whoever is
    // working the lead: explicit assignee if set, else the record owner.
    const r = await q(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_url,
              COALESCE(ld.open_leads, 0)        AS open_leads,
              COALESCE(ld.total_leads, 0)       AS total_leads,
              ld.last_lead_activity,
              COALESCE(cl.calls_today, 0)       AS calls_today,
              COALESCE(cl.total_calls, 0)       AS total_calls,
              COALESCE(cl.avg_call_duration, 0) AS avg_call_duration,
              COALESCE(cl.open_follow_ups, 0)   AS open_follow_ups,
              cl.last_call_at,
              uc.max_open_leads
         FROM users u
         LEFT JOIN LATERAL (
              SELECT COUNT(*) FILTER (WHERE l.status = ANY($2)) AS open_leads,
                     COUNT(*)                                   AS total_leads,
                     MAX(l.updated_at)                           AS last_lead_activity
                FROM leads l
               WHERE COALESCE(l.assigned_to, l.owner_id) = u.id
         ) ld ON true
         LEFT JOIN LATERAL (
              SELECT COUNT(*) FILTER (WHERE ce.timestamp >= $3) AS calls_today,
                     COUNT(*)                                   AS total_calls,
                     COALESCE(AVG(ce.duration_seconds), 0)       AS avg_call_duration,
                     MAX(ce.timestamp)                           AS last_call_at,
                     (SELECT COUNT(*) FROM lead_follow_ups f
                       WHERE COALESCE(f.user_id, 0) = u.id AND f.completed_at IS NULL) AS open_follow_ups
                FROM call_events ce
               WHERE ce.user_id = u.id
         ) cl ON true
         LEFT JOIN user_capacity uc ON uc.user_id = u.id
        WHERE u.is_active = true
          AND u.role IN ('agent','manager')
          AND ($1::int[] IS NULL OR u.id = ANY($1))
        ORDER BY open_leads DESC, total_calls DESC, u.name ASC`,
      [scope, OPEN_LEAD_STATUSES, todayStart]);

    // last_activity is the later of "last touched a lead" and "last call".
    const rows = r.rows.map(u => {
      const a = u.last_lead_activity ? new Date(u.last_lead_activity) : null;
      const b = u.last_call_at ? new Date(u.last_call_at) : null;
      const last = a && b ? (a > b ? a : b) : (a || b);
      // Same rule as bulk-assign: personal cap wins when lower, global backstop
      // always applies.
      const personal = u.max_open_leads === null || u.max_open_leads === undefined ? null : parseInt(u.max_open_leads);
      const effective = personal === null ? ASSIGNMENT_CAPACITY : Math.min(personal, ASSIGNMENT_CAPACITY);
      const openLeads = parseInt(u.open_leads) || 0;
      return {
        id: u.id, name: u.name, email: u.email, role: u.role, avatar_url: u.avatar_url,
        open_leads: openLeads,
        total_leads: parseInt(u.total_leads) || 0,
        open_follow_ups: parseInt(u.open_follow_ups) || 0,
        calls_today: parseInt(u.calls_today) || 0,
        total_calls: parseInt(u.total_calls) || 0,
        avg_call_duration: Math.round((parseFloat(u.avg_call_duration) || 0) * 10) / 10,
        max_open_leads: personal,
        effective_capacity: effective,
        at_capacity: openLeads >= effective,
        last_activity: last || null,
        last_lead_activity: u.last_lead_activity || null,
        last_call_at: u.last_call_at || null,
      };
    });
    return {
      scope: scope === null ? 'all' : 'team',
      capacity: ASSIGNMENT_CAPACITY,
      generated_at: new Date().toISOString(),
      agents: rows,
    };
  }
}

module.exports = new AssignmentService();
