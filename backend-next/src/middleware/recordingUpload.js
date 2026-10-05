'use strict';

const { recordingUpload, RECORDING_MAX_BYTES, ALLOWED_RECORDING_MIME } = require('../config/upload');

// Multer errors (bad mime, oversize) arrive as thrown errors, not responses. This
// adapter turns them into the right status so an upload rejection is a 400 the
// client can display rather than an opaque 500.
function recordingUploadMw(req, res, next) {
  recordingUpload.single('recording')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ detail: `Recording too large. Maximum size is ${Math.floor(RECORDING_MAX_BYTES / (1024 * 1024))} MB.`, max_bytes: RECORDING_MAX_BYTES });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ detail: 'Unexpected file field. Use the "recording" field.' });
    }
    if (err.code === 'BAD_MIME') {
      return res.status(400).json({ detail: 'Unsupported audio format. Allowed: m4a, amr, 3gp, ogg, wav, mp3.', allowed_mime: [...ALLOWED_RECORDING_MIME] });
    }
    return next(err);
  });
}

module.exports = recordingUploadMw;
