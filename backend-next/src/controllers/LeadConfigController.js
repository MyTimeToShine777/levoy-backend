'use strict';

const LeadScoringService = require('../services/LeadScoringService');
const TelecallerMapService = require('../services/TelecallerMapService');
const { ctxOf } = require('../utils/audit');
const { requireAdmin, requireManager } = require('../middleware/requireRole');

// Scoring configuration (the sheet's Settings tab) and the telecaller name map.
class LeadConfigController {
  statusRules = async (req, res) => res.json(await LeadScoringService.statusRules());

  saveStatusRule = async (req, res) => {
    requireAdmin(req);
    res.status(201).json(await LeadScoringService.saveStatusRule(ctxOf(req), req.body));
  };

  renameStatusRule = async (req, res) => {
    requireAdmin(req);
    res.json(await LeadScoringService.renameStatusRule(ctxOf(req), req.params.statusKey, req.body));
  };

  deleteStatusRule = async (req, res) => {
    requireAdmin(req);
    res.json(await LeadScoringService.deleteStatusRule(ctxOf(req), req.params.statusKey));
  };

  getScoringSettings = async (req, res) => res.json(await LeadScoringService.getScoringSettings());

  putScoringSettings = async (req, res) => {
    requireAdmin(req);
    res.json(await LeadScoringService.putScoringSettings(ctxOf(req), req.body));
  };

  telecallerMap = async (req, res) => res.json(await TelecallerMapService.list());

  bindTelecaller = async (req, res) => {
    requireManager(req);
    res.json(await TelecallerMapService.bind(ctxOf(req), req.body));
  };
}

module.exports = new LeadConfigController();
