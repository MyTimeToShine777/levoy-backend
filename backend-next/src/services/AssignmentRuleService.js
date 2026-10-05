'use strict';

const { pool, q } = require('../config/db');
const { OPEN_LEAD_STATUSES, ASSIGNMENT_CAPACITY } = require('../config/constants');
const { ValidationError, NotFoundError, AppError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { priorityRank } = require('../utils/leadMath');
const ScopeService = require('./ScopeService');
const AssignmentService = require('./AssignmentService');
const LeadTagService = require('./LeadTagService');
const { loadLeadForRead } = require('../utils/leadAccess');

const STRATEGIES = ['round_robin', 'least_loaded', 'fixed'];

// A rule matches only when EVERY key present in `conditions` matches (logical
// AND). Absent keys are ignored, so {source:['web']} means "any lead from the
// web". An empty {} therefore matches every lead (the catch-all).
function matchRuleConditions(rule, lead, leadTagIds) {
  const c = (rule.conditions && typeof rule.conditions === 'object') ? rule.conditions : {};
  const failed = [];
  const lowered = v => String(v || '').toLowerCase();

  if (Array.isArray(c.source) && c.source.length) {
    if (!c.source.map(lowered).includes(lowered(lead.source))) failed.push('source');
  }
  if (Array.isArray(c.status) && c.status.length) {
    if (!c.status.map(lowered).includes(lowered(lead.status))) failed.push('status');
  }
  if (Array.isArray(c.priority) && c.priority.length) {
    if (!c.priority.map(lowered).includes(lowered(lead.priority))) failed.push('priority');
  }
  // Campaign / area, the dimensions the operations sheet is organised by.
  if (Array.isArray(c.segment) && c.segment.length) {
    if (!c.segment.map(lowered).includes(lowered(lead.segment))) failed.push('segment');
  }
  if (Array.isArray(c.locality) && c.locality.length) {
    if (!c.locality.map(lowered).includes(lowered(lead.locality))) failed.push('locality');
  }
  if (Array.isArray(c.tag_ids) && c.tag_ids.length) {
    const ids = c.tag_ids.map(x => parseInt(x)).filter(Number.isInteger);
    if (!ids.some(id => leadTagIds.has(id))) failed.push('tag_ids');
  }
  // min_priority is a RANK threshold: min_priority 3 accepts high(3)/urgent(4).
  if (c.min_priority !== undefined && c.min_priority !== null) {
    const min = parseInt(c.min_priority);
    if (!Number.isFinite(min)) failed.push('min_priority');
    else if (priorityRank(lead.priority) < min) failed.push('min_priority');
  }
  return { matched: failed.length === 0, failed_on: failed };
}

function sanitizeConditions(conditions) {
  if (conditions === undefined || conditions === null) return {};
  if (typeof conditions !== 'object' || Array.isArray(conditions)) return null;
  const out = {};
  for (const key of ['source', 'status', 'priority', 'segment', 'locality', 'tag_ids']) {
    if (conditions[key] === undefined || conditions[key] === null) continue;
    if (!Array.isArray(conditions[key])) return null;
    out[key] = conditions[key];
  }
  if (conditions.min_priority !== undefined && conditions.min_priority !== null) {
    const n = parseInt(conditions.min_priority);
    if (!Number.isFinite(n)) return null;
    out.min_priority = n;
  }
  // Reject unknown keys instead of storing them: a typo like {souce:[...]} would
  // otherwise silently never match and the rule would look configured but dead.
  for (const k of Object.keys(conditions)) {
    if (!['source', 'status', 'priority', 'segment', 'locality', 'tag_ids', 'min_priority'].includes(k)) return null;
  }
  return out;
}

class AssignmentRuleService {
  matchRuleConditions(rule, lead, tagIds) { return matchRuleConditions(rule, lead, tagIds); }

  // Cheap probe for the create path: only evaluate rules when any are configured.
  async anyEnabledRules() {
    const r = await q('SELECT 1 FROM assignment_rules WHERE enabled = true LIMIT 1');
    return r.rows.length > 0;
  }

  // Assignable pool + current open-lead load + effective capacity. teamId narrows
  // the pool to one team; otherwise the caller's own scope applies.
  async buildAssigneePool(ctx, teamId) {
    let poolUsers = await ScopeService.assignableUsers({ userId: ctx.userId, userRole: ctx.role });
    if (teamId) {
      const t = await q(
        `SELECT DISTINCT u.id, u.name, u.role
           FROM users u JOIN team_members tm ON tm.user_id = u.id
          WHERE tm.team_id = $1 AND u.is_active AND u.role IN ('agent','manager')
          ORDER BY u.id`, [teamId]);
      poolUsers = t.rows;
    }
    if (!poolUsers.length) return null;
    const ids = poolUsers.map(u => u.id);
    const loadR = await q(
      `SELECT assigned_to AS id, COUNT(*)::int AS open_count
         FROM leads
        WHERE assigned_to = ANY($1) AND status = ANY($2) AND merged_into_lead_id IS NULL
        GROUP BY assigned_to`, [ids, OPEN_LEAD_STATUSES]);
    const load = new Map(ids.map(id => [id, 0]));
    for (const row of loadR.rows) load.set(row.id, row.open_count);
    const capR = await q('SELECT user_id, max_open_leads FROM user_capacity WHERE user_id = ANY($1)', [ids]);
    const caps = new Map(capR.rows.map(c => [c.user_id, c.max_open_leads]));
    const capOf = id => {
      const personal = caps.get(id);
      return (personal == null) ? ASSIGNMENT_CAPACITY : Math.min(personal, ASSIGNMENT_CAPACITY);
    };
    return { pool: poolUsers, load, caps, capOf };
  }

  // Turn "this rule matched" into "and here is the person".
  async resolveRuleTarget(ctx, rule) {
    if (rule.strategy === 'fixed') {
      if (!rule.fixed_user_id) return { user: null, reason: 'strategy is fixed but fixed_user_id is not set' };
      const u = await q('SELECT id, name, role, is_active FROM users WHERE id = $1', [rule.fixed_user_id]);
      if (!u.rows.length) return { user: null, reason: 'fixed_user_id does not exist' };
      if (!u.rows[0].is_active) return { user: null, reason: 'fixed_user_id is inactive' };
      if (!['agent', 'manager'].includes(u.rows[0].role)) return { user: null, reason: 'fixed_user_id is not an agent or manager' };
      return { user: u.rows[0], reason: null };
    }
    const poolInfo = await this.buildAssigneePool(ctx, rule.team_id);
    if (!poolInfo) return { user: null, reason: 'no assignable agents in scope' };
    const { pool: poolUsers, load, capOf } = poolInfo;
    const eligible = poolUsers.filter(u => (load.get(u.id) || 0) < capOf(u.id));
    if (!eligible.length) return { user: null, reason: 'every agent in scope is at capacity', pool_state: poolInfo };

    if (rule.strategy === 'round_robin') {
      // The cursor is derived from how many assignments already exist for this
      // pool rather than kept in memory, so the rotation survives a restart.
      const hist = await q('SELECT COUNT(*)::int AS c FROM lead_assignments WHERE user_id = ANY($1)', [poolUsers.map(u => u.id)]);
      const start = hist.rows[0].c % eligible.length;
      for (let k = 0; k < eligible.length; k++) {
        const cand = eligible[(start + k) % eligible.length];
        if ((load.get(cand.id) || 0) < capOf(cand.id)) return { user: cand, pool_state: poolInfo, cursor: (start + k) % eligible.length };
      }
    }
    // least_loaded: fewest open leads wins, ties broken by lowest id (stable).
    const pick = eligible.slice().sort((a, b) => (load.get(a.id) || 0) - (load.get(b.id) || 0) || a.id - b.id)[0];
    return { user: pick || null, pool_state: poolInfo, reason: pick ? null : 'no agent under capacity' };
  }

  // Walk the enabled rules in priority order (LOWER number first) and return the
  // one that should win, plus a full trace so the API can explain itself.
  async evaluateAutoAssign(ctx, lead) {
    const rulesR = await q('SELECT * FROM assignment_rules WHERE enabled = true ORDER BY priority ASC, id ASC');
    if (!rulesR.rows.length) return { rule: null, target: null, reason: 'no enabled rules', evaluated: [] };

    const leadTagIds = new Set(await LeadTagService.tagIdsForLead(lead.id));
    const evaluated = [];
    let winner = null;
    for (const rule of rulesR.rows) {
      const m = matchRuleConditions(rule, lead, leadTagIds);
      evaluated.push({ id: rule.id, name: rule.name, priority: rule.priority,
        strategy: rule.strategy, matched: m.matched, failed_on: m.failed_on });
      if (!m.matched) continue;
      // stop_on_match = true → the first match is final; false → keep walking so
      // a later, more specific rule can override (the LAST match wins).
      winner = rule;
      if (rule.stop_on_match) break;
    }
    if (!winner) return { rule: null, target: null, reason: 'no rule matched this lead', evaluated };

    const resolved = await this.resolveRuleTarget(ctx, winner);
    return {
      rule: { id: winner.id, name: winner.name, priority: winner.priority,
        strategy: winner.strategy, stop_on_match: winner.stop_on_match },
      target: resolved.user,
      reason: resolved.user ? null : (resolved.reason || 'no assignee available'),
      evaluated,
      pool: resolved.pool_state ? resolved.pool_state.pool.map(u => ({
        id: u.id, name: u.name, open_leads: resolved.pool_state.load.get(u.id) || 0,
        max_open_leads: resolved.pool_state.caps.get(u.id) ?? null,
        effective_capacity: resolved.pool_state.capOf(u.id),
      })) : [],
    };
  }

  // ── CRUD ──
  async list() {
    const r = await q(
      `SELECT r.*, u.name AS created_by_name, fu.name AS fixed_user_name, t.name AS team_name
         FROM assignment_rules r
         LEFT JOIN users u ON u.id = r.created_by
         LEFT JOIN users fu ON fu.id = r.fixed_user_id
         LEFT JOIN teams t ON t.id = r.team_id
        ORDER BY r.priority ASC, r.id ASC`);
    return r.rows;
  }

  async assertFixedUser(id) {
    const t = await q('SELECT id, role, is_active FROM users WHERE id = $1', [id]);
    if (!t.rows.length) throw new ValidationError('fixed_user_id does not exist');
    if (!t.rows[0].is_active) throw new ValidationError('fixed_user_id is inactive');
    if (!['agent', 'manager'].includes(t.rows[0].role)) throw new ValidationError('fixed_user_id must be an agent or manager');
  }

  async create(ctx, body) {
    const name = String(body.name || '').trim();
    if (!name) throw new ValidationError('name required');
    const strategy = body.strategy || 'round_robin';
    if (!STRATEGIES.includes(strategy)) throw new ValidationError('strategy must be round_robin, least_loaded or fixed');
    const conditions = sanitizeConditions(body.conditions);
    if (conditions === null) throw new ValidationError('conditions is invalid');
    if (strategy === 'fixed' && !body.fixed_user_id) throw new ValidationError('fixed strategy requires fixed_user_id');
    if (body.fixed_user_id) await this.assertFixedUser(body.fixed_user_id);
    const r = await q(
      `INSERT INTO assignment_rules (name, enabled, priority, conditions, strategy, fixed_user_id, team_id, stop_on_match, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name,
        body.enabled === undefined ? true : !!body.enabled,
        Number.isFinite(parseInt(body.priority)) ? parseInt(body.priority) : 100,
        JSON.stringify(conditions), strategy,
        body.fixed_user_id ? parseInt(body.fixed_user_id) : null,
        body.team_id ? parseInt(body.team_id) : null,
        body.stop_on_match === undefined ? true : !!body.stop_on_match,
        parseInt(ctx.userId)]);
    await audit(null, ctx, 'assignment_rule.created', 'assignment_rule', r.rows[0].id,
      { name, strategy, priority: r.rows[0].priority, conditions });
    return r.rows[0];
  }

  async update(ctx, id, body) {
    const cur = await q('SELECT * FROM assignment_rules WHERE id = $1', [id]);
    if (!cur.rows.length) throw new NotFoundError('Not found');
    const rule = cur.rows[0];

    const fields = [], values = [];
    let idx = 1;
    const push = (col, val) => { fields.push(`${col} = $${idx}`); values.push(val); idx++; };

    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (!n) throw new ValidationError('name cannot be empty');
      push('name', n);
    }
    if (body.enabled !== undefined) push('enabled', !!body.enabled);
    if (body.priority !== undefined) {
      const p = parseInt(body.priority);
      if (!Number.isFinite(p)) throw new ValidationError('priority must be an integer');
      push('priority', p);
    }
    if (body.stop_on_match !== undefined) push('stop_on_match', !!body.stop_on_match);
    if (body.team_id !== undefined) push('team_id', body.team_id === null ? null : parseInt(body.team_id));
    if (body.conditions !== undefined) {
      const conditions = sanitizeConditions(body.conditions);
      if (conditions === null) throw new ValidationError('conditions is invalid');
      push('conditions', JSON.stringify(conditions));
    }
    if (body.strategy !== undefined) {
      if (!STRATEGIES.includes(body.strategy)) throw new ValidationError('strategy must be round_robin, least_loaded or fixed');
      push('strategy', body.strategy);
    }
    if (body.fixed_user_id !== undefined) {
      if (body.fixed_user_id === null) push('fixed_user_id', null);
      else {
        await this.assertFixedUser(body.fixed_user_id);
        push('fixed_user_id', parseInt(body.fixed_user_id));
      }
    }
    if (fields.length === 0) throw new ValidationError('No fields');

    const nextStrategy = body.strategy !== undefined ? body.strategy : rule.strategy;
    const nextFixed = body.fixed_user_id !== undefined ? body.fixed_user_id : rule.fixed_user_id;
    if (nextStrategy === 'fixed' && !nextFixed) throw new ValidationError('fixed strategy requires fixed_user_id');

    values.push(id);
    const r = await q(`UPDATE assignment_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    await audit(null, ctx, 'assignment_rule.updated', 'assignment_rule', id,
      { fields: fields.map(f => f.split(' =')[0]), before: { enabled: rule.enabled, priority: rule.priority, strategy: rule.strategy } });
    return r.rows[0];
  }

  async remove(ctx, id) {
    const cur = await q('SELECT * FROM assignment_rules WHERE id = $1', [id]);
    if (!cur.rows.length) throw new NotFoundError('Not found');
    await q('DELETE FROM assignment_rules WHERE id = $1', [id]);
    await audit(null, ctx, 'assignment_rule.deleted', 'assignment_rule', id,
      { name: cur.rows[0].name, strategy: cur.rows[0].strategy });
    return { id: parseInt(id), deleted: true, name: cur.rows[0].name };
  }

  // ── applying rules to existing leads ──
  // Evaluate every enabled rule against this lead and apply the winner. Separate
  // from POST /api/leads/:leadId/assign so an admin can ask "what WOULD happen?".
  async autoAssign(ctx, leadId) {
    const lead = await loadLeadForRead(ctx, leadId);
    if (lead.merged_into_lead_id) throw new ValidationError('Lead has been merged away');

    const decision = await this.evaluateAutoAssign(ctx, lead);
    if (!decision.rule) {
      throw new AppError(404, decision.reason || 'No rule matched', { evaluated: decision.evaluated });
    }
    if (!decision.target) {
      throw new AppError(400, decision.reason || 'No assignee available',
        { rule: decision.rule, evaluated: decision.evaluated, pool: decision.pool });
    }

    const client = await pool.connect();
    let history;
    try {
      await client.query('BEGIN');
      // Reuse the normal assignment path so lead_assignees, leads.assigned_to,
      // the history row and the open follow-ups all move together.
      history = await AssignmentService.applyAssignment(client, {
        lead, toUserId: decision.target.id, byUserId: parseInt(ctx.userId),
        note: `auto-assign via rule "${decision.rule.name}"`,
      });
      await audit(client, ctx, 'lead.auto_assigned', 'lead', lead.id, {
        rule: decision.rule, assigned_to: decision.target.id, assigned_to_name: decision.target.name,
      });
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

    return {
      auto_assigned: true, lead_id: lead.id,
      assigned_to: decision.target.id, assigned_to_name: decision.target.name,
      rule: decision.rule, reason: decision.reason,
      evaluated: decision.evaluated, pool: decision.pool, history,
    };
  }

  // Same evaluation over a batch. Each lead is committed on its own so one
  // unassignable lead cannot roll back the whole run.
  async bulkAutoAssign(ctx, body) {
    const ids = body.lead_ids;
    if (!Array.isArray(ids) || ids.length === 0) throw new ValidationError('lead_ids must be a non-empty array');
    if (ids.length > 1000) throw new ValidationError('lead_ids limited to 1000 per call');

    const leadsR = await q('SELECT * FROM leads WHERE id = ANY($1)', [ids.map(x => parseInt(x))]);
    const found = new Map(leadsR.rows.map(l => [l.id, l]));
    const assigned = [], skipped = [];

    for (const rawId of ids) {
      const id = parseInt(rawId);
      const lead = found.get(id);
      if (!lead) { skipped.push({ lead_id: rawId, reason: 'Lead not found' }); continue; }
      if (lead.merged_into_lead_id) { skipped.push({ lead_id: id, reason: `already merged into #${lead.merged_into_lead_id}` }); continue; }

      const decision = await this.evaluateAutoAssign(ctx, lead);
      if (!decision.rule) { skipped.push({ lead_id: id, reason: decision.reason, evaluated: decision.evaluated }); continue; }
      if (!decision.target) { skipped.push({ lead_id: id, reason: decision.reason, rule: decision.rule }); continue; }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await AssignmentService.applyAssignment(client, {
          lead, toUserId: decision.target.id, byUserId: parseInt(ctx.userId),
          note: `bulk auto-assign via rule "${decision.rule.name}"`,
        });
        await client.query('COMMIT');
        assigned.push({
          lead_id: id, assigned_to: decision.target.id, assigned_to_name: decision.target.name,
          rule: decision.rule, evaluated: decision.evaluated,
        });
      } catch (e) {
        await client.query('ROLLBACK');
        skipped.push({ lead_id: id, reason: e.message });
      } finally { client.release(); }
    }
    await audit(null, ctx, 'lead.bulk_auto_assigned', 'lead_batch', null,
      { requested: ids.length, assigned: assigned.length, skipped: skipped.length });
    return { assigned, skipped, total: ids.length };
  }
}

module.exports = new AssignmentRuleService();
module.exports.sanitizeConditions = sanitizeConditions;
