'use strict';

const { q, currentTenant } = require('../config/db');
const R = require('../config/rbac');
const { AppError, NotFoundError, ValidationError } = require('../exceptions');
const { audit } = require('../utils/audit');

// Effective permissions are read on (almost) every request, so they are cached
// per user for a few seconds. Any write through this service clears the cache,
// so an admin's change is visible to the next request on this node.
// The key includes the customer's schema: user ids repeat across customers, so
// "user 1" of one customer must never be served "user 1" of another.
const TTL_MS = 15 * 1000;
const cache = new Map();   // `${schema}:${userId}` -> { at, value }

function clearCache() { cache.clear(); }

const cacheKey = id => `${(currentTenant() || {}).schema || '-'}:${id}`;

const slugKey = name => String(name || '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

const NOW_UTC = "(NOW() AT TIME ZONE 'UTC')";

// DB row -> the camelCase shape the rest of this class (and its callers) use.
const roleRow = r => r && ({
  id: r.id, key: r.key, name: r.name, description: r.description,
  baseRole: r.base_role, isActive: r.is_active, permissions: r.permissions,
});

class RbacService {
  registry() { return R.registry(); }

  /**
   * Effective permissions for a user: user override > custom role > role
   * profile > built-in default.
   * @returns {{ pages, home, source, custom_role }}
   */
  async effectiveFor({ id, role, customRoleId }) {
    const key = cacheKey(id);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS && hit.role === role && hit.customRoleId === (customRoleId || null)) {
      return hit.value;
    }
    const [overrideR, customR, roleR] = await Promise.all([
      q('SELECT permissions FROM user_permission_profiles WHERE user_id = $1', [id]),
      customRoleId ? q('SELECT * FROM custom_roles WHERE id = $1', [customRoleId]) : { rows: [] },
      q('SELECT permissions FROM role_permission_profiles WHERE role = $1', [role]),
    ]);
    const override = overrideR.rows[0] || null;
    const custom = roleRow(customR.rows[0]);
    const roleProfile = roleR.rows[0] || null;
    const activeCustom = custom && custom.isActive ? custom : null;
    const effective = R.resolveEffective({
      role,
      userOverride: override && override.permissions,
      customRole: activeCustom && activeCustom.permissions,
      roleProfile: roleProfile && roleProfile.permissions,
    });
    const value = {
      pages: effective.pages,
      home: R.homePath(effective),
      source: override ? 'user' : activeCustom ? 'custom_role' : roleProfile ? 'role_profile' : 'default',
      custom_role: activeCustom ? { id: activeCustom.id, key: activeCustom.key, name: activeCustom.name } : null,
    };
    cache.set(key, { at: Date.now(), role, customRoleId: customRoleId || null, value });
    return value;
  }

  // ── role profiles ──
  async matrix() {
    const [profiles, customRoles] = await Promise.all([
      q('SELECT role, permissions FROM role_permission_profiles'),
      q('SELECT * FROM custom_roles ORDER BY id ASC'),
    ]);
    const stored = new Map(profiles.rows.map(p => [p.role, p]));
    return {
      ...R.registry(),
      roles_detail: R.ROLES.map(role => ({
        identifier: role, label: role[0].toUpperCase() + role.slice(1), type: 'system',
        customized: stored.has(role),
        permissions: R.resolveEffective({ role, roleProfile: stored.get(role) && stored.get(role).permissions }),
      })),
      custom_roles: customRoles.rows.map(c => this.customRoleJson(roleRow(c))),
    };
  }

  async saveRoleProfile(ctx, role, permissions) {
    if (!R.ROLES.includes(role)) throw new ValidationError(`role must be one of ${R.ROLES.join(', ')}`);
    const doc = R.sanitize(permissions);
    await q(
      `INSERT INTO role_permission_profiles (role, permissions) VALUES ($1, $2::jsonb)
       ON CONFLICT (role) DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = ${NOW_UTC}`,
      [role, JSON.stringify(doc)]);
    clearCache();
    await audit(null, ctx, 'rbac.role_profile_saved', 'role', role, { pages: Object.keys(doc.pages).length });
    return { role, permissions: R.resolveEffective({ role, roleProfile: doc }) };
  }

  async resetRoleProfile(ctx, role) {
    if (!R.ROLES.includes(role)) throw new ValidationError(`role must be one of ${R.ROLES.join(', ')}`);
    await q('DELETE FROM role_permission_profiles WHERE role = $1', [role]);
    clearCache();
    await audit(null, ctx, 'rbac.role_profile_reset', 'role', role, {});
    return { role, reset: true, permissions: R.resolveEffective({ role }) };
  }

  // ── custom roles ──
  customRoleJson(c) {
    return {
      id: c.id, key: c.key, name: c.name, description: c.description, base_role: c.baseRole,
      is_active: c.isActive, type: 'custom', identifier: `custom:${c.id}`,
      permissions: R.resolveEffective({ role: c.baseRole, customRole: c.permissions }),
      stored: R.sanitize(c.permissions),
    };
  }

  async createCustomRole(ctx, body) {
    const name = String(body.name || '').trim();
    if (!name) throw new ValidationError('name required');
    const baseRole = body.base_role || body.baseRole || 'agent';
    if (!R.ROLES.includes(baseRole)) throw new ValidationError(`base_role must be one of ${R.ROLES.join(', ')}`);
    const key = slugKey(body.key || name);
    if (!key) throw new ValidationError('name has no usable characters');
    if ((await q('SELECT 1 FROM custom_roles WHERE key = $1', [key])).rows.length) {
      throw new ValidationError(`A custom role with key '${key}' already exists`);
    }
    // New custom roles start from their base role's built-in permissions.
    const permissions = body.permissions ? R.sanitize(body.permissions) : R.defaultProfile(baseRole);
    const r = await q(
      `INSERT INTO custom_roles (key, name, description, base_role, is_active, permissions)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
      [key, name, body.description || null, baseRole, body.is_active !== false, JSON.stringify(permissions)]);
    const c = roleRow(r.rows[0]);
    await audit(null, ctx, 'rbac.custom_role_created', 'custom_role', c.id, { key, name, base_role: baseRole });
    return this.customRoleJson(c);
  }

  async updateCustomRole(ctx, id, body) {
    const curR = await q('SELECT * FROM custom_roles WHERE id = $1', [id]);
    const cur = roleRow(curR.rows[0]);
    if (!cur) throw new NotFoundError('Custom role not found');
    const sets = []; const vals = []; const fields = [];
    const set = (col, v, field, cast = '') => { vals.push(v); sets.push(`${col} = $${vals.length}${cast}`); fields.push(field); };
    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (!n) throw new ValidationError('name cannot be empty');
      set('name', n, 'name');
    }
    if (body.description !== undefined) set('description', body.description || null, 'description');
    if (body.is_active !== undefined) set('is_active', !!body.is_active, 'isActive');
    let newBase = null;
    if (body.base_role !== undefined) {
      if (!R.ROLES.includes(body.base_role)) throw new ValidationError(`base_role must be one of ${R.ROLES.join(', ')}`);
      newBase = body.base_role;
      set('base_role', newBase, 'baseRole');
    }
    if (body.permissions !== undefined) set('permissions', JSON.stringify(R.sanitize(body.permissions)), 'permissions', '::jsonb');
    sets.push(`updated_at = ${NOW_UTC}`);
    vals.push(id);
    const r = await q(`UPDATE custom_roles SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    const c = roleRow(r.rows[0]);
    // Members keep the legacy `users.role` in step with the base role so the
    // API's hard role checks and the permission profile agree.
    if (newBase && newBase !== cur.baseRole) {
      await q('UPDATE users SET role = $1 WHERE custom_role_id = $2', [newBase, id]);
    }
    clearCache();
    await audit(null, ctx, 'rbac.custom_role_updated', 'custom_role', id, { fields });
    return this.customRoleJson(c);
  }

  async deleteCustomRole(ctx, id) {
    const curR = await q(
      `SELECT c.*, (SELECT COUNT(*)::int FROM users u WHERE u.custom_role_id = c.id) AS members
         FROM custom_roles c WHERE c.id = $1`, [id]);
    if (!curR.rows.length) throw new NotFoundError('Custom role not found');
    const cur = curR.rows[0];
    // FK is ON DELETE SET NULL: members fall back to their system role's profile.
    await q('DELETE FROM custom_roles WHERE id = $1', [id]);
    clearCache();
    await audit(null, ctx, 'rbac.custom_role_deleted', 'custom_role', id, { key: cur.key, members_detached: cur.members });
    return { id, deleted: true, members_detached: cur.members };
  }

  // ── per-user ──
  async listUsers() {
    const r = await q(
      `SELECT u.id, u.name, u.email, u.role, u.custom_role_id,
              cr.id AS cr_id, cr.name AS cr_name, (p.id IS NOT NULL) AS has_override
         FROM users u
         LEFT JOIN custom_roles cr ON cr.id = u.custom_role_id
         LEFT JOIN user_permission_profiles p ON p.user_id = u.id
        WHERE u.is_active = true
        ORDER BY u.id ASC`);
    return r.rows.map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      custom_role: u.cr_id ? { id: u.cr_id, name: u.cr_name } : null,
      has_override: !!u.has_override,
    }));
  }

  async userPermissions(userId) {
    const ur = await q('SELECT id, name, email, role, custom_role_id FROM users WHERE id = $1', [userId]);
    const u = ur.rows[0];
    if (!u) throw new NotFoundError('User not found');
    const pr = await q('SELECT permissions FROM user_permission_profiles WHERE user_id = $1', [userId]);
    const profile = pr.rows[0] || null;
    const eff = await this.effectiveFor({ id: u.id, role: u.role || 'agent', customRoleId: u.custom_role_id });
    return {
      user: { id: u.id, name: u.name, email: u.email, role: u.role, custom_role_id: u.custom_role_id },
      has_override: !!profile,
      override: profile ? R.sanitize(profile.permissions) : null,
      effective: { pages: eff.pages, home: eff.home, source: eff.source },
    };
  }

  async saveUserOverride(ctx, userId, permissions) {
    await this.requireUser(userId);
    const doc = R.sanitize(permissions);
    await q(
      `INSERT INTO user_permission_profiles (user_id, permissions) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = ${NOW_UTC}`,
      [userId, JSON.stringify(doc)]);
    clearCache();
    await audit(null, ctx, 'rbac.user_override_saved', 'user', userId, { pages: Object.keys(doc.pages).length });
    return this.userPermissions(userId);
  }

  async resetUserOverride(ctx, userId) {
    await this.requireUser(userId);
    await q('DELETE FROM user_permission_profiles WHERE user_id = $1', [userId]);
    clearCache();
    await audit(null, ctx, 'rbac.user_override_reset', 'user', userId, {});
    return this.userPermissions(userId);
  }

  async requireUser(userId) {
    const r = await q('SELECT id FROM users WHERE id = $1', [userId]);
    if (!r.rows.length) throw new NotFoundError('User not found');
  }

  async assignCustomRole(ctx, userId, customRoleId) {
    await this.requireUser(userId);
    let customId = null; let role;
    if (!(customRoleId === null || customRoleId === undefined || customRoleId === '')) {
      const id = parseInt(customRoleId);
      const c = Number.isInteger(id) ? roleRow((await q('SELECT * FROM custom_roles WHERE id = $1', [id])).rows[0]) : null;
      if (!c) throw new AppError(400, 'Unknown custom role');
      if (!c.isActive) throw new AppError(400, 'That custom role is inactive');
      if (userId === parseInt(ctx.userId) && c.baseRole !== 'admin') {
        throw new AppError(400, 'You cannot move your own account to a non-admin role');
      }
      // Keep the system role aligned with the custom role's base role.
      customId = c.id; role = c.baseRole;
    }
    if (role !== undefined) await q('UPDATE users SET custom_role_id = $1, role = $2 WHERE id = $3', [customId, role, userId]);
    else await q('UPDATE users SET custom_role_id = NULL WHERE id = $1', [userId]);
    clearCache();
    await audit(null, ctx, 'rbac.user_custom_role_set', 'user', userId, { custom_role_id: customId, role });
    return this.userPermissions(userId);
  }
}

module.exports = new RbacService();
module.exports.clearCache = clearCache;
