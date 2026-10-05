'use strict';

// Lead assignment constants.
// OPEN_LEAD_STATUSES: a lead in any of these still needs work, so it counts
// against an agent's "open" load for balancing. 'won' and 'lost' are closed.
const OPEN_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];
// Capacity guard for round_robin: an agent at/over this many open leads is
// skipped rather than being handed more work.
const ASSIGNMENT_CAPACITY = 50;

// QA scorecard weights. Total 100. Each category is scored 1-5.
const QA_WEIGHTS = {
  Opening: 10,
  Discovery: 20,
  Resolution: 30,
  Communication: 20,
  Compliance: 10,
  Closing: 10,
};

module.exports = { OPEN_LEAD_STATUSES, ASSIGNMENT_CAPACITY, QA_WEIGHTS };
