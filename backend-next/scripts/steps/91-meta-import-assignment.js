// New features: Meta Lead Ads CSV + Excel upload, assignment at upload (round-robin,
// manual, rules, file column), capacity, import batches, unassigned tools, date and
// poison-row handling, and API-level RBAC for import. Skipped by --only-legacy.
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { parseCsv } = require('../../src/utils/tabularFile');

module.exports = async ({ vars, tokens, call, expect }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });
  const csvText = fs.readFileSync(path.join(__dirname, '..', '..', 'test', 'fixtures', 'meta-leads.csv'), 'utf8');
  const matrix = parseCsv(csvText);
  const header = matrix[0];
  const rows = matrix.slice(1);
  const file = (name, content, type = 'text/csv') => ({ file: { name, content, type } });
  const toXlsx = (aoa, sheet = 'Leads') => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  };
  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  // n fresh Meta-style rows (new lead ids + phones) taken from the real file's rows.
  const fresh = (n, seed, source) => rows.filter(r => !source || r[11] === source).slice(0, n).map((r, i) => {
    const c = r.slice();
    c[0] = `l:${seed}${String(i).padStart(4, '0')}`;
    c[13] = `p:+9199${seed}${String(i).padStart(4, '0')}`;     // 10 digits after +91, unique per seed + row
    return c;
  });
  const open = u => u.open_leads;

  // Earlier suites set agent1's personal capacity to 20; clear it so the even-split
  // assertions below are about the planner, not about that cap (capacity has its own
  // scenarios in section 10).
  await J('cap-clear-start', 'PUT', '/api/users/{agent1Id}/capacity', { max_open_leads: null }, { as: 'manager' });

  // ── 0. who may upload? (default RBAC: managers/admins, not agents) ──
  const agentTry = await call('imp-agent-preview', 'POST', '/api/leads/import/preview', { as: 'agent1', form: { fields: {}, ...file('meta.csv', csvText) } });
  expect(agentTry.status === 403, 'agents cannot upload leads by default');
  const mgrTry = await call('imp-manager-preview', 'POST', '/api/leads/import/preview', { as: 'manager', form: { fields: {}, ...file('meta.csv', csvText) } });
  expect(mgrTry.status === 200, 'managers can upload leads');

  // ── 1. Meta CSV preview ──
  const pv = await call('meta-preview', 'POST', '/api/leads/import/preview', { form: { fields: {}, ...file('29-09-2026 - Oct3.csv', csvText) }, save: { metaToken: d => d.preview_token } });
  expect(pv.status === 200 && pv.data.profile === 'meta_lead_ads', 'Meta export auto-detected');
  expect(pv.data.total_rows === 102, 'all 102 rows seen');
  const m = pv.data.mapping;
  expect(m.customer_name === 'full_name' && m.phone_number === 'phone_number' && m.email_id === 'email' && m.lead_source === 'platform', `Meta columns mapped (${JSON.stringify(m)})`);
  expect(m.segment === null && m.call_status === null, 'campaign_name is NOT misread as segment; CREATED is not a call status');
  expect(pv.data.profile_defaults && pv.data.profile_defaults.segment === 'Social Media Campaign', 'default segment advertised');
  expect(pv.data.problem_count === 0, `no row problems in the real file (got ${pv.data.problem_count}: ${JSON.stringify(pv.data.problems.slice(0, 2))})`);

  // ── 2. Excel version of the same data previews identically ──
  const xbuf = toXlsx([header, ...rows]);
  const xpv = await call('meta-xlsx-preview', 'POST', '/api/leads/import/preview', { form: { fields: {}, ...file('meta.xlsx', xbuf, XLSX_TYPE) } });
  expect(xpv.status === 200 && xpv.data.format === 'xlsx', 'xlsx accepted');
  expect(JSON.stringify(xpv.data.mapping) === JSON.stringify(pv.data.mapping), 'xlsx maps to the same fields as csv');
  expect(xpv.data.total_rows === pv.data.total_rows && xpv.data.profile === 'meta_lead_ads', 'xlsx: same row count + profile');
  expect(JSON.stringify(xpv.data.sample_rows) === JSON.stringify(pv.data.sample_rows), 'xlsx: identical sample rows');

  // ── 3. dry-run plan: round-robin over three telecallers ──
  const rr = { round_robin: { enabled: true, user_ids: ['{agent1Id}', '{agent2Id}', '{agent3Id}'] }, use_file_column: false };
  const before = await call('wl-before', 'GET', '/api/agents/workload');
  const loadBefore = Object.fromEntries(before.data.agents.map(a => [a.id, open(a)]));
  const plan = await J('meta-plan-rr', 'POST', '/api/leads/import/plan', { preview_token: '{metaToken}', assignment: rr });
  expect(plan.status === 200 && plan.data.will_insert === 102, 'plan: 102 inserts');
  expect(plan.data.assignment_plan.unassigned === 0, 'plan: nothing left unassigned');
  expect(plan.data.assignment_plan.by_user.reduce((a, b) => a + b.leads, 0) === 102, 'plan: per-telecaller counts add up to 102');
  const none = await J('meta-plan-none', 'POST', '/api/leads/import/plan', { preview_token: '{metaToken}', assignment: { use_file_column: true } });
  expect(none.data.assignment_plan.unassigned === 102, 'plan with no strategy: all 102 UNASSIGNED (never guessed)');
  const badUsers = await J('meta-plan-baduser', 'POST', '/api/leads/import/plan', { preview_token: '{metaToken}', assignment: { round_robin: { enabled: true, user_ids: [1] } } });
  expect(badUsers.status === 400, 'admin accounts cannot be round-robin targets');
  const noTok = await J('meta-plan-notoken', 'POST', '/api/leads/import/plan', { preview_token: 'nope' });
  expect(noTok.status === 400, 'plan needs a live preview token');

  // ── 4. commit with round-robin ──
  const c1 = await J('meta-commit-rr', 'POST', '/api/leads/import/commit', { preview_token: '{metaToken}', assignment: rr }, { save: { batch1: d => d.batch_id } });
  expect(c1.status === 200 && c1.data.inserted === 102 && c1.data.errors.length === 0, `commit inserted 102 with no errors (${JSON.stringify(c1.data.errors && c1.data.errors.slice(0, 2))})`);
  expect(c1.data.profile === 'meta_lead_ads' && c1.data.batch_id > 0, 'batch + profile reported');
  expect(c1.data.assignment.unassigned === 0 && c1.data.assignment.by_user.reduce((a, b) => a + b.leads, 0) === 102, 'all 102 assigned');
  const after = await call('wl-after', 'GET', '/api/agents/workload');
  const loadAfter = Object.fromEntries(after.data.agents.map(a => [a.id, open(a)]));
  const ids = [vars.agent1Id, vars.agent2Id, vars.agent3Id];
  const totals = ids.map(id => loadAfter[id]);
  expect(Math.max(...totals) - Math.min(...totals) <= 1, `least-loaded round-robin evens out total load (${totals.join('/')})`);
  expect(ids.reduce((a, id) => a + (loadAfter[id] - loadBefore[id]), 0) === 102, 'workload grew by exactly 102');

  const batchLeads = await call('meta-batch-leads', 'GET', '/api/leads?import_batch_id={batch1}&limit=1000');
  expect(batchLeads.data.length === 102, 'filter by import batch returns the 102 leads');
  expect(batchLeads.data.every(l => l.segment === 'Social Media Campaign'), 'segment defaulted to Social Media Campaign');
  expect(batchLeads.data.every(l => ['Instagram', 'Facebook'].includes(l.source)), 'platform ig/fb -> Instagram/Facebook');
  expect(batchLeads.data.every(l => l.external_id && /^\d+$/.test(l.external_id)), 'Meta lead id kept (prefix stripped)');
  expect(batchLeads.data.every(l => l.assigned_to && l.assignee_count === 1), 'every uploaded lead has exactly one owner');
  const first = batchLeads.data.find(l => l.name === 'Peeyush');
  expect(first && first.phone === '+919522676677' && first.phone_clean === '9522676677', 'phone p:+91… stripped and cleaned');
  const det = await call('meta-lead-detail', 'GET', `/api/leads/${first.id}`);
  expect(det.data.lead_meta.campaign_name === 'MediVoy - India Pharmacy Vendor Onboarding' && det.data.lead_meta.ad_name === 'Onboarding Poster - V1', 'ad / campaign metadata stored');
  expect(det.data.received_at && String(det.data.received_at).startsWith('2026-10-02'), 'Meta created_time kept as received_at');
  const restricted = batchLeads.data.find(l => l.external_id === '1118592070857648');
  const rdet = await call('meta-restricted-detail', 'GET', `/api/leads/${restricted.id}`);
  expect(rdet.data.lead_meta.ad_name === null && rdet.data.lead_meta.campaign_name === null, 'Meta permission-notice text is dropped, not stored');

  // ── 5. same file again: nothing duplicated, assignments untouched ──
  const c2 = await J('meta-commit-again', 'POST', '/api/leads/import/commit', { assignment: rr, ...{} }, { form: { fields: { assignment: rr }, ...file('29-09-2026 - Oct3.csv', csvText) } });
  expect(c2.status === 200 && c2.data.inserted === 0 && c2.data.updated === 102, `re-upload updates in place (inserted ${c2.data.inserted}, updated ${c2.data.updated})`);
  const afterAgain = await call('wl-after-again', 'GET', '/api/agents/workload');
  expect(ids.every(id => afterAgain.data.agents.find(a => a.id === id).open_leads === loadAfter[id]), 're-upload does not move or wipe existing assignments');

  // ── 6. batches ──
  const bl = await call('batches', 'GET', '/api/leads/import/batches');
  expect(bl.data.length >= 2 && bl.data[bl.data.length - 1].id <= bl.data[0].id, 'batch history, newest first');
  const bd = await call('batch-detail', 'GET', '/api/leads/import/batches/{batch1}');
  expect(bd.data.by_user.reduce((a, b) => a + b.leads, 0) === 102 && bd.data.leads_now === 102 && bd.data.unassigned_now === 0, 'batch detail breaks down by telecaller');
  await call('batch-404', 'GET', '/api/leads/import/batches/99999');

  // ── 7. upload with NO strategy -> UNASSIGNED pile, then manual tools ──
  const unRows = fresh(20, 7100, null);
  const u1 = await J('unassigned-upload', 'POST', '/api/leads/import/commit', {}, { form: { fields: { assignment: { use_file_column: true } }, ...file('batch2.xlsx', toXlsx([header, ...unRows]), XLSX_TYPE) }, save: { batch2: d => d.batch_id } });
  expect(u1.data.inserted === 20 && u1.data.assignment.unassigned === 20, 'no strategy: all 20 land UNASSIGNED');
  const un = await call('unassigned-list', 'GET', '/api/leads?assigned=unassigned&import_batch_id={batch2}&limit=1000');
  expect(un.data.length === 20, 'Unassigned filter finds them');
  const sum = await call('unassigned-summary', 'GET', '/api/leads/unassigned/summary');
  expect(sum.status === 200 && sum.data.unassigned >= 20 && sum.data.by_segment.some(s => s.segment === 'Social Media Campaign'), 'unassigned summary counts the pile by segment');
  const sumAgent = await call('unassigned-summary-agent', 'GET', '/api/leads/unassigned/summary', { as: 'agent1' });
  expect(sumAgent.status === 403, 'unassigned summary is manager-only');
  const stats = await call('leads-summary', 'GET', '/api/leads/summary');
  expect(stats.data.unassigned >= 20 && stats.data.total >= 122, 'tab counts available');
  const b2ids = un.data.map(l => l.id);
  const ba = await J('unassigned-bulk-assign', 'POST', '/api/leads/bulk-assign', { lead_ids: b2ids, assigned_to: '{agent3Id}', note: 'pile' });
  expect(ba.data.assigned.length === 20, 'bulk assign the whole pile to one telecaller');
  const un2 = await call('unassigned-after', 'GET', '/api/leads?assigned=unassigned&import_batch_id={batch2}&limit=1000');
  expect(un2.data.length === 0, 'pile is empty after assignment');
  // bulk round-robin restricted to the telecallers ticked in the assign drawer
  const poolRr = await J('bulk-assign-pool', 'POST', '/api/leads/bulk-assign', { lead_ids: b2ids.slice(0, 4), strategy: 'round_robin', user_ids: ['{agent3Id}', '{managerId}'] });
  expect(poolRr.status === 200 && poolRr.data.assigned.every(a => [vars.agent3Id, vars.managerId].includes(a.assigned_to)), 'bulk round-robin honours user_ids (only the ticked telecallers)');
  const poolBad = await J('bulk-assign-pool-empty', 'POST', '/api/leads/bulk-assign', { lead_ids: b2ids.slice(0, 1), strategy: 'round_robin', user_ids: [99999] });
  expect(poolBad.status === 400, 'a pool with nobody assignable is rejected');
  const bu = await J('bulk-unassign', 'POST', '/api/leads/bulk-unassign', { lead_ids: b2ids.slice(0, 5), note: 'take back' });
  expect(bu.data.unassigned_count === 5, 'bulk unassign works');
  const bu2 = await J('bulk-unassign-again', 'POST', '/api/leads/bulk-unassign', { lead_ids: b2ids.slice(0, 5) });
  expect(bu2.data.unassigned_count === 0 && bu2.data.skipped.length === 5, 'unassigning twice skips');
  const un3 = await call('unassigned-after-unassign', 'GET', '/api/leads?assigned=unassigned&import_batch_id={batch2}&limit=1000');
  expect(un3.data.length === 5, '5 are back in the pile');
  const mine = await call('leads-assigned-mine', 'GET', '/api/leads?assigned=mine&limit=1000', { as: 'agent3' });
  expect(mine.data.length > 0 && mine.data.every(l => l.assigned_to === vars.agent3Id), 'My leads tab');
  const agentSees = await call('agent-sees-uploaded', 'GET', '/api/leads?import_batch_id={batch2}&limit=1000', { as: 'agent3' });
  expect(agentSees.data.length === 15, `agent sees exactly the leads assigned to them from the upload (${agentSees.data.length})`);

  // ── 8. manual: the whole upload to one telecaller ──
  const mRows = fresh(5, 7200, null);
  const mc = await J('manual-upload', 'POST', '/api/leads/import/commit', {}, { form: { fields: { assignment: { manual_user_id: '{agent2Id}' } }, ...file('manual.xlsx', toXlsx([header, ...mRows]), XLSX_TYPE) } });
  expect(mc.data.inserted === 5 && mc.data.assignment.by_reason.manual === 5 && mc.data.assignment.by_user.length === 1, 'manual_user_id: one telecaller gets everything');
  const mAdmin = await J('manual-upload-bad', 'POST', '/api/leads/import/commit', {}, { form: { fields: { assignment: { manual_user_id: 1 } }, ...file('x.csv', csvText) } });
  expect(mAdmin.status === 400, 'cannot hand an upload to an admin account');

  // ── 9. rules + round-robin chain ──
  const rule = await J('chain-rule', 'POST', '/api/assignment-rules', { name: 'Instagram to Meena', priority: 5, conditions: { source: ['Instagram'] }, strategy: 'fixed', fixed_user_id: '{agent3Id}' }, { as: 'manager', save: { chainRule: d => d.id } });
  const cRows = fresh(12, 7300, null);
  const igCount = cRows.filter(r => r[11] === 'ig').length;
  const cc = await J('chain-upload', 'POST', '/api/leads/import/commit', {}, { form: { fields: { assignment: { use_rules: true, use_file_column: false, round_robin: { enabled: true, user_ids: ['{agent1Id}', '{agent2Id}'] } } }, ...file('chain.xlsx', toXlsx([header, ...cRows]), XLSX_TYPE) } });
  expect(cc.data.assignment.by_reason.rule === igCount && cc.data.assignment.by_reason.round_robin === 12 - igCount, `chain: rule handles Instagram (${igCount}), round-robin the rest (${12 - igCount})`);
  expect(cc.data.assignment.by_user.every(u => u.user_id !== vars.agent3Id || u.leads === igCount), 'fixed-rule leads all went to the rule target');
  await call('chain-rule-delete', 'DELETE', '/api/assignment-rules/{chainRule}', { as: 'manager' });
  void rule;

  // ── 10. capacity: a telecaller at their limit is skipped ──
  await J('cap-zero', 'PUT', '/api/users/{agent1Id}/capacity', { max_open_leads: 0 }, { as: 'manager' });
  const capRows = fresh(6, 7400, null);
  const cap = await J('cap-upload', 'POST', '/api/leads/import/commit', {}, { form: { fields: { assignment: { round_robin: { enabled: true, user_ids: ['{agent1Id}', '{agent2Id}'] }, use_file_column: false } }, ...file('cap.xlsx', toXlsx([header, ...capRows]), XLSX_TYPE) } });
  expect(cap.data.assignment.by_user.length === 1 && cap.data.assignment.by_user[0].user_id === vars.agent2Id, 'agent at capacity 0 is skipped by round-robin');
  await J('cap-reset', 'PUT', '/api/users/{agent1Id}/capacity', { max_open_leads: null }, { as: 'manager' });
  await J('cap-all-zero-a', 'PUT', '/api/users/{agent1Id}/capacity', { max_open_leads: 0 }, { as: 'manager' });
  await J('cap-all-zero-b', 'PUT', '/api/users/{agent2Id}/capacity', { max_open_leads: 0 }, { as: 'manager' });
  const full = await J('cap-full-upload', 'POST', '/api/leads/import/commit', {}, { form: { fields: { assignment: { round_robin: { enabled: true, user_ids: ['{agent1Id}', '{agent2Id}'] }, use_file_column: false } }, ...file('full.xlsx', toXlsx([header, ...fresh(3, 7500, null)]), XLSX_TYPE) } });
  expect(full.data.inserted === 3 && full.data.assignment.unassigned === 3 && full.data.assignment.by_reason.capacity === 3, 'everyone full: leads stay UNASSIGNED with reason capacity');
  await J('cap-reset-a', 'PUT', '/api/users/{agent1Id}/capacity', { max_open_leads: null }, { as: 'manager' });
  await J('cap-reset-b', 'PUT', '/api/users/{agent2Id}/capacity', { max_open_leads: null }, { as: 'manager' });

  // ── 11. sheet-style file: the file's Tellecaller Name column is still honoured ──
  const sheet = 'Segment,Tellecaller Name,Customer Name,Pharmacy Name,Locality,Phone Number,Followup Date,Call Status\n'
    + 'Cold Call,Ravi Telecaller,Priya N,Priya Pharma,Dadar,9811100001,,Interested\n'
    + 'Cold Call,Nobody Known,Raj K,Raj Chemists,Dadar,9811100002,,\n';
  // (the manager has headroom; the agents are at the 50-lead capacity after the uploads above)
  const sc = await J('sheet-file-col', 'POST', '/api/leads/import/commit', {}, { form: { fields: { assignment: { use_file_column: true, round_robin: { enabled: true, user_ids: ['{managerId}'] } } }, ...file('sheet.csv', sheet) } });
  expect(sc.data.assignment.by_reason.file === 1 && sc.data.assignment.by_reason.round_robin === 1, 'file column wins where it resolves; round-robin catches the unmatched name');
  expect(sc.data.unmatched_names.includes('Nobody Known'), 'unmatched telecaller name still reported');

  // ── 12. dates + poison rows no longer abort the import ──
  const dirty = 'Customer Name,Pharmacy Name,Phone Number,Followup Date,Call Attempted Date\n'
    + 'Date Good,Date Pharma,9822200001,29/09/2026,28/09/2026\n'      // day > 12: legacy aborted the whole import here
    + 'Date Bad,Bad Pharma,9822200002,notadate,\n'                      // unparsable date: stored as NULL + flagged
    + `Too Long,Long Pharma,${'9'.repeat(60)},,\n`                      // phone > varchar(50): DB error for ONE row
    + 'After Poison,After Pharma,9822200004,,\n';
  const d = await J('dirty-upload', 'POST', '/api/leads/import/commit', {}, { form: { fields: {}, ...file('dirty.csv', dirty) } });
  expect(d.status === 200, 'a dirty file no longer fails the whole import');
  expect(d.data.inserted === 3 && d.data.errors.length === 1 && d.data.errors[0].row === 4, `poison row isolated: 3 inserted, row 4 reported (${JSON.stringify(d.data.errors)})`);
  const good = await call('dirty-lead', 'GET', '/api/leads?search=Date%20Good');
  expect(good.data.length === 1, 'dd/mm/yyyy row imported');
  const goodDetail = await call('dirty-lead-detail', 'GET', `/api/leads/${good.data[0].id}`);
  // pg returns DATE as local midnight, so compare the local calendar day, not the UTC string
  const ld = new Date(goodDetail.data.followup_date);
  expect(ld.getFullYear() === 2026 && ld.getMonth() === 8 && ld.getDate() === 29, `dd/mm/yyyy parsed as day/month (${goodDetail.data.followup_date})`);
  const bad = await call('dirty-lead-bad', 'GET', '/api/leads?search=Date%20Bad');
  const badDetail = await call('dirty-lead-bad-detail', 'GET', `/api/leads/${bad.data[0].id}`);
  expect(badDetail.data.followup_date === null && /FOLLOWUP_DATE_UNPARSED/.test(badDetail.data.data_check), 'unparsable date stored as NULL and flagged in data_check');

  // ── 13. API-level RBAC for import ──
  await J('rbac-grant-import', 'PUT', '/api/rbac/users/{agent3Id}', { permissions: { pages: { leads: { view: true, create: true, update: true, import: true } } } });
  const ok = await call('rbac-agent-import-granted', 'POST', '/api/leads/import/preview', { as: 'agent3', form: { fields: {}, ...file('meta.csv', csvText) } });
  expect(ok.status === 200, 'granting leads.import lets an agent upload');
  await call('rbac-revoke-import', 'DELETE', '/api/rbac/users/{agent3Id}');
  const no = await call('rbac-agent-import-revoked', 'POST', '/api/leads/import/preview', { as: 'agent3', form: { fields: {}, ...file('meta.csv', csvText) } });
  expect(no.status === 403, 'revoking it blocks the upload again');

  // hiding the Leads tab blocks the API too, not just the sidebar link
  await J('rbac-hide-leads', 'PUT', '/api/rbac/roles/agent', { permissions: { pages: { leads: { view: false } } } });
  const hidden = await call('rbac-agent-leads-hidden', 'GET', '/api/leads', { as: 'agent1' });
  expect(hidden.status === 403, 'hidden Leads tab => /api/leads is 403 for agents');
  const adminOk = await call('rbac-admin-leads-still', 'GET', '/api/leads?limit=1');
  expect(adminOk.status === 200, 'admins unaffected');
  await call('rbac-restore-agent', 'DELETE', '/api/rbac/roles/agent');
  const back = await call('rbac-agent-leads-back', 'GET', '/api/leads?limit=1', { as: 'agent1' });
  expect(back.status === 200, 'restoring defaults restores access');

  // agents cannot hand leads on through PUT, but managers can
  const mine1 = await call('put-assign-pick', 'GET', '/api/leads?assigned=mine&limit=1', { as: 'agent1' });
  if (mine1.data.length) {
    const pa = await J('put-assign-agent', 'PUT', `/api/leads/${mine1.data[0].id}`, { assigned_to: '{agent2Id}' }, { as: 'agent1' });
    expect(pa.status === 403, 'an agent cannot reassign a lead through PUT');
  }
  void tokens;
};
