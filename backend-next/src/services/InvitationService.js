'use strict';

const { q, currentTenant } = require('../config/db');
const Directory = require('../platform/Directory');
const { ValidationError, NotFoundError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { randomToken } = require('../utils/passwords');

const ROLES = ['admin', 'manager', 'agent'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class InvitationService {
  async create(ctx, body) {
    const { email, role = 'agent', expires_in_hours = 72 } = body;
    if (!email || !EMAIL_RE.test(String(email))) throw new ValidationError('A valid email is required');
    if (!ROLES.includes(role)) throw new ValidationError('Invalid role');
    const hours = Math.min(Math.max(parseInt(expires_in_hours) || 72, 1), 720);
    const ex = await q('SELECT id FROM users WHERE email = $1', [email]);
    if (ex.rows.length > 0 || await Directory.lookup(email)) throw new ValidationError('User already exists');
    const dup = await q(`SELECT id FROM invitations WHERE email = $1 AND status = 'pending'`, [email]);
    if (dup.rows.length > 0) throw new ValidationError('A pending invitation already exists for this email');
    // `c<customer>_` lets the public accept-invite call find the right customer from the token alone.
    const token = `c${currentTenant().id}_${randomToken()}`;
    const r = await q(
      `INSERT INTO invitations (email, role, invited_by, token, status, expires_at)
       VALUES ($1,$2,$3,$4,'pending', NOW() + ($5 || ' hours')::interval)
       RETURNING id,email,role,invited_by,token,status,expires_at,created_at`,
      [email, role, parseInt(ctx.userId), token, hours]);
    const inv = r.rows[0];
    await audit(null, ctx, 'invitation.created', 'invitation', inv.id,
      { email: inv.email, role: inv.role, expires_at: inv.expires_at });
    return { ...inv,
      accept_url: `/api/auth/accept-invite?token=${inv.token}`,
      notice: 'Share this token/link with the invitee. It is shown only once here but can be re-listed by an admin.' };
  }

  async list(query) {
    let where = ' WHERE 1=1';
    const params = [];
    if (query.status) { params.push(query.status); where += ` AND i.status = $${params.length}`; }
    const r = await q(
      `SELECT i.id,i.email,i.role,i.invited_by,iu.name AS invited_by_name,i.token,i.status,i.expires_at,i.created_at,i.accepted_at
         FROM invitations i LEFT JOIN users iu ON iu.id = i.invited_by
        ${where} ORDER BY i.id DESC LIMIT 200`, params);
    return r.rows.map(i => ({ id: i.id, email: i.email, role: i.role, invited_by: i.invited_by,
      invited_by_name: i.invited_by_name, token: i.token, status: i.status,
      expired: i.status === 'pending' && new Date(i.expires_at) < new Date(),
      expires_at: i.expires_at, created_at: i.created_at, accepted_at: i.accepted_at }));
  }

  async revoke(ctx, idRaw) {
    const id = parseInt(idRaw);
    const cur = await q('SELECT id,email,status FROM invitations WHERE id = $1', [id]);
    if (cur.rows.length === 0) throw new NotFoundError('Not found');
    if (cur.rows[0].status !== 'pending') {
      throw new ValidationError(`Invitation already ${cur.rows[0].status}`);
    }
    await q(`UPDATE invitations SET status = 'revoked' WHERE id = $1`, [id]);
    await audit(null, ctx, 'invitation.revoked', 'invitation', id, { email: cur.rows[0].email });
    return { id, status: 'revoked', email: cur.rows[0].email, revoked: true };
  }
}

module.exports = new InvitationService();
