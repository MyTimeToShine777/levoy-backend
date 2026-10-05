'use strict';

const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const mountRoutes = require('./routes');

function createApp() {
  const app = express();
  app.use(cors());
  // A restored backup is a whole call log, far beyond the 100 kB default; only that one path gets the larger limit.
  const standard = express.json();
  const backupSized = express.json({ limit: '25mb' });
  const raw = express.raw({ type: 'application/json', limit: '1mb' });
  app.use((req, res, next) => (req.path === '/api/plan/stripe/webhook' ? raw : req.path === '/api/call-exports/restore' ? backupSized : standard)(req, res, next));

  mountRoutes(app);

  app.use(notFound);        // unknown route -> JSON 404 (not Express's HTML page)
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
