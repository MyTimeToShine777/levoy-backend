'use strict';

const { pq } = require('../config/db');
const authMW = require('./auth');

// Platform owners (the people who run Levoy itself) sign in with a session that has no customer. It is accepted
// ONLY by the /api/platform/* routes; workspace routes refuse it (see authMW).
async function platformMW(req, res, next) {
  const { payload: p, error } = authMW.readToken(req);
  if (error) return res.status(error[0]).json({ detail: error[1] });
  if (!p.plat) return res.status(403).json({ detail: 'Platform owners only' });
  try {
    const r = await pq('SELECT id, email, name, is_active FROM platform_admins WHERE id = $1', [p.sub]);
    if (!r.rows.length) return res.status(401).json({ detail: 'User no longer exists' });
    if (!r.rows[0].is_active) return res.status(403).json({ detail: 'Account deactivated' });
    req.platformAdmin = r.rows[0];
  } catch (e) { return res.status(401).json({ detail: 'Invalid token' }); }
  next();
}

// GET /api/auth/me is shared: a workspace session answers with the user, a platform session with the owner.
function sessionMW(req, res, next) {
  const { payload: p } = authMW.readToken(req);
  return p && p.plat ? platformMW(req, res, next) : authMW(req, res, next);
}

module.exports = platformMW;
module.exports.sessionMW = sessionMW;
