'use strict';

const LeadAnalyticsService = require('../services/LeadAnalyticsService');
const { ctxOf } = require('../utils/audit');

class LeadAnalyticsController {
  commandCenter = async (req, res) => res.json(await LeadAnalyticsService.commandCenter(ctxOf(req)));

  dailyReport = async (req, res) => res.json(await LeadAnalyticsService.dailyReport(ctxOf(req)));

  areaAnalysis = async (req, res) => res.json(await LeadAnalyticsService.areaAnalysis(ctxOf(req)));

  callQueue = async (req, res) => res.json(await LeadAnalyticsService.callQueue(ctxOf(req), req.query));
}

module.exports = new LeadAnalyticsController();
