'use strict';

const { pq } = require('../config/db');
const { ConflictError } = require('../exceptions');

const norm = e => String(e || '').toLowerCase().trim();

// The sign-in directory (platform.workspace_users): which customer an email belongs to. One email belongs to
// exactly one customer, so the same address can never exist in two workspaces.
class Directory {
  /** @returns {Promise<number|null>} the customer id, or null when the email is unknown. */
  async lookup(email) {
    const r = await pq('SELECT customer_id FROM workspace_users WHERE email = $1', [norm(email)]);
    return r.rows.length ? r.rows[0].customer_id : null;
  }

  /** Claim an address for a customer. Throws when another customer already owns it. */
  async register(email, customerId) {
    const e = norm(email);
    const r = await pq(
      `INSERT INTO workspace_users (email, customer_id) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING customer_id`, [e, customerId]);
    if (r.rows[0].customer_id !== customerId) throw new ConflictError('Email already registered');
  }

  async unregister(email, customerId) {
    await pq('DELETE FROM workspace_users WHERE email = $1 AND customer_id = $2', [norm(email), customerId]);
  }

  /** An address changes: claim the new one first (so a clash fails before anything moves), then drop the old. */
  async rename(oldEmail, newEmail, customerId) {
    if (norm(oldEmail) === norm(newEmail)) return;
    await this.register(newEmail, customerId);
    await this.unregister(oldEmail, customerId);
  }

  /** Bring the directory in line with a customer's actual users (startup repair; never overwrites another customer's claim). */
  async sync(customerId, emails) {
    let clashes = 0;
    for (const e of emails) {
      const r = await pq(
        `INSERT INTO workspace_users (email, customer_id) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING customer_id`, [norm(e), customerId]);
      if (r.rows[0].customer_id !== customerId) { clashes++; console.warn(`Directory: ${norm(e)} is claimed by customer ${r.rows[0].customer_id}, not ${customerId}`); }
    }
    return { clashes };
  }
}

module.exports = new Directory();
