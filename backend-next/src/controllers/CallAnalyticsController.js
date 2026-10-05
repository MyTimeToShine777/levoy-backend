'use strict';

const CallAnalyticsService = require('../services/CallAnalyticsService');
const WorkspaceSettingsService = require('../services/WorkspaceSettingsService');
const PlanService = require('../services/PlanService');
const { ctxOf } = require('../utils/audit');

// Call analytics, the workspace numbers behind them (billing, idle gap) and the subscription plan.
class CallAnalyticsController {
  summary = async (req, res) => res.json(await CallAnalyticsService.summary(ctxOf(req), req.query));

  analysis = async (req, res) => res.json(await CallAnalyticsService.analysis(ctxOf(req), req.query));

  // ── workspace settings ──
  getSettings = async (req, res) => res.json(await WorkspaceSettingsService.all());

  putSettings = async (req, res) => res.json(await WorkspaceSettingsService.update(ctxOf(req), req.body));

  // ── plan ──
  plan = async (req, res) => res.json({ ...(await PlanService.current()), catalog: await PlanService.catalog() });

  startTrial = async (req, res) => res.json(await PlanService.startTrial(ctxOf(req), (req.body || {}).plan));

  activatePlan = async (req, res) => res.json(await PlanService.activate(ctxOf(req), req.body || {}));
}

module.exports = new CallAnalyticsController();
