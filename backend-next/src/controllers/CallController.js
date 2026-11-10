'use strict';

const CallService = require('../services/CallService');
const RecordingService = require('../services/RecordingService');
const { ctxOf } = require('../utils/audit');

class CallController {
  create = async (req, res) => res.status(201).json(await CallService.create(ctxOf(req), req.body));

  batch = async (req, res) => res.json(await CallService.batch(ctxOf(req), req.body));

  backfill = async (req, res) => res.json(await CallService.backfill(ctxOf(req), req.body));

  list = async (req, res) => res.json(await CallService.list(ctxOf(req), req.query));

  stats = async (req, res) => res.json(await CallService.stats(ctxOf(req), req.query));

  pin = async (req, res) => res.json(await CallService.setPin(ctxOf(req), req.params.callId, req.body, req.query));

  notes = async (req, res) => res.json(await CallService.setNotes(ctxOf(req), req.params.callId, req.body, req.query));

  // ── recordings ──
  uploadRecording = async (req, res) =>
    res.status(201).json(await RecordingService.upload(ctxOf(req), req.params.callId, req.file, req.body));

  listRecordings = async (req, res) => res.json(await RecordingService.listForCall(ctxOf(req), req.params.callId));

  // Streams the audio inline so the browser's <audio> element can play it.
  recordingFile = async (req, res) => {
    const { filePath, type } = await RecordingService.fileFor(ctxOf(req), req.params.callId, req.params.recId);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(filePath);
  };

  deleteRecording = async (req, res) => res.json(await RecordingService.remove(ctxOf(req), req.params.recId));

  allRecordings = async (req, res) => res.json(await RecordingService.listAll(ctxOf(req), req.query));
}

module.exports = new CallController();
