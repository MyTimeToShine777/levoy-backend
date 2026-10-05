'use strict';

// Third-party credentials (R2, Firebase, Stripe, SMTP) live in backend-next/.env.integrations so they stay
// apart from the database settings. Loaded once; variables already set in the environment win.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.integrations') });

const has = (...names) => names.every(n => !!process.env[n]);

module.exports = {
  r2: () => has('R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'),
  firebase: () => has('FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY') && process.env.ENABLE_PUSH_NOTIFICATIONS !== 'false',
  // STRIPE_FAKE=1 selects the in-process test stand-in (never in production).
  stripe: () => (process.env.STRIPE_FAKE === '1' && process.env.NODE_ENV !== 'production') || has('STRIPE_SECRET_KEY'),
  smtp: () => has('SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'),
  // a PEM key kept in an env file arrives with literal "\n" (or "\<newline>"); make it a real PEM
  firebaseKey: () => String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\\r?\n/g, '\n').replace(/\\n/g, '\n'),
  // where the browser should return to / what public address pay pages use; falls back to the request's own host
  publicApiUrl: req => (process.env.PUBLIC_API_URL || (req ? `${req.protocol}://${req.get('host')}` : '')).replace(/\/$/, ''),
};
