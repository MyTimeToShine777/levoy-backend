'use strict';

const { Router } = require('express');
const LeadAnalyticsController = require('../controllers/LeadAnalyticsController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');

const router = Router();
const h = asyncHandler;

// Each report is its own page in the sidebar, so each is guarded by that page.
router.get('/api/analytics/command-center', authMW, requirePage('command-center', 'view'), h(LeadAnalyticsController.commandCenter));
router.get('/api/analytics/daily-report', authMW, requirePage('daily-report', 'view'), h(LeadAnalyticsController.dailyReport));
router.get('/api/analytics/area-analysis', authMW, requirePage('area-analysis', 'view'), h(LeadAnalyticsController.areaAnalysis));
router.get('/api/leads/call-queue', authMW, requirePage('call-queue', 'view'), h(LeadAnalyticsController.callQueue));

module.exports = router;
