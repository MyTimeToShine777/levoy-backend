'use strict';

const { q, currentTenant } = require('../config/db');
const Directory = require('../platform/Directory');
const Storage = require('./StorageService');
const { ValidationError, NotFoundError } = require('../exceptions');

const PROFILE_COLS = 'id,email,name,phone,role,is_active,avatar_url,created_at';
const toMap = rows => rows.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});

// The signed-in user's own profile and key/value settings (time format, theme…).
class ProfileService {
  async me(ctx) {
    const r = await q(`SELECT ${PROFILE_COLS} FROM users WHERE id = $1`, [ctx.userId]);
    if (r.rows.length === 0) throw new NotFoundError('Not found');
    const u = r.rows[0];
    const settings = await q('SELECT key, value FROM user_settings WHERE user_id = $1', [ctx.userId]);
    return {
      id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role,
      is_active: u.is_active, avatar_url: u.avatar_url, created_at: u.created_at,
      settings: toMap(settings.rows),
    };
  }

  async updateMe(ctx, body) {
    const { name, phone, email } = body;
    let moved = null;
    const oldEmail = (await q('SELECT email FROM users WHERE id = $1', [ctx.userId])).rows[0].email;
    if (email && email !== oldEmail) {
      const ex = await q('SELECT id FROM users WHERE email = $1', [email]);
      if (ex.rows.length > 0) throw new ValidationError('Email already in use');
      // The sign-in directory is shared by all customers: claim the new address first (fails if another
      // customer has it), and release the old one only once the user row has really changed.
      try { await Directory.register(email, currentTenant().id); }
      catch (e) { throw new ValidationError('Email already in use'); }
      moved = { from: oldEmail, to: email };
    }
    const fields = [];
    const vals = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx}`); vals.push(name); idx++; }
    if (phone !== undefined) { fields.push(`phone = $${idx}`); vals.push(phone); idx++; }
    if (email !== undefined) { fields.push(`email = $${idx}`); vals.push(email); idx++; }
    if (fields.length > 0) {
      vals.push(ctx.userId);
      try { await q(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, vals); }
      catch (e) { if (moved) await Directory.unregister(moved.to, currentTenant().id).catch(() => {}); throw e; }
    }
    if (moved) await Directory.unregister(moved.from, currentTenant().id);
    const u = await q(`SELECT ${PROFILE_COLS} FROM users WHERE id = $1`, [ctx.userId]);
    const x = u.rows[0];
    return { id: x.id, email: x.email, name: x.name, phone: x.phone, role: x.role, is_active: x.is_active, avatar_url: x.avatar_url, created_at: x.created_at };
  }

  async setAvatar(ctx, file) {
    if (!file) throw new ValidationError('No file uploaded');
    const url = `/uploads/avatars/${file.filename}`;
    await Storage.persist(url);
    await q('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, ctx.userId]);
    return { avatar_url: url };
  }

  async getSettings(ctx) {
    const r = await q('SELECT key, value FROM user_settings WHERE user_id = $1', [ctx.userId]);
    return toMap(r.rows);
  }

  async putSettings(ctx, body) {
    const { settings } = body;
    if (!settings || typeof settings !== 'object') throw new ValidationError('settings object required');
    for (const [key, value] of Object.entries(settings)) {
      await q('INSERT INTO user_settings (user_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (user_id, key) DO UPDATE SET value = $3',
        [ctx.userId, key, String(value ?? '')]);
    }
    return this.getSettings(ctx);
  }
}

module.exports = new ProfileService();
