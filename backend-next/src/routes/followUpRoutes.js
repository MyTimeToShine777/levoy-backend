'use strict';

const { Router } = require('express');
const FollowUpController = require('../controllers/FollowUpController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');

const router = Router();
const h = asyncHandler;

router.post('/api/leads/:leadId/follow-ups', authMW, requirePage('follow-ups', 'create'), h(FollowUpController.create));
router.get('/api/leads/:leadId/follow-ups', authMW, requirePage('leads', 'view'), h(FollowUpController.listForLead));
router.patch('/api/follow-ups/:fuId', authMW, requirePage('follow-ups', 'update'), h(FollowUpController.patch));
router.get('/api/follow-ups/due', authMW, requirePage('follow-ups', 'view'), h(FollowUpController.due));

module.exports = router;
