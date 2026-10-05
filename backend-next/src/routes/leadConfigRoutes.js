'use strict';

const { Router } = require('express');
const LeadConfigController = require('../controllers/LeadConfigController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');

const router = Router();
const h = asyncHandler;

// Scoring configuration (the sheet's Settings tab). Reads need the Settings page;
// writes are admin-only (the handler enforces it; the guard keeps the message).
const readCfg = [authMW, requirePage('settings', 'view')];
const writeCfg = [authMW, requirePage('lead-rules', 'update', 'Admin only')];

router.get('/api/leads/status-rules', ...readCfg, h(LeadConfigController.statusRules));
router.post('/api/leads/status-rules', ...writeCfg, h(LeadConfigController.saveStatusRule));
router.delete('/api/leads/status-rules/:statusKey', ...writeCfg, h(LeadConfigController.deleteStatusRule));
router.get('/api/leads/scoring-settings', ...readCfg, h(LeadConfigController.getScoringSettings));
router.put('/api/leads/scoring-settings', ...writeCfg, h(LeadConfigController.putScoringSettings));

// Telecaller name map: which spreadsheet name is which user.
router.get('/api/leads/telecaller-map', authMW, requirePage('leads', 'view'), h(LeadConfigController.telecallerMap));
router.post('/api/leads/telecaller-map', authMW, requirePage('leads', 'assign'), h(LeadConfigController.bindTelecaller));

module.exports = router;
