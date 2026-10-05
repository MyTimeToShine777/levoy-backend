'use strict';

const express = require('express');
const path = require('path');
const SystemController = require('../controllers/SystemController');
const { UPLOADS_DIR } = require('../config/upload');

const router = express.Router();

router.get('/health', SystemController.health);
router.get('/', SystemController.root);
router.get('/api', SystemController.api);

// Avatars are the ONLY uploads served statically: they render inside other users'
// rows. Everything else under /uploads (recordings, exports) is refused — those
// are served by authenticated endpoints.
// With R2 the avatar may not be on this server's disk: fetch it into the cache first, then let static serve it.
router.get('/uploads/avatars/:name', (req, res, next) => {
  if (!/^[\w.-]{3,120}$/.test(req.params.name)) return next();
  require('../services/StorageService').ensureLocal('/uploads/avatars/' + req.params.name).then(() => next(), () => next());
});
router.use('/uploads/avatars', express.static(path.join(UPLOADS_DIR, 'avatars'), {
  fallthrough: false, index: false, dotfiles: 'ignore', maxAge: '7d',
}));
router.use('/uploads', SystemController.uploadsDisabled);

module.exports = router;
