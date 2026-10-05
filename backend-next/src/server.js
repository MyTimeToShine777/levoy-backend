'use strict';

const { pool } = require('./config/db');
const { PORT, HOST } = require('./config/env');
const { initDB } = require('./db/init');
const { createApp } = require('./app');

const app = createApp();

initDB().then(() => {
  app.listen(PORT, HOST, () => console.log(`API running on http://${HOST}:${PORT}`));
  require('./services/PushService').startListener();                  // no-op unless Firebase is configured
  if (String(process.env.ENABLE_SCHEDULER || '').toLowerCase() === 'true') require('./jobs/scheduler').start();
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });

process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });
process.on('SIGINT', async () => { await pool.end(); process.exit(0); });
