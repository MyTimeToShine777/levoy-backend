'use strict';

const { q, tx, currentTenant } = require('../config/db');
const Directory = require('../platform/Directory');
const { ValidationError, NotFoundError, ConflictError } = require('../exceptions');
const { audit } = require('../utils/audit');

// Privacy consent and "delete my account", the two things the competitor's app asks for up front.
class AccountLifecycleService {
  async consent(ctx) {
    const r = await q("SELECT value FROM user_settings WHERE user_id = $1 AND key = 'privacy_consent_at'", [parseInt(ctx.userId)]);
    return { accepted: r.rows.length > 0, accepted_at: r.rows[0] ? r.rows[0].value : null };
  }

  async acceptConsent(ctx) {
    const at = new Date().toISOString();
    await q(`INSERT INTO user_settings (user_id, key, value) VALUES ($1, 'privacy_consent_at', $2)
             ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`, [parseInt(ctx.userId), at]);
    await audit(null, ctx, 'user.privacy_consent', 'user', ctx.userId, {});
    return { accepted: true, accepted_at: at };
  }

  // Permanently removes the caller and what hangs off them (calls, devices, reminders, notifications ...).
  // Leads are different: deleting the owner would take the leads with it, so that is refused until they are reassigned.
  async deleteMe(ctx, body) {
    // No passwords exist (sign-in is by emailed code), so the guard against an
    // accidental or hijacked-session delete is typing the account's own email.
    const typed = String((body && body.email) || '').toLowerCase().trim();
    if (!typed) throw new ValidationError('Type your email address to confirm deleting your account');
    const uid = parseInt(ctx.userId);
    const u = (await q('SELECT id, role, email FROM users WHERE id = $1', [uid])).rows[0];
    if (!u) throw new NotFoundError('Not found');
    if (typed !== String(u.email).toLowerCase().trim()) throw new ValidationError('That email does not match your account');

    if (u.role === 'admin') {
      const others = await q("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND is_active = true AND id <> $1", [uid]);
      if (others.rows[0].n === 0) throw new ConflictError('You are the only admin. Make someone else an admin first.');
    }
    const owned = await q('SELECT COUNT(*)::int AS n FROM leads WHERE owner_id = $1', [uid]);
    if (owned.rows[0].n > 0) throw new ConflictError(`You own ${owned.rows[0].n} lead(s). Reassign them to someone else before deleting your account.`);
    const teams = await q('SELECT COUNT(*)::int AS n FROM teams WHERE created_by = $1', [uid]);
    if (teams.rows[0].n > 0) throw new ConflictError(`You created ${teams.rows[0].n} team(s). Delete them or hand them over first.`);

    await tx(async ({ q: tq }) => {
      await audit({ query: tq }, ctx, 'user.self_deleted', 'user', uid, { email: u.email, role: u.role });
      await tq('DELETE FROM users WHERE id = $1', [uid]);
    });
    await Directory.unregister(u.email, currentTenant().id);
    return { deleted: true };
  }
}

module.exports = new AccountLifecycleService();
