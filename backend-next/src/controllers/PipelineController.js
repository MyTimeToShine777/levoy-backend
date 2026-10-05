'use strict';

const PipelineStageService = require('../services/PipelineStageService');
const { ctxOf } = require('../utils/audit');
const { requireManager } = require('../middleware/requireRole');

class PipelineController {
  listStages = async (req, res) => res.json(await PipelineStageService.list());

  createStage = async (req, res) => {
    requireManager(req);
    res.status(201).json(await PipelineStageService.create(ctxOf(req), req.body));
  };

  updateStage = async (req, res) => {
    requireManager(req);
    res.json(await PipelineStageService.update(ctxOf(req), req.params.id, req.body));
  };

  reorderStages = async (req, res) => {
    requireManager(req);
    res.json(await PipelineStageService.reorder(ctxOf(req), req.body));
  };

  deleteStage = async (req, res) => {
    requireManager(req);
    res.json(await PipelineStageService.remove(ctxOf(req), req.params.id, req.query));
  };

  board = async (req, res) => res.json(await PipelineStageService.board(ctxOf(req)));
}

module.exports = new PipelineController();
