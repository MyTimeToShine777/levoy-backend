'use strict';

const { Router } = require('express');
const UserController = require('../controllers/UserController');
const InvitationController = require('../controllers/InvitationController');
const AuditLogController = require('../controllers/AuditLogController');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');

const router = Router();
const h = asyncHandler;

// ─── Users ───
// GET /api/users is deliberately NOT page-guarded: managers and agents' lead
// screens need the user list for assignee pickers; the handler keeps its own
// admin/manager check.
router.get('/api/users', authMW, h(UserController.list));
router.post('/api/users', authMW, h(UserController.create));
router.patch('/api/users/:userId', authMW, h(UserController.update));
router.delete('/api/users/:userId', authMW, h(UserController.remove));
router.get('/api/users/:userId/capacity', authMW, h(UserController.getCapacity));
router.put('/api/users/:userId/capacity', authMW, h(UserController.setCapacity));
router.post('/api/users/:userId/role', authMW, h(UserController.setRoleLegacy));

// ─── Audit log ───
router.get('/api/audit-log', authMW, h(AuditLogController.list));

// ─── Invitations ───
router.post('/api/invitations', authMW, h(InvitationController.create));
router.get('/api/invitations', authMW, h(InvitationController.list));
router.delete('/api/invitations/:id', authMW, h(InvitationController.revoke));

module.exports = router;
