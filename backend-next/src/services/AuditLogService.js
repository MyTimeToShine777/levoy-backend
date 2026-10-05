'use strict';

const { q } = require('../config/db');

class AuditLogService {
  async list(query) {
    const limit = Math.min(Math.max(parseInt(query.limit) || 50, 1), 500);
    const offset = Math.max(parseInt(query.offset) || 0, 0);
    // NB: params starts EMPTY — an unused leading value would shift every $N in
    // the query and Postgres rejects extra bind parameters outright.
    let where = ' WHERE 1=1';
    const params = [];
    for (const [key, col] of [['actor_id', 'a.actor_id'], ['action', 'a.action'], ['entity_type', 'a.entity_type'], ['entity_id', 'a.entity_id']]) {
      if (query[key] !== undefined && query[key] !== '') {
        params.push(key === 'actor_id' ? parseInt(query[key]) : query[key]);
        where += ` AND ${col} = $${params.length}`;
      }
    }
    if (query.from) { params.push(query.from); where += ` AND a.created_at >= $${params.length}`; }
    if (query.to) { params.push(query.to); where += ` AND a.created_at <= $${params.length}`; }

    const rows = await q(
      `SELECT a.id,a.actor_id,au.name AS actor_name,au.email AS actor_email,a.action,
              a.entity_type,a.entity_id,a.details,a.ip,a.created_at
         FROM audit_log a LEFT JOIN users au ON au.id = a.actor_id
         ${where}
        ORDER BY a.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]);
    const total = await q(`SELECT COUNT(*) AS c FROM audit_log a ${where}`, params);
    return {
      total: parseInt(total.rows[0].c) || 0, limit, offset,
      entries: rows.rows.map(x => ({ id: x.id, actor_id: x.actor_id, actor_name: x.actor_name,
        actor_email: x.actor_email, action: x.action, entity_type: x.entity_type,
        entity_id: x.entity_id, details: x.details, ip: x.ip, created_at: x.created_at })),
    };
  }
}

module.exports = new AuditLogService();
