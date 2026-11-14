'use strict';

const { AppError } = require('../exceptions');

// Central error formatter. Every error the API returns has the shape
// `{ detail: string, ...extra }`, which is the contract the web and Android
// clients already rely on.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.status).json({ detail: err.detail, ...(err.extra || {}) });
  }
  // The phone lost signal in the middle of an upload. Nobody is left to read a reply and nothing is wrong on the server,
  // so do not log it as an error (it hides the real ones). The app sends the file again on its next sync.
  if (err && err.message === 'Request aborted') return res.status(400).json({ detail: 'Upload was cancelled' });
  // multer (upload size / field limits) is a client error, not a server fault
  if (err && err.name === 'MulterError') return res.status(400).json({ detail: err.message });
  // body-parser errors carry their own status
  if (err && err.status && err.status >= 400 && err.status < 500 && err.message) {
    return res.status(err.status).json({ detail: err.message });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ detail: 'Error' });
}

module.exports = errorHandler;
