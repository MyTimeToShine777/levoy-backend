'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AssignmentRuleService = require('../src/services/AssignmentRuleService');

const rule = conditions => ({ conditions });
const lead = { source: 'Instagram', status: 'new', priority: 'normal', segment: 'Social Media Campaign', locality: 'Andheri' };
const match = (conditions, l = lead) => AssignmentRuleService.matchRuleConditions(rule(conditions), l, new Set());

test('rules can match by campaign segment (case-insensitive)', () => {
  assert.equal(match({ segment: ['social media campaign'] }).matched, true);
  assert.equal(match({ segment: ['Cold Call', 'WhatsApp Campaign'] }).matched, false);
  assert.deepEqual(match({ segment: ['Cold Call'] }).failed_on, ['segment']);
});

test('rules can match by locality', () => {
  assert.equal(match({ locality: ['Andheri', 'Dadar'] }).matched, true);
  assert.equal(match({ locality: ['Colaba'] }).matched, false);
});

test('conditions combine with AND', () => {
  assert.equal(match({ segment: ['Social Media Campaign'], locality: ['Andheri'], source: ['Instagram'] }).matched, true);
  assert.equal(match({ segment: ['Social Media Campaign'], locality: ['Colaba'] }).matched, false);
});

test('a lead with no segment never matches a segment rule', () => {
  assert.equal(match({ segment: ['Cold Call'] }, { ...lead, segment: null }).matched, false);
});

test('no conditions matches everything', () => {
  assert.equal(match({}).matched, true);
});
