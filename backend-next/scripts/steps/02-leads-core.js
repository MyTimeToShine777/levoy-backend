// Leads: CRUD, list filters, detail, contact, timeline/activities, tags, bulk status,
// duplicates/merge, pipeline stages + board, follow-ups, delete.
module.exports = async ({ vars, call }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });
  const day = n => new Date(Date.now() + n * 86400000).toISOString();

  // ── create ──
  await J('lead-create-bad', 'POST', '/api/leads', { name: 'x' });
  await J('lead-create-badstage', 'POST', '/api/leads', { name: 'Stage Lead', phone: '9111111111', status: 'nope' });
  await J('lead-create', 'POST', '/api/leads', { name: 'Ramesh Pharmacy', phone: '9876500001', email: 'ramesh@example.com', source: 'web', priority: 'high', notes: 'first' }, { save: { lead1: d => d.id } });
  await J('lead-create-assigned', 'POST', '/api/leads', { name: 'Sita Medicals', phone: '9876500002', assigned_to: '{agent1Id}', source: 'referral' }, { save: { lead2: d => d.id } });
  await J('lead-create-agent', 'POST', '/api/leads', { name: 'Agent Own Lead', phone: '9876500003' }, { as: 'agent1', save: { lead3: d => d.id } });
  await J('lead-create-noauto', 'POST', '/api/leads', { name: 'No Auto', phone: '9876500004', auto_assign: false }, { save: { lead4: d => d.id } });
  await J('lead-create-dupphone', 'POST', '/api/leads', { name: 'Ramesh Pharmacy Branch', phone: '+91 98765 00001', email: 'ramesh@example.com' }, { save: { lead5: d => d.id } });

  // ── list + filters ──
  await call('leads-list', 'GET', '/api/leads');
  await call('leads-list-status', 'GET', '/api/leads?status=new');
  await call('leads-list-priority', 'GET', '/api/leads?priority=high');
  await call('leads-list-assigned', 'GET', '/api/leads?assigned_to={agent1Id}');
  await call('leads-list-search', 'GET', '/api/leads?search=ramesh');
  await call('leads-list-limit', 'GET', '/api/leads?limit=2&offset=1');
  await call('leads-list-overdue', 'GET', '/api/leads?overdue_only=true');
  await call('leads-list-agent', 'GET', '/api/leads', { as: 'agent1' });
  await call('leads-list-agent-assignedonly', 'GET', '/api/leads?assigned_only=true', { as: 'agent1' });
  await call('leads-list-manager', 'GET', '/api/leads', { as: 'manager' });

  // ── detail ──
  await call('lead-get', 'GET', '/api/leads/{lead1}');
  await call('lead-get-404', 'GET', '/api/leads/99999');
  await call('lead-get-agent-own', 'GET', '/api/leads/{lead3}', { as: 'agent1' });
  await call('lead-get-agent-other', 'GET', '/api/leads/{lead1}', { as: 'agent2' });

  // ── update ──
  await J('lead-put', 'PUT', '/api/leads/{lead1}', { notes: 'updated notes', priority: 'urgent' });
  await J('lead-put-status', 'PUT', '/api/leads/{lead1}', { status: 'contacted' });
  await J('lead-put-status-same', 'PUT', '/api/leads/{lead1}', { status: 'contacted' });
  await J('lead-put-badstage', 'PUT', '/api/leads/{lead1}', { status: 'zzz' });
  await J('lead-put-empty', 'PUT', '/api/leads/{lead1}', {});
  await J('lead-put-404', 'PUT', '/api/leads/99999', { notes: 'x' });
  await J('lead-put-assign', 'PUT', '/api/leads/{lead1}', { assigned_to: '{agent2Id}' });
  await J('lead-put-assign-bad', 'PUT', '/api/leads/{lead1}', { assigned_to: 'abc' });
  await J('lead-put-assign-admin', 'PUT', '/api/leads/{lead1}', { assigned_to: 1 });
  await J('lead-put-unassign', 'PUT', '/api/leads/{lead1}', { assigned_to: null });
  await J('lead-put-agent-other', 'PUT', '/api/leads/{lead1}', { notes: 'hack' }, { as: 'agent2' });
  await call('lead-contact', 'POST', '/api/leads/{lead4}/contact', { body: {} });
  await call('lead-contact-again', 'POST', '/api/leads/{lead4}/contact', { body: {} });
  await call('lead-contact-404', 'POST', '/api/leads/99999/contact', { body: {} });

  // ── timeline + activities ──
  await J('act-bad-type', 'POST', '/api/leads/{lead1}/activities', { type: 'zzz', summary: 's' });
  await J('act-no-summary', 'POST', '/api/leads/{lead1}/activities', { type: 'note' });
  await J('act-note', 'POST', '/api/leads/{lead1}/activities', { type: 'note', summary: 'Spoke to owner' });
  await J('act-whatsapp', 'POST', '/api/leads/{lead1}/activities', { type: 'whatsapp', summary: 'Sent brochure', metadata: { template: 'intro' } });
  await call('timeline', 'GET', '/api/leads/{lead1}/timeline');
  await call('timeline-limit', 'GET', '/api/leads/{lead1}/timeline?limit=2&offset=1');
  await call('timeline-404', 'GET', '/api/leads/99999/timeline');

  // ── tags ──
  await J('tag-create-agent', 'POST', '/api/tags', { name: 'Hot' }, { as: 'agent1' });
  await J('tag-create-noname', 'POST', '/api/tags', {}, { as: 'manager' });
  await J('tag-create', 'POST', '/api/tags', { name: 'Hot Lead', color: '#ef4444' }, { as: 'manager', save: { tagA: d => d.id } });
  await J('tag-create2', 'POST', '/api/tags', { name: 'Chain Store' }, { as: 'manager', save: { tagB: d => d.id } });
  await J('tag-create-dup', 'POST', '/api/tags', { name: 'hot lead' }, { as: 'manager' });
  await call('tags-list', 'GET', '/api/tags');
  await J('lead-tags-set', 'PUT', '/api/leads/{lead1}/tags', { tag_ids: ['{tagA}', '{tagB}'] }, { as: 'manager' });
  await J('lead-tags-set-bad', 'PUT', '/api/leads/{lead1}/tags', { tag_ids: [9999] }, { as: 'manager' });
  await J('lead-tags-set-notarray', 'PUT', '/api/leads/{lead1}/tags', { tag_ids: 'x' }, { as: 'manager' });
  await J('lead-tags-set-agent', 'PUT', '/api/leads/{lead1}/tags', { tag_ids: [] }, { as: 'agent2' });
  await call('lead-tags-get', 'GET', '/api/leads/{lead1}/tags');
  await call('leads-list-tag', 'GET', '/api/leads?tag_id={tagA}');
  await call('tag-delete', 'DELETE', '/api/tags/{tagB}', { as: 'manager' });
  await call('tag-delete-404', 'DELETE', '/api/tags/99999', { as: 'manager' });
  await call('tag-delete-agent', 'DELETE', '/api/tags/{tagA}', { as: 'agent1' });

  // ── bulk status ──
  await J('bulk-status-agent', 'POST', '/api/leads/bulk-status', { lead_ids: ['{lead1}'], status: 'qualified' }, { as: 'agent1' });
  await J('bulk-status-empty', 'POST', '/api/leads/bulk-status', { lead_ids: [], status: 'qualified' }, { as: 'manager' });
  await J('bulk-status-badstage', 'POST', '/api/leads/bulk-status', { lead_ids: ['{lead1}'], status: 'nope' }, { as: 'manager' });
  await J('bulk-status', 'POST', '/api/leads/bulk-status', { lead_ids: ['{lead1}', '{lead2}', 99999, 'abc'], status: 'qualified', note: 'batch' }, { as: 'manager' });
  await J('bulk-status-same', 'POST', '/api/leads/bulk-status', { lead_ids: ['{lead1}'], status: 'qualified' }, { as: 'manager' });

  // ── duplicates + merge ──
  await call('dups', 'GET', '/api/leads/{lead1}/duplicates');
  await call('dups-404', 'GET', '/api/leads/99999/duplicates');
  await J('merge-agent', 'POST', '/api/leads/{lead5}/merge', { into_lead_id: '{lead1}' }, { as: 'agent1' });
  await J('merge-self', 'POST', '/api/leads/{lead5}/merge', { into_lead_id: '{lead5}' }, { as: 'manager' });
  await J('merge-badtarget', 'POST', '/api/leads/{lead5}/merge', { into_lead_id: 'x' }, { as: 'manager' });
  await J('merge-404', 'POST', '/api/leads/{lead5}/merge', { into_lead_id: 99999 }, { as: 'manager' });
  await J('merge', 'POST', '/api/leads/{lead5}/merge', { into_lead_id: '{lead1}' }, { as: 'manager' });
  await J('merge-again', 'POST', '/api/leads/{lead5}/merge', { into_lead_id: '{lead1}' }, { as: 'manager' });
  await call('lead-get-merged', 'GET', '/api/leads/{lead5}');

  // ── pipeline stages + board ──
  await call('stages-list', 'GET', '/api/pipeline/stages');
  await J('stage-create-agent', 'POST', '/api/pipeline/stages', { name: 'Demo' }, { as: 'agent1' });
  await J('stage-create-noname', 'POST', '/api/pipeline/stages', {}, { as: 'manager' });
  await J('stage-create', 'POST', '/api/pipeline/stages', { name: 'Demo Booked', color: '#0ea5e9', probability: 60 }, { as: 'manager', save: { stageX: d => d.id } });
  await J('stage-create-dup', 'POST', '/api/pipeline/stages', { name: 'Demo Booked' }, { as: 'manager' });
  await J('stage-patch', 'PATCH', '/api/pipeline/stages/{stageX}', { probability: 70, color: '#06b6d4' }, { as: 'manager' });
  await J('stage-patch-empty', 'PATCH', '/api/pipeline/stages/{stageX}', {}, { as: 'manager' });
  await J('stage-patch-404', 'PATCH', '/api/pipeline/stages/9999', { name: 'x' }, { as: 'manager' });
  await call('stages-list2', 'GET', '/api/pipeline/stages');
  await J('stage-reorder-bad', 'PUT', '/api/pipeline/stages/reorder', { ordered_ids: [] }, { as: 'manager' });
  await J('stage-reorder-unknown', 'PUT', '/api/pipeline/stages/reorder', { ordered_ids: [9999] }, { as: 'manager' });
  await call('board', 'GET', '/api/leads/pipeline');
  await call('board-agent', 'GET', '/api/leads/pipeline', { as: 'agent1' });
  await J('lead-to-demo', 'PUT', '/api/leads/{lead2}', { status: 'demo_booked' });
  await call('stage-delete-inuse', 'DELETE', '/api/pipeline/stages/{stageX}', { as: 'manager' });
  await call('stage-delete-force', 'DELETE', '/api/pipeline/stages/{stageX}?force=true', { as: 'manager' });
  await call('stage-delete-404', 'DELETE', '/api/pipeline/stages/9999', { as: 'manager' });

  // ── follow-ups ──
  await J('fu-bad-type', 'POST', '/api/leads/{lead2}/follow-ups', { type: 'smoke' });
  await J('fu-create', 'POST', '/api/leads/{lead2}/follow-ups', { type: 'call', due_at: day(-1), notes: 'overdue call' }, { save: { fu1: d => d.id } });
  await J('fu-create-today', 'POST', '/api/leads/{lead2}/follow-ups', { type: 'whatsapp', due_at: new Date().toISOString() }, { save: { fu2: d => d.id } });
  await J('fu-create-future', 'POST', '/api/leads/{lead2}/follow-ups', { type: 'meeting', due_at: day(5) }, { save: { fu3: d => d.id } });
  await J('fu-create-404', 'POST', '/api/leads/99999/follow-ups', { type: 'call' });
  await call('fu-list', 'GET', '/api/leads/{lead2}/follow-ups');
  await call('fu-list-404', 'GET', '/api/leads/99999/follow-ups');
  await call('fu-due-today', 'GET', '/api/follow-ups/due?scope=today');
  await call('fu-due-overdue', 'GET', '/api/follow-ups/due?scope=overdue');
  await call('fu-due-upcoming', 'GET', '/api/follow-ups/due?scope=upcoming');
  await call('fu-due-all', 'GET', '/api/follow-ups/due?scope=all&include_completed=true');
  await call('fu-due-bad', 'GET', '/api/follow-ups/due?scope=zzz');
  await call('fu-due-agent', 'GET', '/api/follow-ups/due?scope=all', { as: 'agent1' });
  await call('fu-due-manager', 'GET', '/api/follow-ups/due?scope=all', { as: 'manager' });
  await J('fu-patch-bad', 'PATCH', '/api/follow-ups/{fu1}', { outcome: 'zzz' });
  await J('fu-patch-resched-nodue', 'PATCH', '/api/follow-ups/{fu1}', { outcome: 'rescheduled' });
  await J('fu-patch-resched', 'PATCH', '/api/follow-ups/{fu1}', { outcome: 'rescheduled', due_at: day(2) }, { save: {} });
  await J('fu-patch-complete', 'PATCH', '/api/follow-ups/{fu2}', { completed: true, notes: 'done' });
  await J('fu-patch-404', 'PATCH', '/api/follow-ups/99999', { completed: true });
  await J('fu-patch-agent-other', 'PATCH', '/api/follow-ups/{fu3}', { completed: true }, { as: 'agent3' });

  // ── delete ──
  await call('lead-delete-404', 'DELETE', '/api/leads/99999');
  await call('lead-delete-agent-other', 'DELETE', '/api/leads/{lead1}', { as: 'agent2' });
  await call('lead-delete-pending', 'DELETE', '/api/leads/{lead2}');
  await call('lead-delete-own', 'DELETE', '/api/leads/{lead3}', { as: 'agent1' });
  await call('lead-delete-ok', 'DELETE', '/api/leads/{lead4}');
};
