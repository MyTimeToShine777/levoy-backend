'use strict';

const { q } = require('../config/db');
const { ASSIGNMENT_CAPACITY, OPEN_LEAD_STATUSES } = require('../config/constants');

/*
 * Who gets each lead of an upload?
 *
 * The chain (first hit wins, per lead):
 *   1. manual_user_id      — the whole upload goes to one telecaller
 *   2. the file's Tellecaller Name column (resolved through the telecaller map)
 *   3. assignment rules    — fixed user, or a pool (least-loaded / round-robin)
 *   4. round-robin         — over the telecallers picked in the upload dialog
 *   5. UNASSIGNED          — listed, never handed to a random agent
 *
 * `planAssignment` is PURE: given the same inputs it always returns the same plan,
 * which is what lets the preview show exactly what commit will do.
 */

const byIdThenLoad = load => (a, b) => (load.get(a) || 0) - (load.get(b) || 0) || a - b;

/**
 * @param {object} p
 * @param {Array<{file_user_id: number|null, rule: null|{id, name?, strategy, fixed_user_id?, pool?: number[]}}>} p.leads
 *        one entry per lead: the user the file column resolved to, and the rule
 *        (if any) that matched the lead, with its candidate pool pre-resolved.
 * @param {{manual_user_id?, use_file_column?, use_rules?, round_robin?: {enabled, user_ids: number[]}}} p.options
 * @param {{load: Map<number, number>, capOf: (userId: number) => number}} p.deps
 *        current open-lead load per user and each user's effective capacity.
 * @returns {{assignments: Array<{index, user_id, reason, rule_id?}>, summary}}
 */
function planAssignment({ leads, options = {}, deps }) {
  const load = new Map(deps.load);                    // never mutate the caller's map
  const capOf = deps.capOf;
  const bump = id => load.set(id, (load.get(id) || 0) + 1);
  const hasRoom = id => (load.get(id) || 0) < capOf(id);

  const rrUsers = options.round_robin && options.round_robin.enabled
    ? [...new Set((options.round_robin.user_ids || []).map(Number).filter(Number.isInteger))] : [];
  const rrCursors = new Map();                        // rule id -> rotating cursor (round_robin pools)

  const pickFromPool = (pool, strategy, cursorKey) => {
    const eligible = pool.filter(hasRoom);
    if (!eligible.length) return null;
    if (strategy === 'round_robin') {
      const sorted = eligible.slice().sort((a, b) => a - b);
      const c = rrCursors.get(cursorKey) || 0;
      rrCursors.set(cursorKey, c + 1);
      return sorted[c % sorted.length];
    }
    return eligible.slice().sort(byIdThenLoad(load))[0];     // least_loaded (stable by id)
  };

  const assignments = [];
  leads.forEach((lead, index) => {
    let userId = null, reason = null, ruleId;

    if (options.manual_user_id) {
      userId = Number(options.manual_user_id); reason = 'manual';
    } else if (options.use_file_column && lead.file_user_id) {
      userId = lead.file_user_id; reason = 'file';
    }

    if (userId === null && options.use_rules && lead.rule) {
      const rule = lead.rule;
      if (rule.strategy === 'fixed') {
        if (rule.fixed_user_id) { userId = rule.fixed_user_id; reason = 'rule'; ruleId = rule.id; }
      } else {
        const picked = pickFromPool(rule.pool || [], rule.strategy, `rule:${rule.id}`);
        if (picked !== null) { userId = picked; reason = 'rule'; ruleId = rule.id; }
      }
    }

    // A lead that already has an owner (re-import, or a repeat inside the file) keeps it unless the
    // file / rules / "send all to" explicitly move it; sharing out the rest must not touch it or
    // spend a telecaller's capacity on it.
    if (userId === null && lead.existing_owned) {
      assignments.push({ index, user_id: null, reason: 'kept' });
      return;
    }

    if (userId === null && rrUsers.length) {
      // Least-loaded first, ties by id: this is what makes 10 leads over 3 empty
      // users come out 4/3/3 and keeps a busy telecaller from being piled on.
      const picked = pickFromPool(rrUsers, 'least_loaded', 'rr');
      if (picked !== null) { userId = picked; reason = 'round_robin'; }
      else reason = 'capacity';                       // everyone listed is full
    }

    if (userId === null) {
      assignments.push({ index, user_id: null, reason: reason || 'unassigned' });
      return;
    }
    bump(userId);                                     // explicit picks count toward load too
    assignments.push({ index, user_id: userId, reason, ...(ruleId !== undefined ? { rule_id: ruleId } : {}) });
  });

  const summary = { total: leads.length, byUser: {}, byReason: {}, unassigned: 0 };
  for (const a of assignments) {
    summary.byReason[a.reason] = (summary.byReason[a.reason] || 0) + 1;
    if (a.user_id === null) { if (a.reason !== 'kept') summary.unassigned++; }
    else summary.byUser[a.user_id] = (summary.byUser[a.user_id] || 0) + 1;
  }
  return { assignments, summary };
}

class ImportAssignmentService {
  planAssignment(args) { return planAssignment(args); }

  // Current open-lead load + effective capacity for a set of users, as the
  // `deps` the planner expects.
  async loadDeps(userIds) {
    const ids = [...new Set(userIds.map(Number).filter(Number.isInteger))];
    if (!ids.length) return { load: new Map(), capOf: () => ASSIGNMENT_CAPACITY };
    const loadR = await q(
      `SELECT assigned_to AS id, COUNT(*)::int AS n FROM leads
        WHERE assigned_to = ANY($1) AND status = ANY($2) AND merged_into_lead_id IS NULL
        GROUP BY assigned_to`, [ids, OPEN_LEAD_STATUSES]);
    const load = new Map(ids.map(id => [id, 0]));
    for (const r of loadR.rows) load.set(r.id, r.n);
    const capR = await q('SELECT user_id, max_open_leads FROM user_capacity WHERE user_id = ANY($1)', [ids]);
    const caps = new Map(capR.rows.map(c => [c.user_id, c.max_open_leads]));
    const capOf = id => {
      const personal = caps.get(id);
      return personal == null ? ASSIGNMENT_CAPACITY : Math.min(parseInt(personal), ASSIGNMENT_CAPACITY);
    };
    return { load, capOf };
  }
}

module.exports = new ImportAssignmentService();
module.exports.planAssignment = planAssignment;
