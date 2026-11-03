'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const AuthController = require('../controllers/AuthController');
const asyncHandler = require('../middleware/asyncHandler');
const { sessionMW } = require('../middleware/platformAuth');
const rateLimit = require('../middleware/rateLimit');
const { clientIp } = require('../utils/audit');

const router = Router();

// ─── Sign-in by emailed code (OTP) ───
// Codes are generated, emailed and checked by medivoy.api. These budgets sit in
// front of it: per-IP stops one host spraying many addresses, per-email stops
// rotating IPs from hammering a single account (guessing or mail-bombing).
// Test harnesses sign in dozens of times from one address; RATE_LIMIT_SCALE
// (default 1) multiplies every budget below so they are not tripped.
const SCALE = Math.max(1, parseInt(process.env.RATE_LIMIT_SCALE) || 1);
const ipKey = (name, req) => `${name}:ip:${clientIp(req) || 'unknown'}`;
const emailKey = (name, req) => `${name}:email:${String((req.body && req.body.email) || '').toLowerCase().trim()}`;

const sendIpLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20 * SCALE, keyFn: req => ipKey('otp-send', req),
  message: 'Too many code requests from this network. Try again later.',
});
const sendEmailLimit = rateLimit({
  windowMs: 60 * 60 * 1000, max: 6 * SCALE, keyFn: req => emailKey('otp-send', req),
  message: 'Too many code requests for this email address. Try again later.',
});
const verifyIpLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 40 * SCALE, keyFn: req => ipKey('otp-verify', req),
  message: 'Too many attempts from this network. Try again later.',
});
const verifyEmailLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10 * SCALE, keyFn: req => emailKey('otp-verify', req),
  message: 'Too many incorrect codes for this email address. Try again later.',
});

// A phone refreshes about once an hour, so this is generous; it only stops a host from guessing keys.
const refreshIpLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 120 * SCALE, keyFn: req => ipKey('refresh', req),
  message: 'Too many sign-in refreshes from this network. Try again later.',
});

const emailRule = body('email').trim().isEmail();

router.get('/api/auth/registration-status', asyncHandler(AuthController.registrationStatus));

router.post('/api/auth/send-otp', [emailRule, sendIpLimit, sendEmailLimit], asyncHandler(AuthController.sendOtp));

router.post('/api/auth/verify-otp', [
  emailRule, body('otp').isString().matches(/^\d{6}$/), verifyIpLimit, verifyEmailLimit,
], asyncHandler(AuthController.verifyOtp));

// Swap a refresh key for a new access token + a new refresh key. Public: the key itself is the proof.
router.post('/api/auth/refresh', [refreshIpLimit], asyncHandler(AuthController.refresh));
router.post('/api/auth/logout', [refreshIpLimit], asyncHandler(AuthController.logout));

// Invite acceptance creates the account only; the person then signs in with a code.
router.post('/api/auth/accept-invite', [
  body('token').notEmpty(), body('name').trim().notEmpty(),
], asyncHandler(AuthController.acceptInvite));

router.get('/api/auth/me', sessionMW, asyncHandler(AuthController.me));

module.exports = router;
