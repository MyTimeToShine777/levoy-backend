'use strict';

const crypto = require('crypto');
const { pool, q } = require('../config/db');
const { REFRESH_TOKEN_DAYS } = require('../config/env');
const { AuthenticationError } = require('../exceptions');
const { newRefreshToken, hashRefreshToken } = require('../utils/refreshToken');

// Used again within this many seconds, an old key is taken as a retry (a slow network, two requests at once), not as theft.
const RETRY_GRACE_SECONDS = 10;
const ENDED = 'Your sign-in ended. Sign in again.';

// Every date below is worked out inside the database (NOW()), so the server's own time zone cannot change the result.
// All of these run inside one company's database context (the caller sets it up).
class RefreshTokenService {
  // The first key of a new sign-in (it starts a new family).
  async issue(userId, customerId) {
    const token = newRefreshToken(customerId);
    await q(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + make_interval(days => $4))`,
      [userId, crypto.randomUUID(), hashRefreshToken(token), REFRESH_TOKEN_DAYS]);
    // tidy up: keys that ran out more than a day ago are of no use to anyone
    await q(`DELETE FROM refresh_tokens WHERE user_id = $1 AND expires_at < NOW() - interval '1 day'`, [userId]);
    return token;
  }

  // Swap a key for the next one. Returns { userId, token } or throws "sign-in ended".
  async rotate(oldToken, customerId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // FOR UPDATE: two requests with the same key take turns instead of both passing the checks together.
      const r = await client.query(
        `SELECT id, user_id, family_id, revoked_at IS NOT NULL AS revoked, expires_at <= NOW() AS expired,
                used_at IS NOT NULL AS used, used_at > NOW() - make_interval(secs => $2) AS in_grace
           FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
        [hashRefreshToken(oldToken), RETRY_GRACE_SECONDS]);
      const t = r.rows[0];
      if (!t || t.revoked || t.expired) { await client.query('ROLLBACK'); throw new AuthenticationError(ENDED); }
      if (t.used && !t.in_grace) {
        // An old key came back after it was replaced: someone may have copied it. Cancel everything from this sign-in.
        await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL', [t.family_id]);
        await client.query('COMMIT');
        throw new AuthenticationError(ENDED);
      }
      if (!t.used) await client.query('UPDATE refresh_tokens SET used_at = NOW() WHERE id = $1', [t.id]);
      const next = newRefreshToken(customerId);
      await client.query(
        `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + make_interval(days => $4))`,
        [t.user_id, t.family_id, hashRefreshToken(next), REFRESH_TOKEN_DAYS]);
      await client.query('COMMIT');
      return { userId: t.user_id, token: next };
    } catch (e) {
      if (!(e instanceof AuthenticationError)) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { client.release(); }
  }

  // Cancel the whole sign-in this key belongs to (signing out, or the person was switched off).
  async revokeFamilyOf(token) {
    await q(
      `UPDATE refresh_tokens SET revoked_at = NOW()
        WHERE revoked_at IS NULL AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
      [hashRefreshToken(token)]);
  }
}

module.exports = new RefreshTokenService();
