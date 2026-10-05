'use strict';

const { Router } = require('express');
const QualityController = require('../controllers/QualityController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');

const router = Router();
const h = asyncHandler;

// Reviewing is a supervisor job. The two self-service reads (my own review, my own
// quality page) stay scoped inside the service rather than behind a page permission,
// so an agent can always see feedback about themselves.
router.post('/api/calls/:callId/reviews', authMW, requirePage('qa-review', 'create'), h(QualityController.createReview));
router.get('/api/reviews/:reviewId', authMW, h(QualityController.getReview));
router.get('/api/agents/performance', authMW, requirePage('performance', 'view'), h(QualityController.performance));
router.get('/api/agents/:agentId/quality', authMW, h(QualityController.agentQuality));
router.get('/api/quality/leaderboard', authMW, requirePage('quality', 'view'), h(QualityController.leaderboard));

module.exports = router;
