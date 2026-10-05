'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planAssignment } = require('../src/services/ImportAssignmentService');

const mkLeads = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({ file_user_id: null, rule: null, ...extra(i) }));
const deps = (load = {}, cap = 50) => ({
  load: new Map(Object.entries(load).map(([k, v]) => [Number(k), v])),
  capOf: () => cap,
});
const count = plan => plan.assignments.reduce((m, a) => { if (a.user_id !== null) m[a.user_id] = (m[a.user_id] || 0) + 1; return m; }, {});

test('nothing configured -> every lead is UNASSIGNED (never guessed)', () => {
  const plan = planAssignment({ leads: mkLeads(5), options: {}, deps: deps() });
  assert.equal(plan.assignments.length, 5);
  assert.ok(plan.assignments.every(a => a.user_id === null && a.reason === 'unassigned'));
  assert.equal(plan.summary.unassigned, 5);
});

test('manual_user_id wins over everything', () => {
  const leads = mkLeads(3, () => ({ file_user_id: 9, rule: { id: 1, strategy: 'fixed', fixed_user_id: 8, pool: [] } }));
  const plan = planAssignment({ leads, options: { manual_user_id: 7, use_file_column: true, use_rules: true, round_robin: { enabled: true, user_ids: [1, 2] } }, deps: deps() });
  assert.deepEqual(count(plan), { 7: 3 });
  assert.ok(plan.assignments.every(a => a.reason === 'manual'));
});

test('file column beats rules and round-robin', () => {
  const leads = mkLeads(2, () => ({ file_user_id: 4, rule: { id: 1, strategy: 'fixed', fixed_user_id: 8, pool: [] } }));
  const plan = planAssignment({ leads, options: { use_file_column: true, use_rules: true, round_robin: { enabled: true, user_ids: [1, 2] } }, deps: deps() });
  assert.deepEqual(count(plan), { 4: 2 });
  assert.equal(plan.summary.byReason.file, 2);
});

test('file column ignored when the switch is off', () => {
  const leads = mkLeads(2, () => ({ file_user_id: 4 }));
  const plan = planAssignment({ leads, options: { use_file_column: false, round_robin: { enabled: true, user_ids: [1] } }, deps: deps() });
  assert.deepEqual(count(plan), { 1: 2 });
});

test('a fixed rule beats round-robin; a lead with no matching rule falls through to round-robin', () => {
  const leads = [
    { file_user_id: null, rule: { id: 3, name: 'Hot to Asha', strategy: 'fixed', fixed_user_id: 8, pool: [] } },
    { file_user_id: null, rule: null },
    { file_user_id: null, rule: null },
  ];
  const plan = planAssignment({ leads, options: { use_rules: true, round_robin: { enabled: true, user_ids: [1, 2] } }, deps: deps() });
  assert.equal(plan.assignments[0].user_id, 8);
  assert.equal(plan.assignments[0].reason, 'rule');
  assert.equal(plan.assignments[0].rule_id, 3);
  assert.deepEqual([plan.assignments[1].user_id, plan.assignments[2].user_id], [1, 2]);
  assert.equal(plan.assignments[1].reason, 'round_robin');
});

test('round-robin splits 10 leads over 3 empty users as 4/3/3', () => {
  const plan = planAssignment({ leads: mkLeads(10), options: { round_robin: { enabled: true, user_ids: [1, 2, 3] } }, deps: deps() });
  assert.deepEqual(count(plan), { 1: 4, 2: 3, 3: 3 });
  assert.equal(plan.summary.unassigned, 0);
});

test('round-robin is least-loaded first: a busy user gets fewer', () => {
  const plan = planAssignment({ leads: mkLeads(6), options: { round_robin: { enabled: true, user_ids: [1, 2, 3] } }, deps: deps({ 1: 10, 2: 0, 3: 0 }) });
  assert.deepEqual(count(plan), { 2: 3, 3: 3 });
});

test('round-robin respects capacity and reports the overflow', () => {
  const plan = planAssignment({ leads: mkLeads(6), options: { round_robin: { enabled: true, user_ids: [1, 2] } }, deps: deps({ 1: 48, 2: 49 }, 50) });
  assert.deepEqual(count(plan), { 1: 2, 2: 1 });            // 2 + 1 free slots
  assert.equal(plan.summary.unassigned, 3);
  assert.equal(plan.summary.byReason.capacity, 3);
  assert.equal(plan.assignments.filter(a => a.reason === 'capacity').length, 3);
});

test('round-robin: nobody under capacity -> everything is unassigned with reason capacity', () => {
  const plan = planAssignment({ leads: mkLeads(3), options: { round_robin: { enabled: true, user_ids: [1] } }, deps: deps({ 1: 50 }, 50) });
  assert.equal(plan.summary.unassigned, 3);
  assert.equal(plan.summary.byReason.capacity, 3);
});

test('explicit assignments (file/manual/fixed rule) count toward load but are not blocked by capacity', () => {
  const leads = [{ file_user_id: 1, rule: null }, { file_user_id: 1, rule: null }, { file_user_id: null, rule: null }];
  const plan = planAssignment({ leads, options: { use_file_column: true, round_robin: { enabled: true, user_ids: [1, 2] } }, deps: deps({ 1: 49 }, 50) });
  assert.equal(plan.assignments[0].user_id, 1);
  assert.equal(plan.assignments[1].user_id, 1);              // over capacity, still honoured: explicit intent
  assert.equal(plan.assignments[2].user_id, 2);              // round-robin sees user 1 as full
});

test('a pooled rule (least_loaded) picks within its pool, under capacity', () => {
  const rule = { id: 5, name: 'Web pool', strategy: 'least_loaded', fixed_user_id: null, pool: [10, 11] };
  const plan = planAssignment({ leads: mkLeads(4, () => ({ rule })), options: { use_rules: true }, deps: deps({ 10: 3, 11: 0 }) });
  assert.deepEqual(count(plan), { 10: 1, 11: 3 });           // 11 takes 3 until it ties 10 (load 3), then ties break by id
  assert.ok(plan.assignments.every(a => a.reason === 'rule' && a.rule_id === 5));
});

test('a pooled rule with a full pool falls through to round-robin, then unassigned', () => {
  const rule = { id: 5, strategy: 'round_robin', pool: [10] };
  const plan = planAssignment({ leads: mkLeads(2, () => ({ rule })), options: { use_rules: true, round_robin: { enabled: true, user_ids: [1] } }, deps: deps({ 10: 50 }, 50) });
  assert.deepEqual(count(plan), { 1: 2 });
  const plan2 = planAssignment({ leads: mkLeads(1, () => ({ rule })), options: { use_rules: true }, deps: deps({ 10: 50 }, 50) });
  assert.equal(plan2.assignments[0].user_id, null);
});

test('summary totals add up', () => {
  const plan = planAssignment({ leads: mkLeads(7), options: { round_robin: { enabled: true, user_ids: [1, 2] } }, deps: deps() });
  const sum = Object.values(plan.summary.byUser).reduce((a, b) => a + b, 0);
  assert.equal(sum + plan.summary.unassigned, 7);
  assert.equal(plan.summary.total, 7);
});

test('round-robin with no users listed behaves as disabled', () => {
  const plan = planAssignment({ leads: mkLeads(2), options: { round_robin: { enabled: true, user_ids: [] } }, deps: deps() });
  assert.equal(plan.summary.unassigned, 2);
});

test('already-owned leads are kept: round-robin skips them and spends no capacity', () => {
  const leads = mkLeads(4, (i) => ({ existing_owned: i < 2 }));
  const plan = planAssignment({ leads, options: { round_robin: { enabled: true, user_ids: [1, 2] } }, deps: deps() });
  assert.deepEqual(plan.assignments.slice(0, 2).map(a => a.reason), ['kept', 'kept']);
  assert.deepEqual(count(plan), { 1: 1, 2: 1 });
  assert.equal(plan.summary.unassigned, 0);
  assert.equal(plan.summary.byReason.kept, 2);
});

test('an explicit choice still moves an owned lead', () => {
  const leads = mkLeads(1, () => ({ existing_owned: true, file_user_id: 4 }));
  const plan = planAssignment({ leads, options: { use_file_column: true }, deps: deps() });
  assert.deepEqual(count(plan), { 4: 1 });
});

test('kept leads never appear in by_user', () => {
  const plan = planAssignment({ leads: mkLeads(3, () => ({ existing_owned: true })), options: { round_robin: { enabled: true, user_ids: [1] } }, deps: deps() });
  assert.deepEqual(plan.summary.byUser, {});
  assert.equal(plan.summary.unassigned, 0);
});
