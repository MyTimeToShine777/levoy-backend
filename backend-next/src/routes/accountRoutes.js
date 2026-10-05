'use strict';

const { Router } = require('express');
const AccountController = require('../controllers/AccountController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');
const { upload } = require('../config/upload');

const router = Router();
const h = asyncHandler;

// ── profile + settings (always the caller's own) ──
router.get('/api/users/me', authMW, h(AccountController.me));
router.put('/api/users/me', authMW, h(AccountController.updateMe));
router.post('/api/users/me/avatar', authMW, upload.single('avatar'), h(AccountController.avatar));
router.get('/api/users/me/consent', authMW, h(AccountController.consent));
router.post('/api/users/me/consent', authMW, h(AccountController.acceptConsent));
// Body must carry {email} equal to the account's own address (type-to-confirm); refused for the last admin or anyone who still owns leads.
router.delete('/api/users/me', authMW, h(AccountController.deleteMe));
router.get('/api/user-settings', authMW, h(AccountController.getSettings));
router.put('/api/user-settings', authMW, h(AccountController.putSettings));

// ── WhatsApp templates ──
router.get('/api/whatsapp-templates', authMW, h(AccountController.listTemplates));
router.post('/api/whatsapp-templates', authMW, h(AccountController.createTemplate));
router.put('/api/whatsapp-templates/:tmplId', authMW, h(AccountController.updateTemplate));
router.delete('/api/whatsapp-templates/:tmplId', authMW, h(AccountController.deleteTemplate));

// ── notifications ──
router.get('/api/notifications', authMW, h(AccountController.listNotifications));
// "read-all" is declared before "/:notifId/read" so it can never be read as an id.
router.put('/api/notifications/read-all', authMW, h(AccountController.readAllNotifications));
router.put('/api/notifications/:notifId/read', authMW, h(AccountController.readNotification));
router.delete('/api/notifications/:notifId', authMW, h(AccountController.deleteNotification));

// ── reports ──
router.get('/api/reports/daily', authMW, requirePage('reports', 'view'), h(AccountController.dailyReport));
router.post('/api/reports/generate-email', authMW, requirePage('reports', 'view'), h(AccountController.generateEmailReport));

// ── exports ──
router.post('/api/exports', authMW, requirePage('exports', 'create'), h(AccountController.createExport));
router.get('/api/exports', authMW, requirePage('exports', 'view'), h(AccountController.listExports));
router.get('/api/exports/:expId/file', authMW, requirePage('exports', 'view'), h(AccountController.exportFile));
// Whoever may create exports may remove their own.
router.delete('/api/exports/:expId', authMW, requirePage('exports', 'create'), h(AccountController.deleteExport));

// ── team dashboard (membership is checked in the service) ──
router.get('/api/teams/:teamId/analytics', authMW, h(AccountController.teamAnalytics));

module.exports = router;
