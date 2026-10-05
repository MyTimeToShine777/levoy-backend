'use strict';

const { ForbiddenError } = require('../exceptions');

// Role guards. Throwing (rather than writing to res) lets controllers and
// services stay linear. Admin-only is separate from manager-or-admin because
// user/invite/audit routes must never be reachable by a manager.
function requireAdmin(req) {
  if (req.userRole !== 'admin') throw new ForbiddenError('Admin only');
}

function requireManager(req) {
  if (req.userRole !== 'admin' && req.userRole !== 'manager') throw new ForbiddenError('Forbidden');
}

module.exports = { requireAdmin, requireManager };
