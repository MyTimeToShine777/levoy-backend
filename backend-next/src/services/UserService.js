'use strict';

const { pool, q, tx, currentTenant } = require('../config/db');
const Directory = require('../platform/Directory');
const { OPEN_LEAD_STATUSES, ASSIGNMENT_CAPACITY } = require('../config/constants');
const { ValidationError, NotFoundError, ForbiddenError, ConflictError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { OTP_ONLY_HASH } = require('../utils/passwords');
const RbacService = require('./RbacService');

const ROLES = ['admin', 'manager', 'agent'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Per-agent effective cap on OPEN leads = min(personal max_open_leads, global
// ASSIGNMENT_CAPACITY). NULL means "no personal limit" and falls back to the
// global backstop, so this never returns null.
async function capacityFor(userId) {
  const r = await q('SELECT max_open_leads FROM user_capacity WHERE user_id = $1', [userId]);
  const personal = r.rows.length ? r.rows[0].max_open_leads : null;
  if (personal === null || personal === undefined) return { max_open_leads: null, effective: ASSIGNMENT_CAPACITY };
  return { max_open_leads: parseInt(personal), effective: Math.min(parseInt(personal), ASSIGNMENT_CAPACITY) };
}

class UserService {
  capacityFor(userId) { return capacityFor(userId); }

  // One query with scalar subqueries per user: teams, leads owned, calls this
  // month and last login all come back in a single round trip.
  async list(ctx, query) {
    if (ctx.role !== 'admin' && ctx.role !== 'manager') throw new ForbiddenError('Forbidden');
    // $1 is always the open-status list; every optional filter is ANDed on after.
    const params = [OPEN_LEAD_STATUSES];
    let where = ' WHERE 1=1';
    if (query.role) { params.push(query.role); where += ` AND role = $${params.length}`; }
    // Deactivated users are hidden by default but an admin can ask for them.
    if (query.include_inactive !== 'true') where += ' AND is_active = true';
    const r = await q(
      `SELECT u.id,u.email,u.name,u.phone,u.role,u.is_active,u.created_at,u.last_login_at,
              (SELECT COALESCE(json_agg(json_build_object('id',t.id,'name',t.name)) FILTER (WHERE t.id IS NOT NULL), '[]'::json)
                 FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = u.id) AS teams,
              (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.status = ANY($1)) AS open_leads_owned,
              (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id) AS leads_owned,
              (SELECT COUNT(*) FROM call_events ce
                WHERE ce.user_id = u.id
                  AND ce.timestamp >= date_trunc('month', NOW())) AS calls_this_month,
              (SELECT COUNT(*) FROM lead_assignees la WHERE la.user_id = u.id) AS assignee_rows,
              uc.max_open_leads
         FROM users u
         LEFT JOIN user_capacity uc ON uc.user_id = u.id
        ${where}
        ORDER BY u.id`,
      params);
    return r.rows.map(u => ({
      id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role,
      is_active: u.is_active, created_at: u.created_at, last_login_at: u.last_login_at,
      teams: u.teams || [],
      leads_owned: parseInt(u.leads_owned) || 0,
      open_leads_owned: parseInt(u.open_leads_owned) || 0,
      calls_this_month: parseInt(u.calls_this_month) || 0,
      assignee_count: parseInt(u.assignee_rows) || 0,
      max_open_leads: u.max_open_leads === null || u.max_open_leads === undefined ? null : parseInt(u.max_open_leads),
    }));
  }

  // ADMIN: create a login for a teammate. There is no password: the person signs
  // in with a 6-digit code emailed to this address, so it must be a real inbox.
  async create(ctx, body) {
    const { email, name, phone, role = 'agent', team_ids } = body;
    if (!email || !EMAIL_RE.test(String(email))) throw new ValidationError('A valid email is required');
    if (!name || !String(name).trim()) throw new ValidationError('name required');
    if (!ROLES.includes(role)) throw new ValidationError('Invalid role');
    const ex = await q('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (ex.rows.length > 0) throw new ValidationError('Email already registered');
    const ids = Array.isArray(team_ids) ? team_ids.map(Number).filter(n => Number.isInteger(n)) : [];
    // One email belongs to one customer: claim it in the sign-in directory first (fails if another customer has it).
    const customerId = currentTenant().id;
    try { await Directory.register(email, customerId); }
    catch (e) { throw new ValidationError('Email already registered'); }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `INSERT INTO users (email, password_hash, name, phone, role) VALUES ($1,$2,$3,$4,$5)
         RETURNING id,email,name,phone,role,is_active,created_at`,
        [String(email).trim(), OTP_ONLY_HASH, String(name).trim(), phone || null, role]);
      const u = r.rows[0];
      for (const tid of ids) {
        await client.query('INSERT INTO team_members (team_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [tid, u.id]);
      }
      await audit(client, ctx, 'user.created', 'user', u.id,
        { email: u.email, role: u.role, team_ids: ids, path: 'admin' });
      await client.query('COMMIT');
      return {
        id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role,
        is_active: u.is_active, created_at: u.created_at, team_ids: ids,
        notice: 'They can sign in now: enter this email on the login page and use the 6-digit code that is emailed.',
      };
    } catch (e) { await client.query('ROLLBACK'); await Directory.unregister(email, customerId).catch(() => {}); throw e; } finally { client.release(); }
  }

  // ADMIN or MANAGER: update profile fields / email / role / active flag. A manager can edit anyone
  // except an admin and can never grant admin; a manager gives up their own role through handoverRole.
  async update(ctx, idRaw, body) {
    const id = parseInt(idRaw);
    if (!Number.isInteger(id)) throw new ValidationError('Invalid user id');
    const { name, phone, role, is_active } = body;
    let { email } = body;
    if (role !== undefined && !ROLES.includes(role)) throw new ValidationError('Invalid role');
    if (email !== undefined) {
      email = String(email).trim();
      if (!EMAIL_RE.test(email)) throw new ValidationError('A valid email is required');
    }
    const cur = await q('SELECT id,email,name,phone,role,is_active FROM users WHERE id = $1', [id]);
    if (cur.rows.length === 0) throw new NotFoundError('Not found');
    const before = cur.rows[0];

    if (ctx.role !== 'admin') {
      if (before.role === 'admin') throw new ForbiddenError('Only an admin can change an admin');
      if (role === 'admin') throw new ForbiddenError('Only an admin can grant the admin role');
    }

    // Locking yourself out is unrecoverable through the UI, so self-deactivation and any
    // change to your own role are refused. Another admin can still do it for you.
    if (id === parseInt(ctx.userId) && (is_active === false || (role !== undefined && role !== before.role))) {
      throw new ValidationError('You cannot deactivate or change the role of your own account');
    }

    // The sign-in directory claims the new address first (a clash fails before anything moves);
    // it is put back if the row update then fails.
    const emailChanged = email !== undefined && email.toLowerCase() !== String(before.email).toLowerCase();
    if (emailChanged) {
      const taken = await q('SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2', [email, id]);
      if (taken.rows.length > 0) throw new ValidationError('Email already registered');
      try { await Directory.rename(before.email, email, currentTenant().id); }
      catch (e) { throw new ValidationError('Email already registered'); }
    }

    const sets = []; const vals = []; let i = 1;
    for (const [k, v] of Object.entries({ name, phone, role, email })) {
      if (v !== undefined) { sets.push(`${k} = $${i}`); vals.push(v); i++; }
    }
    if (is_active !== undefined) { sets.push(`is_active = $${i}`); vals.push(!!is_active); i++; }
    if (sets.length === 0) throw new ValidationError('No fields to update');
    vals.push(id);
    let r;
    try {
      r = await q(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
         RETURNING id,email,name,phone,role,is_active,created_at,last_login_at`, vals);
    } catch (e) {
      if (emailChanged) await Directory.rename(email, before.email, currentTenant().id).catch(() => {});
      throw e;
    }
    const u = r.rows[0];

    if (emailChanged) {
      await audit(null, ctx, 'user.email_changed', 'user', id, { from: before.email, to: u.email });
    }

    // One audit row per thing that actually changed, so a role change is never
    // hidden inside a generic "update".
    if (role !== undefined && role !== before.role) {
      await audit(null, ctx, 'user.role_changed', 'user', id, { from: before.role, to: role });
      // A system-role change detaches any custom role (it was based on the old one).
      await q('UPDATE users SET custom_role_id = NULL WHERE id = $1', [id]);
      RbacService.clearCache();
    }
    if (is_active !== undefined && !!is_active !== !!before.is_active) {
      await audit(null, ctx, !!is_active ? 'user.activated' : 'user.deactivated', 'user', id,
        { email: before.email, was_active: !!before.is_active });
    }
    if (name !== undefined || phone !== undefined) {
      await audit(null, ctx, 'user.updated', 'user', id,
        { changed: Object.keys({ name, phone }).filter(k => ({ name, phone })[k] !== undefined) });
    }
    return { ...u, updated: true };
  }

  // MANAGER: hand your own manager role to an active agent and become an agent yourself, in one
  // step. Leads and teams stay where they are; moving those is a separate action.
  async handoverRole(ctx, idRaw) {
    if (ctx.role !== 'manager') throw new ForbiddenError('Only a manager can hand over their own role');
    const id = parseInt(idRaw);
    if (!Number.isInteger(id)) throw new ValidationError('Invalid user id');
    const me = parseInt(ctx.userId);
    if (id === me) throw new ValidationError('Pick someone other than yourself');
    const t = (await q('SELECT id, email, name, role, is_active FROM users WHERE id = $1', [id])).rows[0];
    if (!t) throw new NotFoundError('Not found');
    if (!t.is_active) throw new ValidationError(`${t.email} is deactivated`);
    if (t.role !== 'agent') throw new ConflictError(`${t.email} is already a ${t.role}. Only an agent can take over a manager role.`);

    await tx(async ({ q: tq }) => {
      const demoted = await tq("UPDATE users SET role = 'agent', custom_role_id = NULL WHERE id = $1 AND role = 'manager' RETURNING id", [me]);
      if (demoted.rows.length === 0) throw new ConflictError('You are no longer a manager');
      const promoted = await tq("UPDATE users SET role = 'manager', custom_role_id = NULL WHERE id = $1 AND role = 'agent' AND is_active = true RETURNING id", [id]);
      if (promoted.rows.length === 0) throw new ConflictError(`${t.email} changed while handing over. Try again.`);
      await audit({ query: tq }, ctx, 'user.role_changed', 'user', me, { from: 'manager', to: 'agent', via: 'handover', handed_to: id });
      await audit({ query: tq }, ctx, 'user.role_changed', 'user', id, { from: 'agent', to: 'manager', via: 'handover', handed_by: me });
    });
    RbacService.clearCache();
    return { handed_over: true, from: { id: me, role: 'agent' }, to: { id, email: t.email, name: t.name, role: 'manager' } };
  }

  // ADMIN: erase another user's account row and free their email. Same guards as
  // "delete my account": leads are never taken down with the owner, so it is refused
  // while any lead still points at them (Remove moves the leads first).
  async remove(ctx, idRaw) {
    const id = parseInt(idRaw);
    if (!Number.isInteger(id)) throw new ValidationError('Invalid user id');
    if (id === parseInt(ctx.userId)) throw new ValidationError('You cannot delete your own account here — use delete my account');
    const u = (await q('SELECT id, email, role, is_active FROM users WHERE id = $1', [id])).rows[0];
    if (!u) throw new NotFoundError('Not found');

    if (u.role === 'admin' && u.is_active) {
      const others = await q("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND is_active = true AND id <> $1", [id]);
      if (others.rows[0].n === 0) throw new ConflictError('This is the only active admin. Make someone else an admin first.');
    }
    const held = await q('SELECT COUNT(*)::int AS n FROM leads WHERE owner_id = $1 OR assigned_to = $1', [id]);
    if (held.rows[0].n > 0) throw new ConflictError(`${u.email} still holds ${held.rows[0].n} lead(s). Move them to someone else first (Remove does this).`);
    const teams = await q('SELECT COUNT(*)::int AS n FROM teams WHERE created_by = $1', [id]);
    if (teams.rows[0].n > 0) throw new ConflictError(`${u.email} created ${teams.rows[0].n} team(s). Delete them or hand them over first.`);

    await tx(async ({ q: tq }) => {
      await audit({ query: tq }, ctx, 'user.deleted', 'user', id, { email: u.email, role: u.role });
      await tq('DELETE FROM users WHERE id = $1', [id]);
    });
    await Directory.unregister(u.email, currentTenant().id);
    return { deleted: true, id, email: u.email };
  }

  // Legacy endpoint: POST /api/users/:userId/role?role=…
  async setRoleLegacy(ctx, userId, role) {
    if (!ROLES.includes(role)) throw new ValidationError('Invalid role');
    const cur = await q('SELECT id, role FROM users WHERE id = $1', [userId]);
    if (cur.rows.length === 0) throw new NotFoundError('Not found');
    await q('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    await audit(null, ctx, 'user.role_changed', 'user', userId,
      { from: cur.rows[0].role, to: role, via: 'legacy_role_endpoint' });
    return { message: `Role updated to ${role}` };
  }

  // ── capacity ──
  async getCapacity(ctx, idRaw) {
    const id = parseInt(idRaw);
    if (ctx.role === 'agent' && id !== parseInt(ctx.userId)) throw new ForbiddenError('Forbidden');
    const u = await q('SELECT id,name FROM users WHERE id = $1', [id]);
    if (u.rows.length === 0) throw new NotFoundError('Not found');
    const cap = await capacityFor(id);
    const load = await q(
      'SELECT COUNT(*) AS open FROM leads WHERE assigned_to = $1 AND status = ANY($2)',
      [id, OPEN_LEAD_STATUSES]);
    const open = parseInt(load.rows[0].open) || 0;
    return { user_id: id, name: u.rows[0].name, max_open_leads: cap.max_open_leads,
      effective_capacity: cap.effective, global_capacity: ASSIGNMENT_CAPACITY,
      open_leads: open, at_capacity: open >= cap.effective, updated_at: null };
  }

  async setCapacity(ctx, idRaw, body) {
    if (ctx.role !== 'admin' && ctx.role !== 'manager') throw new ForbiddenError('Admin or manager only');
    const id = parseInt(idRaw);
    const u = await q('SELECT id,name FROM users WHERE id = $1', [id]);
    if (u.rows.length === 0) throw new NotFoundError('Not found');
    const b = body || {};
    let val = b.max_open_leads === undefined ? null : b.max_open_leads;
    if (val !== null) {
      val = Number(val);
      if (!Number.isInteger(val) || val < 0) throw new ValidationError('max_open_leads must be a non-negative integer or null');
    }
    const r = await q(
      `INSERT INTO user_capacity (user_id, max_open_leads, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (user_id) DO UPDATE SET max_open_leads = EXCLUDED.max_open_leads, updated_at = NOW()
       RETURNING user_id, max_open_leads, updated_at`, [id, val]);
    await audit(null, ctx, 'user.capacity_set', 'user', id, { max_open_leads: val, name: u.rows[0].name });
    const cap = await capacityFor(id);
    return { user_id: r.rows[0].user_id, max_open_leads: r.rows[0].max_open_leads,
      effective_capacity: cap.effective, global_capacity: ASSIGNMENT_CAPACITY, updated_at: r.rows[0].updated_at };
  }
}

module.exports = new UserService();
