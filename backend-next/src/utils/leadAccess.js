'use strict';

const { q } = require('../config/db');
const { ForbiddenError, NotFoundError } = require('../exceptions');

/*
 * Who may see / work a lead.
 *
 *   admin, manager : every lead
 *   agent          : leads they created (owner_id), leads assigned to them
 *                    (assigned_to) and leads where they are any assignee
 *                    (collaborator / watcher).
 *
 * The legacy rule was "owner_id only". An imported lead is owned (created) by
 * the importing admin and then ASSIGNED to a telecaller, so under the old rule
 * the telecaller could not open their own leads. See spec §6.2.
 */

// SQL fragment (starting with " AND") restricting `alias` to what the agent may
// see, appending the user id to `params`. Returns '' for admin/manager.
function visibleSql(ctx, alias, params) {
  if (ctx.role !== 'agent') return '';
  params.push(parseInt(ctx.userId));
  const n = params.length;
  return ` AND (${alias}.owner_id = $${n} OR ${alias}.assigned_to = $${n}` +
    ` OR EXISTS (SELECT 1 FROM lead_assignees vla WHERE vla.lead_id = ${alias}.id AND vla.user_id = $${n}))`;
}

async function canAccessLead(ctx, lead) {
  if (ctx.role !== 'agent') return true;
  const uid = parseInt(ctx.userId);
  if (lead.owner_id === uid || lead.assigned_to === uid) return true;
  const r = await q('SELECT 1 FROM lead_assignees WHERE lead_id = $1 AND user_id = $2 LIMIT 1', [lead.id, uid]);
  return r.rows.length > 0;
}

// Throws 403 "Not yours" (the message the API always used) when the agent has no
// access. `lead` must carry id, owner_id and assigned_to.
async function assertAccess(ctx, lead, message = 'Not yours') {
  if (!(await canAccessLead(ctx, lead))) throw new ForbiddenError(message);
}

// Load a lead the caller may read: 404 if missing, 403 if not theirs.
async function loadLeadForRead(ctx, leadId) {
  const r = await q('SELECT * FROM leads WHERE id = $1', [leadId]);
  if (r.rows.length === 0) throw new NotFoundError('Not found');
  const lead = r.rows[0];
  await assertAccess(ctx, lead);
  return lead;
}

module.exports = { visibleSql, canAccessLead, assertAccess, loadLeadForRead };
