'use strict';

const { Router } = require('express');
const AssignmentController = require('../controllers/AssignmentController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');

const router = Router();
const h = asyncHandler;
const assign = [authMW, requirePage('leads', 'assign')];
const view = [authMW, requirePage('leads', 'view')];

// ── bulk + summary (literal paths) ──
router.post('/api/leads/bulk-assign', ...assign, h(AssignmentController.bulkAssign));
router.post('/api/leads/bulk-unassign', ...assign, h(AssignmentController.bulkUnassign));
router.post('/api/leads/bulk-auto-assign', ...assign, h(AssignmentController.bulkAutoAssign));
router.get('/api/leads/unassigned/summary', ...assign, h(AssignmentController.unassignedSummary));
router.get('/api/agents/workload', authMW, requirePage('team', 'view'), h(AssignmentController.workload));

// ── assignment rules ──
router.get('/api/assignment-rules', ...view, h(AssignmentController.listRules));
router.post('/api/assignment-rules', ...assign, h(AssignmentController.createRule));
router.patch('/api/assignment-rules/:id', ...assign, h(AssignmentController.updateRule));
router.delete('/api/assignment-rules/:id', ...assign, h(AssignmentController.deleteRule));

// ── per lead ──
router.post('/api/leads/:leadId/assign', ...assign, h(AssignmentController.assign));
router.get('/api/leads/:leadId/assignees', ...view, h(AssignmentController.listAssignees));
router.delete('/api/leads/:leadId/assignees/:userId', ...assign, h(AssignmentController.removeAssignee));
router.get('/api/leads/:leadId/assignments', ...view, h(AssignmentController.history));
router.post('/api/leads/:leadId/auto-assign', ...assign, h(AssignmentController.autoAssign));

module.exports = router;
