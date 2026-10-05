'use strict';

const LeadImportService = require('../services/LeadImportService');
const LeadScoringService = require('../services/LeadScoringService');
const { ctxOf } = require('../utils/audit');
const { requireManager } = require('../middleware/requireRole');

class LeadImportController {
  // Phase 1: parse the file (CSV or Excel), detect the source profile, propose a mapping.
  preview = async (req, res) => res.json(await LeadImportService.preview(ctxOf(req), req.file, req.body || {}));

  // Dry run of the whole decision (dedupe + assignment chain) for a live preview.
  plan = async (req, res) => res.json(await LeadImportService.plan(ctxOf(req), req.body || {}));

  // Phase 2: write everything in one transaction.
  commit = async (req, res) => res.json(await LeadImportService.commit(ctxOf(req), req.file, req.body || {}));

  // The original name/phone/email CSV importer.
  simpleCsv = async (req, res) => res.json(await LeadImportService.simpleCsv(ctxOf(req), req.file));

  batches = async (req, res) => res.json(await LeadImportService.batches(ctxOf(req), req.query));

  batch = async (req, res) => res.json(await LeadImportService.batch(ctxOf(req), req.params.id));

  // ── enrichment ──
  enrichmentPreview = async (req, res) => res.json(await LeadScoringService.enrichmentPreview(ctxOf(req), req.query));

  enrichmentApply = async (req, res) => {
    requireManager(req);
    res.json(await LeadScoringService.enrichmentApply(ctxOf(req), req.body));
  };
}

module.exports = new LeadImportController();
