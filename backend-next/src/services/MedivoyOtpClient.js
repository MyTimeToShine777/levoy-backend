'use strict';

/* global AbortSignal */

const { MEDIVOY_API_BASE_URL, MEDIVOY_API_TIMEOUT_MS } = require('../config/env');
const { AppError, ValidationError } = require('../exceptions');

// Thin client for medivoy.api's email-OTP endpoints — the same two the pharmacy
// API proxies (/api/auth/send-otp and /api/auth/verify-otp). Medivoy generates the
// code, emails it and checks it; this class only relays and translates errors.

async function post(path, body) {
  if (!MEDIVOY_API_BASE_URL) throw new AppError(503, 'Sign-in service is not configured');
  let res;
  try {
    res = await fetch(`${MEDIVOY_API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MEDIVOY_API_TIMEOUT_MS),
    });
  } catch (e) {
    console.error(`Medivoy OTP request failed (${path}): ${e.message}`);
    throw new AppError(502, 'Could not reach the sign-in service. Try again in a moment.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, data };
}

// Pull a human message out of whatever shape the upstream error used.
const messageOf = d => (d && (d.message || d.error || (d.error && d.error.message))) || null;

// The verified address, if the upstream echoes one back.
const emailOf = d => {
  const x = d && (d.data || d);
  const u = x && (x.user || x);
  return u && typeof u.email === 'string' ? u.email.toLowerCase().trim() : null;
};

class MedivoyOtpClient {
  async send(email) {
    const { status, data } = await post('/api/auth/send-otp', { email });
    if (status === 429) throw new AppError(429, 'Too many code requests. Please wait a minute and try again.');
    if (status >= 500) throw new AppError(502, 'The sign-in service had a problem. Try again in a moment.');
    // Any 4xx other than rate-limit means Medivoy refused this address. Do not
    // leak that to the caller (it would reveal which emails are real) — log only.
    if (status >= 400) console.error(`Medivoy send-otp refused (${status}): ${messageOf(data) || ''}`);
    return { ok: status < 400 };
  }

  /** @returns {{ email: string|null }} resolves only when the code is correct. */
  async verify(email, otp) {
    const { status, data } = await post('/api/auth/verify-otp', { email, otp });
    if (status === 429) throw new AppError(429, 'Too many attempts. Please wait a minute and try again.');
    if (status >= 500) throw new AppError(502, 'The sign-in service had a problem. Try again in a moment.');
    const ok = status >= 200 && status < 300 && !(data && data.success === false);
    if (!ok) throw new ValidationError('That code is incorrect or has expired. Request a new one.');
    return { email: emailOf(data) };
  }
}

module.exports = new MedivoyOtpClient();
