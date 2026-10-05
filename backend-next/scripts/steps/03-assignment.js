// Assignment: single/multi assign, assignees, history, bulk-assign strategies,
// workload, assignment rules + auto-assign.
module.exports = async ({ vars, call }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });

  // Fresh leads for this block.
  const ids = [];
  for (let i = 0; i < 8; i++) {
    const r = await J(`asg-lead-${i}`, 'POST', '/api/leads', { name: `Assign Lead ${i}`, phone: `98000000${10 + i}`, source: i % 2 ? 'web' : 'referral', priority: i < 3 ? 'high' : 'normal', auto_assign: false });
    ids.push(r.data.id);
  }
  vars.a0 = ids[0]; vars.a1 = ids[1]; vars.a2 = ids[2]; vars.a3 = ids[3];
  vars.a4 = ids[4]; vars.a5 = ids[5]; vars.a6 = ids[6]; vars.a7 = ids[7];

  // single assign
  await J('assign-agent', 'POST', '/api/leads/{a0}/assign', { assigned_to: '{agent1Id}' }, { as: 'agent1' });
  await J('assign-missing', 'POST', '/api/leads/{a0}/assign', {}, { as: 'manager' });
  await J('assign-nouser', 'POST', '/api/leads/{a0}/assign', { assigned_to: 99999 }, { as: 'manager' });
  await J('assign-to-admin', 'POST', '/api/leads/{a0}/assign', { assigned_to: 1 }, { as: 'manager' });
  await J('assign-404', 'POST', '/api/leads/99999/assign', { assigned_to: '{agent1Id}' }, { as: 'manager' });
  await J('assign-ok', 'POST', '/api/leads/{a0}/assign', { assigned_to: '{agent1Id}', note: 'first' }, { as: 'manager' });
  await J('assign-again-same', 'POST', '/api/leads/{a0}/assign', { assigned_to: '{agent1Id}', note: 'again' }, { as: 'manager' });
  await J('assign-reassign', 'POST', '/api/leads/{a0}/assign', { assigned_to: '{agent2Id}', note: 'move' }, { as: 'manager' });
  // multi assign
  await J('assign-multi-empty', 'POST', '/api/leads/{a1}/assign', { assignments: [] }, { as: 'manager' });
  await J('assign-multi-badrole', 'POST', '/api/leads/{a1}/assign', { assignments: [{ user_id: '{agent1Id}', role: 'boss' }] }, { as: 'manager' });
  await J('assign-multi-dup', 'POST', '/api/leads/{a1}/assign', { assignments: [{ user_id: '{agent1Id}', role: 'owner' }, { user_id: '{agent1Id}', role: 'watcher' }] }, { as: 'manager' });
  await J('assign-multi', 'POST', '/api/leads/{a1}/assign', { assignments: [{ user_id: '{agent1Id}', role: 'owner' }, { user_id: '{agent2Id}', role: 'collaborator' }, { user_id: '{agent3Id}', role: 'watcher' }], note: 'team' }, { as: 'manager' });
  await call('assignees', 'GET', '/api/leads/{a1}/assignees');
  await call('assignees-404', 'GET', '/api/leads/99999/assignees');
  await call('assignments-history', 'GET', '/api/leads/{a0}/assignments');
  await call('assignments-history-404', 'GET', '/api/leads/99999/assignments');
  await call('assignee-remove-agent', 'DELETE', '/api/leads/{a1}/assignees/{agent1Id}', { as: 'agent1' });
  await call('assignee-remove-badid', 'DELETE', '/api/leads/abc/assignees/{agent1Id}', { as: 'manager' });
  await call('assignee-remove-404', 'DELETE', '/api/leads/99999/assignees/{agent1Id}', { as: 'manager' });
  await call('assignee-remove-notmember', 'DELETE', '/api/leads/{a1}/assignees/{managerId}', { as: 'manager' });
  await call('assignee-remove-owner', 'DELETE', '/api/leads/{a1}/assignees/{agent1Id}', { as: 'manager' });
  await call('lead-get-after-assign', 'GET', '/api/leads/{a1}');
  await call('agent-sees-assigned', 'GET', '/api/leads/{a1}', { as: 'agent2' });

  // bulk assign
  await J('bulk-assign-agent', 'POST', '/api/leads/bulk-assign', { lead_ids: ['{a2}'], assigned_to: '{agent1Id}' }, { as: 'agent1' });
  await J('bulk-assign-nolids', 'POST', '/api/leads/bulk-assign', {}, { as: 'manager' });
  await J('bulk-assign-badstrategy', 'POST', '/api/leads/bulk-assign', { lead_ids: ['{a2}'], strategy: 'zzz' }, { as: 'manager' });
  await J('bulk-assign-manual-nouser', 'POST', '/api/leads/bulk-assign', { lead_ids: ['{a2}'], strategy: 'manual' }, { as: 'manager' });
  await J('bulk-assign-manual', 'POST', '/api/leads/bulk-assign', { lead_ids: ['{a2}', '{a3}', 99999], assigned_to: '{agent1Id}', note: 'bulk' }, { as: 'manager' });
  await J('bulk-assign-rr', 'POST', '/api/leads/bulk-assign', { lead_ids: ['{a4}', '{a5}', '{a6}', '{a7}'], strategy: 'round_robin' }, { as: 'manager' });
  await J('bulk-assign-ll', 'POST', '/api/leads/bulk-assign', { lead_ids: ['{a0}', '{a1}'], strategy: 'least_loaded' }, { as: 'admin' });
  await J('bulk-assign-multi', 'POST', '/api/leads/bulk-assign', { assignments: [{ lead_ids: ['{a2}', '{a3}'], user_id: '{agent2Id}', role: 'collaborator' }] }, { as: 'manager' });
  await J('bulk-assign-multi-bad', 'POST', '/api/leads/bulk-assign', { assignments: [{ lead_ids: [], user_id: 1 }] }, { as: 'manager' });
  await call('workload', 'GET', '/api/agents/workload', { as: 'admin' });
  await call('workload-manager', 'GET', '/api/agents/workload', { as: 'manager' });
  await call('workload-agent', 'GET', '/api/agents/workload', { as: 'agent1' });
  await call('leads-list-unassigned-agent2', 'GET', '/api/leads?assigned_to={agent2Id}');

  // assignment rules
  await call('rules-list-empty', 'GET', '/api/assignment-rules');
  await J('rule-agent', 'POST', '/api/assignment-rules', { name: 'x' }, { as: 'agent1' });
  await J('rule-noname', 'POST', '/api/assignment-rules', {}, { as: 'manager' });
  await J('rule-badstrategy', 'POST', '/api/assignment-rules', { name: 'x', strategy: 'zzz' }, { as: 'manager' });
  await J('rule-badcond', 'POST', '/api/assignment-rules', { name: 'x', conditions: { souce: ['web'] } }, { as: 'manager' });
  await J('rule-fixed-nouser', 'POST', '/api/assignment-rules', { name: 'x', strategy: 'fixed' }, { as: 'manager' });
  await J('rule-fixed-baduser', 'POST', '/api/assignment-rules', { name: 'x', strategy: 'fixed', fixed_user_id: 99999 }, { as: 'manager' });
  await J('rule-fixed', 'POST', '/api/assignment-rules', { name: 'High priority to Asha', priority: 10, conditions: { priority: ['high'] }, strategy: 'fixed', fixed_user_id: '{agent1Id}' }, { as: 'manager', save: { ruleFixed: d => d.id } });
  await J('rule-rr', 'POST', '/api/assignment-rules', { name: 'Web round robin', priority: 20, conditions: { source: ['web'] }, strategy: 'round_robin', stop_on_match: true }, { as: 'manager', save: { ruleRR: d => d.id } });
  await J('rule-ll', 'POST', '/api/assignment-rules', { name: 'Catch-all least loaded', priority: 90, conditions: {}, strategy: 'least_loaded' }, { as: 'manager', save: { ruleLL: d => d.id } });
  await call('rules-list', 'GET', '/api/assignment-rules');
  await J('rule-patch', 'PATCH', '/api/assignment-rules/{ruleLL}', { priority: 95, enabled: true }, { as: 'manager' });
  await J('rule-patch-empty', 'PATCH', '/api/assignment-rules/{ruleLL}', {}, { as: 'manager' });
  await J('rule-patch-404', 'PATCH', '/api/assignment-rules/99999', { name: 'x' }, { as: 'manager' });
  await J('rule-patch-badstrategy', 'PATCH', '/api/assignment-rules/{ruleLL}', { strategy: 'zzz' }, { as: 'manager' });

  // auto-assign
  const fresh = [];
  for (let i = 0; i < 4; i++) {
    const r = await J(`auto-lead-${i}`, 'POST', '/api/leads', { name: `Auto Lead ${i}`, phone: `98111111${10 + i}`, source: i % 2 ? 'web' : 'walkin', priority: i === 0 ? 'high' : 'normal' });
    fresh.push(r.data.id);
  }
  vars.f0 = fresh[0]; vars.f1 = fresh[1]; vars.f2 = fresh[2]; vars.f3 = fresh[3];
  await J('autoassign-agent', 'POST', '/api/leads/{a5}/auto-assign', {}, { as: 'agent1' });
  await J('autoassign-404', 'POST', '/api/leads/99999/auto-assign', {}, { as: 'manager' });
  await J('autoassign', 'POST', '/api/leads/{a5}/auto-assign', {}, { as: 'manager' });
  await J('bulk-autoassign-bad', 'POST', '/api/leads/bulk-auto-assign', { lead_ids: [] }, { as: 'manager' });
  await J('bulk-autoassign', 'POST', '/api/leads/bulk-auto-assign', { lead_ids: ['{a6}', '{a7}', 99999] }, { as: 'manager' });
  await J('lead-create-optout', 'POST', '/api/leads', { name: 'Opt Out', phone: '9822222222', source: 'web', auto_assign: false });
  await J('lead-create-explicit', 'POST', '/api/leads', { name: 'Explicit', phone: '9833333333', source: 'web', assigned_to: '{agent3Id}' });
  await call('rule-delete', 'DELETE', '/api/assignment-rules/{ruleLL}', { as: 'manager' });
  await call('rule-delete-404', 'DELETE', '/api/assignment-rules/{ruleLL}', { as: 'manager' });
  await call('rule-delete-agent', 'DELETE', '/api/assignment-rules/{ruleRR}', { as: 'agent1' });
};
