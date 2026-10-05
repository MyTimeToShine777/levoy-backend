'use strict';

const AssignmentService = require('../services/AssignmentService');
const AssignmentRuleService = require('../services/AssignmentRuleService');
const { ctxOf } = require('../utils/audit');
const { requireManager } = require('../middleware/requireRole');

// Every route in this controller that mutates assignment is admin+manager only.
// Agents keep read access to the leads they may see but can never hand work to
// someone else.
class AssignmentController {
  assign = async (req, res) => {
    requireManager(req);
    res.json(await AssignmentService.assign(ctxOf(req), req.params.leadId, req.body));
  };

  listAssignees = async (req, res) => res.json(await AssignmentService.listAssignees(ctxOf(req), req.params.leadId));

  removeAssignee = async (req, res) => {
    requireManager(req);
    res.json(await AssignmentService.removeAssignee(ctxOf(req), req.params.leadId, req.params.userId));
  };

  history = async (req, res) => res.json(await AssignmentService.history(ctxOf(req), req.params.leadId));

  bulkAssign = async (req, res) => {
    requireManager(req);
    res.json(await AssignmentService.bulkAssign(ctxOf(req), req.body));
  };

  bulkUnassign = async (req, res) => {
    requireManager(req);
    res.json(await AssignmentService.bulkUnassign(ctxOf(req), req.body));
  };

  unassignedSummary = async (req, res) => {
    requireManager(req);
    res.json(await AssignmentService.unassignedSummary());
  };

  workload = async (req, res) => {
    requireManager(req);
    res.json(await AssignmentService.workload(ctxOf(req)));
  };

  // ── assignment rules ──
  listRules = async (req, res) => res.json(await AssignmentRuleService.list());

  createRule = async (req, res) => {
    requireManager(req);
    res.status(201).json(await AssignmentRuleService.create(ctxOf(req), req.body));
  };

  updateRule = async (req, res) => {
    requireManager(req);
    res.json(await AssignmentRuleService.update(ctxOf(req), req.params.id, req.body));
  };

  deleteRule = async (req, res) => {
    requireManager(req);
    res.json(await AssignmentRuleService.remove(ctxOf(req), req.params.id));
  };

  autoAssign = async (req, res) => {
    requireManager(req);
    res.json(await AssignmentRuleService.autoAssign(ctxOf(req), req.params.leadId));
  };

  bulkAutoAssign = async (req, res) => {
    requireManager(req);
    res.json(await AssignmentRuleService.bulkAutoAssign(ctxOf(req), req.body));
  };
}

module.exports = new AssignmentController();
