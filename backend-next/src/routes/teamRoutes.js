'use strict';

const { Router } = require('express');
const TeamController = require('../controllers/TeamController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');

const router = Router();
const h = asyncHandler;

router.post('/api/teams', authMW, h(TeamController.create));
router.get('/api/teams', authMW, h(TeamController.list));
router.post('/api/teams/:teamId/members', authMW, h(TeamController.addMember));
router.delete('/api/teams/:teamId/members/:userId', authMW, h(TeamController.removeMember));

module.exports = router;
