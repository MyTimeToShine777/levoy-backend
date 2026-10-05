'use strict';

const { Router } = require('express');
const LeadController = require('../controllers/LeadController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');

const router = Router();
const h = asyncHandler;
const view = [authMW, requirePage('leads', 'view')];
const create = [authMW, requirePage('leads', 'create')];
const update = [authMW, requirePage('leads', 'update')];
const del = [authMW, requirePage('leads', 'delete')];

// ── collection ──
router.post('/api/leads', ...create, h(LeadController.create));
router.get('/api/leads', ...view, h(LeadController.list));
// Literal: must come before GET /api/leads/:leadId.
router.get('/api/leads/summary', ...view, h(LeadController.summary));
router.post('/api/leads/bulk-status', ...update, h(LeadController.bulkStatus));

// ── tags (the shared vocabulary) ──
router.get('/api/tags', ...view, h(LeadController.listTags));
router.post('/api/tags', ...update, h(LeadController.createTag));
router.delete('/api/tags/:tagId', ...update, h(LeadController.deleteTag));

// ── one lead ──
router.get('/api/leads/:leadId/timeline', ...view, h(LeadController.timeline));
router.post('/api/leads/:leadId/activities', ...update, h(LeadController.addActivity));
router.get('/api/leads/:leadId/tags', ...view, h(LeadController.leadTags));
router.put('/api/leads/:leadId/tags', ...update, h(LeadController.setLeadTags));
router.get('/api/leads/:leadId/duplicates', ...view, h(LeadController.duplicates));
router.post('/api/leads/:leadId/merge', ...update, h(LeadController.merge));
router.post('/api/leads/:leadId/contact', ...update, h(LeadController.contact));
router.get('/api/leads/:leadId', ...view, h(LeadController.get));
router.put('/api/leads/:leadId', ...update, h(LeadController.update));
router.delete('/api/leads/:leadId', ...del, h(LeadController.remove));

module.exports = router;
