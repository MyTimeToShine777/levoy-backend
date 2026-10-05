'use strict';

const { q } = require('../config/db');

// Who may a manager/admin see or assign to?
class ScopeService {
  // Resolve the set of user ids a manager/admin may see: a manager is scoped to
  // the union of their own teams, an admin sees everyone. Returns null for
  // "no restriction" (admin) vs an array of ids (manager).
  async teamScopeIds(req) {
    if (req.userRole === 'admin') return null;
    const r = await q(
      `SELECT DISTINCT tm2.user_id
         FROM team_members tm1
         JOIN team_members tm2 ON tm2.team_id = tm1.team_id
        WHERE tm1.user_id = $1`,
      [req.userId]
    );
    const ids = r.rows.map(x => x.user_id);
    if (!ids.includes(parseInt(req.userId))) ids.push(parseInt(req.userId));
    return ids;
  }

  // Agents/managers eligible to receive a lead: for an admin that's every active
  // agent/manager, for a manager it's the active agent/manager members of their
  // teams. Admin accounts are never assignable.
  async assignableUsers(req) {
    const scope = await this.teamScopeIds(req);
    if (scope === null) {
      const r = await q(`SELECT id,name,role FROM users WHERE is_active = true AND role IN ('agent','manager') ORDER BY id`);
      return r.rows;
    }
    const r = await q(
      `SELECT DISTINCT u.id,u.name,u.role
         FROM users u
         JOIN team_members tm ON tm.user_id = u.id
        WHERE u.is_active = true AND u.role IN ('agent','manager') AND u.id = ANY($1)
        ORDER BY u.id`,
      [scope]
    );
    // A manager with no teams can still assign to themselves.
    if (r.rows.length === 0) {
      const me = await q(`SELECT id,name,role FROM users WHERE id = $1 AND role IN ('agent','manager')`, [req.userId]);
      return me.rows;
    }
    return r.rows;
  }
}

module.exports = new ScopeService();
