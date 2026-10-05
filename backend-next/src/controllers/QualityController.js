'use strict';

const QualityService = require('../services/QualityService');
const { ctxOf } = require('../utils/audit');
const { requireManager } = require('../middleware/requireRole');

class QualityController {
  createReview = async (req, res) => {
    requireManager(req);
    res.status(201).json(await QualityService.createReview(ctxOf(req), req.params.callId, req.body));
  };

  getReview = async (req, res) => res.json(await QualityService.getReview(ctxOf(req), req.params.reviewId));

  performance = async (req, res) => {
    requireManager(req);
    res.json(await QualityService.performance(ctxOf(req)));
  };

  agentQuality = async (req, res) => res.json(await QualityService.agentQuality(ctxOf(req), req.params.agentId));

  leaderboard = async (req, res) => {
    requireManager(req);
    res.json(await QualityService.leaderboard(ctxOf(req)));
  };
}

module.exports = new QualityController();
