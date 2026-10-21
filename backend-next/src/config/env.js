'use strict';

// Environment-derived configuration. Everything that used to be a top-level
// constant at the head of server.js lives here so the rest of the code never
// reads process.env directly.

const JWT_SECRET = process.env.JWT_SECRET || 'levoy-secret-key-2024';
const JWT_EXPIRE = '24h';

// First-admin bootstrap. Only ever applied by initDB() when the users table
// contains no active admin, so restarting the server cannot resurrect or
// duplicate it. Absent the var and a no-admin database, NOTHING is created.
// Sign-in is by emailed code (OTP), so there is no bootstrap password.
const BOOTSTRAP_ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || null;

// Sign-in codes are generated, emailed and checked by medivoy.api (the same
// service the pharmacy and vendor web apps use). Callio only decides WHO may ask
// for a code, then issues its own session once medivoy confirms the code.
const MEDIVOY_API_BASE_URL = String(process.env.MEDIVOY_API_BASE_URL || '').replace(/\/+$/, '');
const MEDIVOY_API_TIMEOUT_MS = parseInt(process.env.MEDIVOY_API_TIMEOUT_MS) || 15000;
// Seconds before the same address may ask for another code.
const OTP_RESEND_SECONDS = parseInt(process.env.OTP_RESEND_SECONDS) || 60;

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

module.exports = {
  JWT_SECRET, JWT_EXPIRE, BOOTSTRAP_ADMIN_EMAIL,
  MEDIVOY_API_BASE_URL, MEDIVOY_API_TIMEOUT_MS, OTP_RESEND_SECONDS,
  PORT, HOST,
};
