'use strict';

const { Router } = require('express');
const PlatformController = require('../controllers/PlatformController');
const asyncHandler = require('../middleware/asyncHandler');
const platformMW = require('../middleware/platformAuth');

const router = Router();
const h = asyncHandler;
const P = '/api/platform';

// The Customers console. Platform sessions only (see middleware/platformAuth.js).
router.get(`${P}/overview`, platformMW, h(PlatformController.overview));

router.get(`${P}/customers`, platformMW, h(PlatformController.listCustomers));
router.post(`${P}/customers`, platformMW, h(PlatformController.createCustomer));
router.get(`${P}/customers/:id`, platformMW, h(PlatformController.getCustomer));
router.patch(`${P}/customers/:id`, platformMW, h(PlatformController.updateCustomer));
router.delete(`${P}/customers/:id`, platformMW, h(PlatformController.removeCustomer));
router.post(`${P}/customers/:id/suspend`, platformMW, h(PlatformController.suspend));
router.post(`${P}/customers/:id/resume`, platformMW, h(PlatformController.resume));
router.post(`${P}/customers/:id/enter`, platformMW, h(PlatformController.enter));

router.post(`${P}/customers/:id/subscription/grant`, platformMW, h(PlatformController.grant));
router.post(`${P}/customers/:id/subscription/extend`, platformMW, h(PlatformController.extend));
router.post(`${P}/customers/:id/subscription/end-date`, platformMW, h(PlatformController.endDate));
router.post(`${P}/customers/:id/subscription/plan`, platformMW, h(PlatformController.changePlan));
router.post(`${P}/customers/:id/subscription/trial`, platformMW, h(PlatformController.trial));
router.post(`${P}/customers/:id/subscription/cancel`, platformMW, h(PlatformController.cancel));
router.post(`${P}/customers/:id/subscription/keep`, platformMW, h(PlatformController.keep));
router.post(`${P}/customers/:id/refund`, platformMW, h(PlatformController.refund));

router.get(`${P}/plans`, platformMW, h(PlatformController.listPlans));
router.post(`${P}/plans`, platformMW, h(PlatformController.createPlan));
router.put(`${P}/plans/:key`, platformMW, h(PlatformController.updatePlan));
router.delete(`${P}/plans/:key`, platformMW, h(PlatformController.deletePlan));

module.exports = router;
