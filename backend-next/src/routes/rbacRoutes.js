'use strict';

const { Router } = require('express');
const RbacController = require('../controllers/RbacController');
const RbacService = require('../services/RbacService');
const asyncHandler = require('../middleware/asyncHandler');
const authMW = require('../middleware/auth');
const requirePage = require('../middleware/requirePage');

const router = Router();
const h = asyncHandler;

// Pages / actions registry — any signed-in user (the client needs it to map
// routes to page keys and render the sidebar).
router.get('/api/rbac/registry', authMW, h(async (req, res) => res.json(RbacService.registry())));

// Everything below is the admin console ("Roles & Access").
const view = [authMW, requirePage('rbac', 'view', 'Admin only')];
const edit = [authMW, requirePage('rbac', 'update', 'Admin only')];

router.get('/api/rbac/matrix', ...view, h(RbacController.matrix));
router.put('/api/rbac/roles/:role', ...edit, h(RbacController.saveRole));
router.delete('/api/rbac/roles/:role', ...edit, h(RbacController.resetRole));

router.post('/api/rbac/custom-roles', ...edit, h(RbacController.createCustomRole));
router.put('/api/rbac/custom-roles/:id', ...edit, h(RbacController.updateCustomRole));
router.delete('/api/rbac/custom-roles/:id', ...edit, h(RbacController.deleteCustomRole));

router.get('/api/rbac/users', ...view, h(RbacController.listUsers));
router.get('/api/rbac/users/:userId', ...view, h(RbacController.getUser));
router.put('/api/rbac/users/:userId', ...edit, h(RbacController.saveUser));
router.delete('/api/rbac/users/:userId', ...edit, h(RbacController.resetUser));
router.put('/api/rbac/users/:userId/custom-role', ...edit, h(RbacController.setUserCustomRole));

module.exports = router;
