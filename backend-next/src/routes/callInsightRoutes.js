'use strict';

const { Router } = require('express');
const CallHistoryController = require('../controllers/CallHistoryController');
const CallAnalyticsController = require('../controllers/CallAnalyticsController');
const ContactController = require('../controllers/ContactController');
const DeviceController = require('../controllers/DeviceController');
const QuickCallController = require('../controllers/QuickCallController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');

const router = Router();
const h = asyncHandler;

// Premium-only features answer 402 from the service (PlanService.assert), after the RBAC page check here.

// ── call history ──
router.get('/api/call-history', authMW, requirePage('call-history', 'view'), h(CallHistoryController.list));
// literal before "/:callId/..." so "tags" is never read as an id
router.get('/api/call-history/tags', authMW, requirePage('call-history', 'view'), h(CallHistoryController.tags));
router.get('/api/call-history/people', authMW, requirePage('call-history', 'view'), h(CallHistoryController.people));
router.put('/api/call-history/:callId/annotate', authMW, requirePage('call-history', 'update'), h(CallHistoryController.annotate));

// ── missed-call reminders (always the caller's own) ──
router.get('/api/call-reminders', authMW, requirePage('call-history', 'view'), h(CallHistoryController.listReminders));
router.post('/api/call-reminders', authMW, requirePage('call-history', 'update'), h(CallHistoryController.createReminder));
router.put('/api/call-reminders/:reminderId', authMW, requirePage('call-history', 'update'), h(CallHistoryController.updateReminder));
router.delete('/api/call-reminders/:reminderId', authMW, requirePage('call-history', 'update'), h(CallHistoryController.deleteReminder));

// ── Excel reports, backup and restore ──
router.post('/api/call-exports/report', authMW, requirePage('call-history', 'export'), h(CallHistoryController.callReport));
router.post('/api/call-exports/contacts', authMW, requirePage('contacts', 'export'), h(CallHistoryController.contactReport));
router.post('/api/call-exports/working-hours', authMW, requirePage('call-analytics', 'export'), h(CallHistoryController.workingHoursReport));
router.get('/api/call-exports/backup', authMW, requirePage('call-history', 'export'), h(CallHistoryController.backup));
router.post('/api/call-exports/restore', authMW, requirePage('call-history', 'update'), h(CallHistoryController.restore));
router.get('/api/call-exports/:expId/file', authMW, requirePage('call-history', 'view'), h(CallHistoryController.exportFile));

// ── call analytics ──
router.get('/api/call-analytics/summary', authMW, requirePage('call-analytics', 'view'), h(CallAnalyticsController.summary));
router.get('/api/call-analytics/analysis', authMW, requirePage('call-analytics', 'view'), h(CallAnalyticsController.analysis));

// ── workspace settings (idle gap, billing cycle) ──
router.get('/api/workspace-settings', authMW, h(CallAnalyticsController.getSettings));
router.put('/api/workspace-settings', authMW, requirePage('call-analytics', 'update'), h(CallAnalyticsController.putSettings));

// ── contacts + groups ──
router.get('/api/contacts', authMW, requirePage('contacts', 'view'), h(ContactController.list));
router.get('/api/contacts/compare', authMW, requirePage('contacts', 'view'), h(ContactController.compare));
router.get('/api/contacts/:phone', authMW, requirePage('contacts', 'view'), h(ContactController.detail));
router.get('/api/contact-groups', authMW, requirePage('contacts', 'view'), h(ContactController.groups));
router.post('/api/contact-groups', authMW, requirePage('contacts', 'create'), h(ContactController.createGroup));
router.put('/api/contact-groups/:groupId', authMW, requirePage('contacts', 'update'), h(ContactController.updateGroup));
router.delete('/api/contact-groups/:groupId', authMW, requirePage('contacts', 'delete'), h(ContactController.deleteGroup));
router.post('/api/contact-groups/:groupId/members', authMW, requirePage('contacts', 'update'), h(ContactController.addMembers));
router.delete('/api/contact-groups/:groupId/members/:phone', authMW, requirePage('contacts', 'update'), h(ContactController.removeMember));

// ── plan ──
router.get('/api/plan', authMW, requirePage('plans', 'view'), h(CallAnalyticsController.plan));
router.post('/api/plan/trial', authMW, requirePage('plans', 'update'), h(CallAnalyticsController.startTrial));
router.post('/api/plan/activate', authMW, requirePage('plans', 'update', 'Admin only'), h(CallAnalyticsController.activatePlan));

// ── SIM numbers, device health ──
router.get('/api/sims', authMW, h(DeviceController.sims));
router.put('/api/sims/:slot', authMW, h(DeviceController.putSim));
router.delete('/api/sims/:slot', authMW, h(DeviceController.deleteSim));
router.post('/api/device/status', authMW, h(DeviceController.reportStatus));
router.get('/api/devices', authMW, requirePage('troubleshooting', 'view'), h(DeviceController.devices));
router.delete('/api/devices/:deviceId', authMW, requirePage('troubleshooting', 'view'), h(DeviceController.deleteDevice));

// ── Quick Call: browser → the person's own phone (Premium; the plan check is in the service) ──
router.post('/api/quick-call/devices', authMW, h(QuickCallController.link));
router.get('/api/quick-call/devices', authMW, h(QuickCallController.devices));
router.delete('/api/quick-call/devices', authMW, h(QuickCallController.unlink));
router.get('/api/quick-call/pending', authMW, h(QuickCallController.pending));
router.post('/api/quick-call/dial', authMW, h(QuickCallController.dial));

module.exports = router;
