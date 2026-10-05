'use strict';

const crypto = require('crypto');
const { Router } = require('express');
const PaymentController = require('../controllers/PaymentController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');
const jobs = require('../jobs');
const { AppError, ValidationError } = require('../exceptions');

const router = Router();
const h = asyncHandler;

// ── paying for a plan (Stripe Checkout) ──
router.post('/api/plan/checkout', authMW, requirePage('plans', 'update', 'Admin only'), h(PaymentController.checkout));
router.post('/api/plan/confirm', authMW, requirePage('plans', 'view'), h(PaymentController.confirm));
router.get('/api/plan/payments', authMW, requirePage('plans', 'update', 'Admin only'), h(PaymentController.payments));
// Stripe calls this itself; the signature is the authentication. The body arrives raw (see app.js).
router.post('/api/plan/stripe/webhook', h(PaymentController.webhook));
// Where the browser lands after Stripe — public, and confirmed with Stripe rather than trusted.
router.get('/pay/success', h(PaymentController.success));
router.get('/pay/cancel', h(PaymentController.cancel));

// ── phones that receive push notifications ──
router.post('/api/push/tokens', authMW, h(PaymentController.registerPush));
router.delete('/api/push/tokens', authMW, h(PaymentController.unregisterPush));
router.post('/api/push/test', authMW, h(PaymentController.testPush));

// ── scheduled jobs, started from outside (the shared Trigger.dev project lives in the medivoy.api repo) ──
function sameSecret(given, wanted) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(String(wanted)).digest();
  return crypto.timingSafeEqual(a, b);
}

router.post('/api/internal/jobs/:name', h(async (req, res) => {
  const secret = process.env.INTERNAL_JOBS_SECRET;
  if (!secret) throw new AppError(503, 'Scheduled jobs are not enabled on this server');
  if (!sameSecret(req.get('x-internal-secret'), secret)) throw new AppError(401, 'Bad secret');
  const job = ['hourly', 'daily'].includes(req.params.name) ? jobs[req.params.name] : null;
  if (!job) throw new ValidationError('unknown job — use hourly or daily');
  const started = Date.now();
  const results = await job();
  res.json({ job: req.params.name, ms: Date.now() - started, results });
}));

module.exports = router;
