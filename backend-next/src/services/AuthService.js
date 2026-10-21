'use strict';

const jwt = require('jsonwebtoken');
const { pool, q, pq, runInTenant, currentTenant } = require('../config/db');
const { JWT_SECRET, JWT_EXPIRE, OTP_RESEND_SECONDS } = require('../config/env');
const { AppError, ValidationError, NotFoundError, ForbiddenError, ConflictError } = require('../exceptions');
const { audit } = require('../utils/audit');
const RbacService = require('./RbacService');
const { OTP_ONLY_HASH } = require('../utils/passwords');
const MedivoyOtpClient = require('./MedivoyOtpClient');
const Registry = require('../platform/CustomerRegistry');
const Directory = require('../platform/Directory');

const { toTenant } = Registry;

// Same answer whether or not the address has an account — any difference would
// turn the send endpoint into an account-enumeration oracle.
const SENT_MESSAGE = 'If that email has a Callio account, a 6-digit code is on its way.';
const BAD_CODE = 'That code is incorrect or has expired. Request a new one.';
const SUSPENDED = 'This workspace is suspended. Contact support.';
const PLATFORM_TOKEN_TTL = '12h';

const publicUser = u => ({
  id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role,
  is_active: u.is_active, created_at: u.created_at,
});

// A workspace session carries the customer (`tid`); the auth middleware uses it to pick the schema.
const signToken = (u, customerId) => jwt.sign({ sub: String(u.id), role: u.role, tid: customerId }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
// A platform session has no customer: it may only use /api/platform/*.
const signPlatformToken = a => jwt.sign({ sub: String(a.id), plat: true }, JWT_SECRET, { expiresIn: PLATFORM_TOKEN_TTL });

const normEmail = v => String(v || '').toLowerCase().trim();

// email -> epoch ms of the last send request. Tracked for EVERY address (real or
// not) so the cooldown itself cannot be used to tell which emails are accounts.
const lastSend = new Map();
function secondsLeft(email) {
  const at = lastSend.get(email);
  if (!at) return 0;
  return Math.max(0, Math.ceil((at + OTP_RESEND_SECONDS * 1000 - Date.now()) / 1000));
}
function markSent(email) {
  lastSend.set(email, Date.now());
  if (lastSend.size > 5000) {
    for (const [k, t] of lastSend) if (Date.now() - t > OTP_RESEND_SECONDS * 1000) lastSend.delete(k);
  }
}

const platformUser = a => ({
  id: a.id, email: a.email, name: a.name, phone: null, role: 'platform_admin', is_active: a.is_active, created_at: a.created_at,
});

class AuthService {
  // Sign-up is invitation-only. Kept so existing clients can still ask.
  registrationStatus() {
    return { self_register: false, requires_invite: true, login_method: 'email_otp' };
  }

  /**
   * Permissions + landing page for a user row, merged into login / me payloads.
   * Runs inside the user's customer context.
   * @returns {{ permissions, home, permission_source, custom_role }}
   */
  async rbacPayload(u) {
    const eff = await RbacService.effectiveFor({
      id: u.id, role: u.role || 'agent', customRoleId: u.custom_role_id || null,
    });
    return {
      permissions: eff.pages, home: eff.home,
      permission_source: eff.source, custom_role: eff.custom_role,
    };
  }

  /**
   * Who is this email? A platform owner, or a user of exactly one customer, or nobody.
   * @returns {Promise<{type:'platform', admin}|{type:'tenant', customer, user}|null>}
   */
  async resolve(email) {
    const pa = await pq('SELECT id, email, name, is_active, created_at FROM platform_admins WHERE email = $1', [email]);
    if (pa.rows.length) return pa.rows[0].is_active ? { type: 'platform', admin: pa.rows[0] } : null;

    const cid = await Directory.lookup(email);
    if (!cid) return null;
    const customer = await Registry.byId(cid);
    if (!customer) return null;
    const user = await runInTenant(toTenant(customer), async () => {
      const r = await q(
        'SELECT id,email,name,phone,role,is_active,created_at,custom_role_id FROM users WHERE lower(email) = $1', [email]);
      return r.rows.length === 1 ? r.rows[0] : null;
    });
    return user ? { type: 'tenant', customer, user } : null;
  }

  // Step 1 of sign-in. Only a real, active user ever causes a request to medivoy.api,
  // so strangers' addresses never reach (or create accounts in) it.
  async sendOtp(ctx, body, valid) {
    if (!valid) throw new ValidationError('A valid email is required');
    const email = normEmail(body.email);

    const wait = secondsLeft(email);
    if (wait > 0) throw new AppError(429, `Please wait ${wait}s before requesting another code.`);
    markSent(email);

    const who = await this.resolve(email);
    const allowed = who && (who.type === 'platform' || (who.user.is_active && who.customer.status === 'active'));
    if (allowed) {
      try {
        await MedivoyOtpClient.send(email);
      } catch (e) {
        lastSend.delete(email); // the code never went out, so do not make them wait
        throw e;
      }
    }
    return { message: SENT_MESSAGE, resend_in: OTP_RESEND_SECONDS };
  }

  // Step 2: medivoy.api checks the code; Callio then issues its own session, with
  // the same payload shape the old password login returned.
  async verifyOtp(ctx, body, valid) {
    if (!valid) throw new ValidationError('Enter the 6-digit code from your email');
    const email = normEmail(body.email);
    const who = await this.resolve(email);
    // Unknown address: refuse WITHOUT calling medivoy (which would treat the
    // verify as a new sign-up) and with the same message as a wrong code.
    if (!who) throw new ValidationError(BAD_CODE);
    if (who.type === 'tenant') {
      if (!who.user.is_active) throw new ForbiddenError('Account deactivated. Contact your administrator.');
      if (who.customer.status !== 'active') throw new ForbiddenError(SUSPENDED);
    }

    const out = await MedivoyOtpClient.verify(email, String(body.otp));
    if (out.email && out.email !== email) throw new ValidationError(BAD_CODE);

    if (who.type === 'platform') {
      return {
        access_token: signPlatformToken(who.admin), token_type: 'bearer',
        platform: true, user: platformUser(who.admin),
        permissions: {}, home: '/platform/customers', permission_source: 'platform', custom_role: null,
      };
    }

    const { customer, user: u } = who;
    return runInTenant(toTenant(customer), async () => {
      await q('UPDATE users SET last_login_at = NOW() WHERE id = $1', [u.id]);
      await audit(null, ctx, 'user.login', 'user', u.id, { method: 'email_otp' });
      return {
        access_token: signToken(u, customer.id), token_type: 'bearer',
        user: publicUser(u),
        workspace: { id: customer.id, name: customer.name },
        ...(await this.rbacPayload(u)),
      };
    });
  }

  // Accept an admin invitation. PUBLIC by design — the invite token proves the
  // invitation (and carries the customer it belongs to), and the new account is only
  // usable once its owner receives an emailed code, so no session is issued here.
  async acceptInvite(ctx, body, valid) {
    if (!valid) throw new ValidationError('Validation failed');
    const m = /^c(\d+)_/.exec(String(body.token));
    // Tokens issued before multi-customer support have no prefix: they belong to customer #1.
    const customerId = m ? parseInt(m[1]) : await Registry.defaultId();
    const customer = customerId ? await Registry.byId(customerId) : null;
    if (!customer) throw new NotFoundError('Invalid invitation');
    if (customer.status !== 'active') throw new ForbiddenError(SUSPENDED);
    return runInTenant(toTenant(customer), () => this.acceptInviteInTenant(ctx, body, customer));
  }

  async acceptInviteInTenant(ctx, body, customer) {
    const { token, name } = body;
    const inv = await q('SELECT id,email,role,status,expires_at,invited_by FROM invitations WHERE token = $1', [token]);
    if (inv.rows.length === 0) throw new NotFoundError('Invalid invitation');
    const i = inv.rows[0];
    // A revoked/accepted invite is dead even if unexpired; an expired one is dead
    // whatever its status. Revoked is reported distinctly ("withdrawn").
    if (i.status === 'revoked') throw new AppError(410, 'Invitation revoked');
    if (i.status === 'accepted') throw new ConflictError('Invitation already used');
    if (new Date(i.expires_at) < new Date()) throw new AppError(410, 'Invitation expired');

    const ex = await q('SELECT id FROM users WHERE lower(email) = lower($1)', [i.email]);
    if (ex.rows.length > 0) throw new ValidationError('Email already registered');
    // Claim the address in the sign-in directory first: it fails if another customer already has it.
    await Directory.register(i.email, customer.id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const u = await client.query(
        `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4)
         RETURNING id,email,name,phone,role,is_active,created_at`,
        [i.email, OTP_ONLY_HASH, String(name).trim(), i.role]);
      await client.query(`UPDATE invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1`, [i.id]);
      await audit(client, ctx, 'user.created', 'user', u.rows[0].id,
        { email: i.email, role: i.role, path: 'invite', invitation_id: i.id, invited_by: i.invited_by ?? null, name });
      await client.query('COMMIT');
      return {
        email: i.email, user: publicUser(u.rows[0]),
        message: 'Account created. Sign in with the 6-digit code we email you.',
      };
    } catch (e) {
      await client.query('ROLLBACK');
      await Directory.unregister(i.email, customer.id).catch(() => {});
      throw e;
    } finally { client.release(); }
  }

  async me(userId) {
    const r = await q('SELECT id,email,name,phone,role,is_active,created_at,custom_role_id FROM users WHERE id = $1', [userId]);
    if (r.rows.length === 0) throw new NotFoundError('Not found');
    const u = r.rows[0];
    const t = currentTenant();
    const customer = t ? await Registry.byId(t.id) : null;
    return { ...publicUser(u), ...(customer ? { workspace: { id: customer.id, name: customer.name } } : {}), ...(await this.rbacPayload(u)) };
  }

  /** The signed-in platform owner (GET /api/auth/me with a platform session). */
  async platformMe(adminId) {
    const r = await pq('SELECT id, email, name, is_active, created_at FROM platform_admins WHERE id = $1', [adminId]);
    if (!r.rows.length) throw new NotFoundError('Not found');
    return { ...platformUser(r.rows[0]), platform: true, permissions: {}, home: '/platform/customers' };
  }
}

module.exports = new AuthService();
module.exports.OTP_ONLY_HASH = OTP_ONLY_HASH;
module.exports.signToken = signToken;
module.exports.signPlatformToken = signPlatformToken;
