'use strict';

const { Router } = require('express');
const CallController = require('../controllers/CallController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');
const recordingUploadMw = require('../middleware/recordingUpload');

const router = Router();
const h = asyncHandler;

// ── call log ──
// Ingestion (the Android app posts here with an agent token) is NOT page-guarded:
// hiding the Call Logs tab from an agent must never stop their phone syncing.
router.post('/api/calls', authMW, h(CallController.create));
router.post('/api/calls/batch', authMW, h(CallController.batch));
// "Missing call details": the phone re-sends names / SIM for calls it already uploaded; only blanks are filled in.
router.post('/api/calls/backfill', authMW, h(CallController.backfill));
router.get('/api/calls', authMW, requirePage('calls', 'view'), h(CallController.list));
router.get('/api/calls/stats', authMW, requirePage('dashboard', 'view'), h(CallController.stats));
router.put('/api/calls/:callId/pin', authMW, requirePage('calls', 'update'), h(CallController.pin));
router.put('/api/calls/:callId/notes', authMW, requirePage('calls', 'update'), h(CallController.notes));

// ── recordings ──
// Upload is ingestion too (the phone attaches the audio file), so it is only authenticated.
router.post('/api/calls/:callId/recordings', authMW, recordingUploadMw, h(CallController.uploadRecording));
router.get('/api/calls/:callId/recordings', authMW, requirePage('recordings', 'view'), h(CallController.listRecordings));
router.get('/api/calls/:callId/recordings/:recId/file', authMW, requirePage('recordings', 'view'), h(CallController.recordingFile));
router.delete('/api/recordings/:recId', authMW, requirePage('recordings', 'delete'), h(CallController.deleteRecording));
router.get('/api/recordings', authMW, requirePage('recordings', 'view'), h(CallController.allRecordings));

module.exports = router;
