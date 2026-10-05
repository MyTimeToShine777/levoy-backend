'use strict';

const jwt = require('jsonwebtoken');
const { q, runInTenant } = require('../config/db');
const { JWT_SECRET } = require('../config/env');
const Registry = require('../platform/CustomerRegistry');

const { toTenant } = Registry;

function readToken(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return { error: [401, 'Not authenticated'] };
  try { return { payload: jwt.verify(h.split(' ')[1], JWT_SECRET) }; }
  catch (e) { return { error: [401, 'Invalid token'] }; }
}

// JWT alone is not enough: a token signed before an admin deactivated a user
// would keep working until it expired (24h). So the role claim is trusted for
// decoding but the live row is re-read on every request — an is_active=false
// account is rejected immediately, and a role change takes effect at once.
//
// The token also names the customer (`tid`). Everything the request does afterwards runs inside
// that customer's database context, so it can only ever see that customer's data. Tokens issued
// before multi-customer support carry no `tid`; they belong to customer #1.
async function authMW(req, res, next) {
  const { payload: p, error } = readToken(req);
  if (error) return res.status(error[0]).json({ detail: error[1] });
  if (p.plat) return res.status(403).json({ detail: 'A platform session cannot use workspace endpoints', code: 'platform_session' });

  let customer;
  try {
    const tid = p.tid !== undefined ? p.tid : await Registry.defaultId();
    customer = await Registry.byId(tid);
  } catch (e) { return res.status(401).json({ detail: 'Invalid token' }); }
  if (!customer) return res.status(401).json({ detail: 'Workspace no longer exists' });
  if (customer.status !== 'active') return res.status(403).json({ detail: 'This workspace is suspended. Contact support.', code: 'workspace_suspended' });

  return runInTenant(toTenant(customer), async () => {
    try {
      const r = await q('SELECT id, role, is_active, custom_role_id FROM users WHERE id = $1', [p.sub]);
      if (r.rows.length === 0) return res.status(401).json({ detail: 'User no longer exists' });
      if (!r.rows[0].is_active) return res.status(403).json({ detail: 'Account deactivated' });
      req.userId = r.rows[0].id;
      req.userRole = r.rows[0].role;
      req.customRoleId = r.rows[0].custom_role_id || null;   // RBAC: see middleware/requirePage.js
      req.customerId = customer.id;
    } catch (e) { return res.status(401).json({ detail: 'Invalid token' }); }
    next();
  });
}

module.exports = authMW;
module.exports.readToken = readToken;
