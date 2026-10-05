'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// backend-next/ — stored paths such as "/uploads/recordings/x.m4a" are
// relative to this directory.
const ROOT_DIR = path.join(__dirname, '..', '..');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
['recordings', 'avatars'].forEach(d => {
  const dir = path.join(UPLOADS_DIR, d);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.uploadType || 'recordings';
    cb(null, path.join(UPLOADS_DIR, type));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

// Lead import files (CSV / xlsx) are parsed from memory and never persisted.
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Recording upload policy ───
// Recordings get their OWN multer instance: a tighter size cap and a MIME
// allowlist enforced in fileFilter, so an untrusted body is never written to
// uploads/ at all.
const RECORDING_MAX_BYTES = parseInt(process.env.RECORDING_MAX_BYTES) || 25 * 1024 * 1024;
const ALLOWED_RECORDING_MIME = new Set([
  'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/amr', 'audio/3gpp', 'audio/ogg',
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3', 'audio/webm',
]);
const MIME_EXTENSION = {
  'audio/mp4': '.m4a', 'audio/m4a': '.m4a', 'audio/x-m4a': '.m4a',
  'audio/amr': '.amr', 'audio/3gpp': '.3gp', 'audio/ogg': '.ogg',
  'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav',
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/webm': '.weba',
};
// Used when SERVING a stored file: the extension on disk decides the
// Content-Type, regardless of what the uploader's browser claimed.
const MIME_EXTENSION_REVERSE = {
  '.m4a': 'audio/mp4', '.amr': 'audio/amr', '.3gp': 'audio/3gpp',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.weba': 'audio/webm',
};

const recordingUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOADS_DIR, 'recordings')),
    // The stored name is generated, never derived from the client's filename;
    // the extension comes only from a known map.
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${MIME_EXTENSION[file.mimetype] || '.bin'}`),
  }),
  limits: { fileSize: RECORDING_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_RECORDING_MIME.has(file.mimetype)) {
      const err = new Error('Unsupported audio format');
      err.status = 400; err.code = 'BAD_MIME';
      return cb(err);
    }
    cb(null, true);
  },
});

// Resolve a stored relative path (e.g. "/uploads/recordings/x.m4a") to an
// absolute path, refusing anything that escapes the uploads tree. The leading
// slash is stripped first: path.resolve() treats an absolute second argument as
// the whole answer.
function safeUploadPath(rel) {
  const abs = path.resolve(ROOT_DIR, String(rel || '').replace(/^\/+/, ''));
  const root = path.resolve(UPLOADS_DIR) + path.sep;
  if (!abs.startsWith(root)) return null;
  return abs;
}

module.exports = {
  ROOT_DIR, UPLOADS_DIR, upload, csvUpload, recordingUpload,
  RECORDING_MAX_BYTES, ALLOWED_RECORDING_MIME, MIME_EXTENSION, MIME_EXTENSION_REVERSE,
  safeUploadPath,
};
