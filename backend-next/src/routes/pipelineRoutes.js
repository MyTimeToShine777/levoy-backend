'use strict';

const { Router } = require('express');
const PipelineController = require('../controllers/PipelineController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');

const router = Router();
const h = asyncHandler;
const view = [authMW, requirePage('pipeline', 'view')];
const edit = [authMW, requirePage('pipeline', 'update')];

router.get('/api/pipeline/stages', ...view, h(PipelineController.listStages));
router.post('/api/pipeline/stages', ...edit, h(PipelineController.createStage));
// "reorder" is PUT-only, so it cannot be shadowed by PATCH/DELETE /:id.
router.put('/api/pipeline/stages/reorder', ...edit, h(PipelineController.reorderStages));
router.patch('/api/pipeline/stages/:id', ...edit, h(PipelineController.updateStage));
router.delete('/api/pipeline/stages/:id', ...edit, h(PipelineController.deleteStage));

// Registered before GET /api/leads/:leadId (see leadRoutes) so "pipeline" is not an id.
router.get('/api/leads/pipeline', ...view, h(PipelineController.board));

module.exports = router;
