'use strict';

const { q } = require('../config/db');
const { ValidationError, NotFoundError } = require('../exceptions');
const { audit } = require('../utils/audit');

/*
 * Telecaller name map. The sheet's "Tellecaller Name" is free text; this table
 * lets an admin BIND a spelling to a real user so the binding survives the next
 * import instead of being re-guessed. Unmatched names stay listed (never handed
 * to a random agent).
 */
class TelecallerMapService {
  // Resolution order (deliberate):
  //   1. an EXPLICIT binding in lead_telecaller_map
  //   2. case-insensitive match on a user's name
  //   3. nothing → UNASSIGNED
  // `run` is a query FUNCTION (the shape tx() hands out), so the whole import
  // stays on one connection.
  async resolveName(run, rawName) {
    const name = String(rawName || '').trim();
    if (!name) return { user_id: null, source: null };

    const explicit = await run(
      `SELECT user_id FROM lead_telecaller_map
        WHERE lower(btrim(name)) = lower(btrim($1))`, [name]);
    if (explicit.rows.length && explicit.rows[0].user_id) {
      return { user_id: explicit.rows[0].user_id, source: 'explicit_binding' };
    }

    const byName = await run(
      'SELECT id FROM users WHERE lower(btrim(name)) = lower(btrim($1)) AND is_active = true LIMIT 1', [name]);
    if (byName.rows.length) return { user_id: byName.rows[0].id, source: 'name_match' };

    return { user_id: null, source: null };
  }

  // Resolve a name once per distinct name per request, then reuse.
  makeResolver(run) {
    const cache = new Map();
    return async raw => {
      const name = String(raw || '').trim();
      if (!cache.has(name)) cache.set(name, await this.resolveName(run, name));
      return { name, ...cache.get(name) };
    };
  }

  async list() {
    const m = await q(
      `SELECT m.name, m.user_id, m.created_at, u.name AS user_name, u.email AS user_email
         FROM lead_telecaller_map m
         LEFT JOIN users u ON u.id = m.user_id
        ORDER BY lower(m.name)`);
    const un = await q(
      `SELECT name, leads_count, last_seen_at FROM lead_telecaller_unmatched
        ORDER BY leads_count DESC, lower(name) LIMIT 500`);
    const matched = new Set(m.rows.map(r => r.name.toLowerCase().trim()));
    return {
      bindings: m.rows.map(r => ({
        name: r.name, user_id: r.user_id, user_name: r.user_name,
        user_email: r.user_email, created_at: r.created_at,
      })),
      // Names an admin still has to decide about. One that has since been bound
      // drops off this list.
      unmatched_names: un.rows.filter(r => !matched.has(r.name.toLowerCase().trim()))
        .map(r => ({ name: r.name, leads_count: r.leads_count, last_seen_at: r.last_seen_at })),
    };
  }

  // Bind a spreadsheet name to a user, or unbind it with user_id = null.
  async bind(ctx, body) {
    const b = body || {};
    const name = String(b.name || '').trim();
    if (!name) throw new ValidationError('name required');
    const unbind = b.user_id === null || b.user_id === undefined || b.user_id === '' || b.unbind === true;

    if (unbind) {
      const d = await q('DELETE FROM lead_telecaller_map WHERE lower(btrim(name)) = lower(btrim($1)) RETURNING name', [name]);
      await audit(null, ctx, 'lead.telecaller_unbound', 'lead_telecaller_map', null, { name });
      return { name, bound: false, removed: d.rows.length > 0 };
    }

    const uid = parseInt(b.user_id);
    if (!Number.isFinite(uid)) throw new ValidationError('user_id must be a number, or null to unbind');
    const u = await q('SELECT id, name, email, is_active FROM users WHERE id = $1', [uid]);
    if (!u.rows.length) throw new NotFoundError('No such user');
    if (!u.rows[0].is_active) throw new ValidationError('That user is deactivated');

    const r = await q(
      `INSERT INTO lead_telecaller_map (name, user_id) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()
       RETURNING *`, [name, uid]);
    await q('DELETE FROM lead_telecaller_unmatched WHERE lower(btrim(name)) = lower(btrim($1))', [name]);
    await audit(null, ctx, 'lead.telecaller_bound', 'lead_telecaller_map', null,
      { name, user_id: uid, user_name: u.rows[0].name });
    return { name: r.rows[0].name, user_id: r.rows[0].user_id, bound: true, created_at: r.rows[0].created_at };
  }
}

module.exports = new TelecallerMapService();
