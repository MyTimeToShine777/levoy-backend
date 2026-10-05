'use strict';

const RbacService = require('../services/RbacService');
const { can } = require('../config/rbac');

/**
 * Route guard backed by RBAC: the caller's effective permissions must grant
 * `action` on `page`. Runs after authMW (needs req.userId / req.userRole).
 *
 * This enforces tab access on the API itself — hiding a sidebar link is not
 * security. `denyDetail` is the message the endpoint always returned for a role
 * failure ('Forbidden' or 'Admin only'), so responses stay byte-identical for
 * callers that were already being refused.
 *
 *   router.get('/api/leads', authMW, requirePage('leads', 'view'), ...)
 */
function requirePage(page, action = 'view', denyDetail = 'Forbidden') {
  return async function pageGuard(req, res, next) {
    try {
      const eff = await RbacService.effectiveFor({
        id: parseInt(req.userId), role: req.userRole, customRoleId: req.customRoleId || null,
      });
      if (can(eff, page, action)) return next();
      res.set('X-RBAC-Denied', `${page}.${action}`);
      return res.status(403).json({ detail: denyDetail });
    } catch (e) { return next(e); }
  };
}

module.exports = requirePage;
