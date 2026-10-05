'use strict';

const { Router } = require('express');
const LeadImportController = require('../controllers/LeadImportController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');
const { csvUpload } = require('../config/upload');

const router = Router();
const h = asyncHandler;
const canImport = [authMW, requirePage('leads', 'import')];
const canView = [authMW, requirePage('leads', 'view')];

// CSV / Excel lead upload: preview (parse + map) -> plan (dry-run assignment) -> commit.
// Registered BEFORE the /api/leads/:leadId routes so "import" is never read as an id.
router.post('/api/leads/import/preview', ...canImport, csvUpload.single('file'), h(LeadImportController.preview));
router.post('/api/leads/import/plan', ...canImport, h(LeadImportController.plan));
router.post('/api/leads/import/commit', ...canImport, csvUpload.single('file'), h(LeadImportController.commit));
router.get('/api/leads/import/batches', ...canImport, h(LeadImportController.batches));
router.get('/api/leads/import/batches/:id', ...canImport, h(LeadImportController.batch));
router.post('/api/leads/import', ...canImport, csvUpload.single('file'), h(LeadImportController.simpleCsv));

router.get('/api/leads/enrichment/preview', ...canView, h(LeadImportController.enrichmentPreview));
router.post('/api/leads/enrichment/apply', ...canImport, h(LeadImportController.enrichmentApply));

module.exports = router;
