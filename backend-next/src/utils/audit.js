'use strict';

const { pool } = require('../config/db');

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || null);
}

// The request context services work with, so they never touch req/res:
//   { userId, role, ip }
function ctxOf(req) {
  return { userId: req.userId, role: req.userRole, ip: clientIp(req) };
}

// Fire-and-forget audit write: a failure here must NEVER fail the action the
// user actually asked for, so the error is logged and swallowed. Pass the pg
// client to have the row land in the same transaction as the mutation.
//
// `ctx` is a service context ({userId, ip}), a raw Express request (legacy
// handlers still pass one), or null for system/anonymous actions.
async function audit(client, ctx, action, entityType, entityId, details) {
  const sql = `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, ip)
               VALUES ($1,$2,$3,$4,$5,$6)`;
  const isReq = !!(ctx && ctx.socket);
  const params = [ctx ? ctx.userId : null, action, entityType,
    entityId == null ? null : String(entityId),
    details ? JSON.stringify(details) : null,
    ctx ? (isReq ? clientIp(ctx) : (ctx.ip || null)) : null];
  try {
    if (client) await client.query(sql, params);
    else await pool.query(sql, params);
  } catch (e) { console.error('Audit write failed:', e.message); }
}

module.exports = { audit, clientIp, ctxOf };
