'use strict';

const { Client } = require('pg');
const { q, platformPool, runInTenant } = require('../config/db');
const Registry = require('../platform/CustomerRegistry');
const { toTenant } = Registry;
const integrations = require('../config/integrations');
const { ValidationError } = require('../exceptions');

// Push notifications through Firebase Cloud Messaging.
//  • a phone registers its FCM token (POST /api/push/tokens)
//  • every row inserted into `notifications` is announced by a database trigger (LISTEN levoy_notification);
//    this service turns it into a push to that person's phones — so lead assignments, due reminders and
//    anything added later are pushed without each feature knowing about push.
const BAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

class PushService {
  enabled() { return integrations.firebase(); }

  messaging() {
    if (!this._m) {
      const { initializeApp, cert, getApps } = require('firebase-admin/app');
      const { getMessaging } = require('firebase-admin/messaging');
      const existing = getApps().find(a => a.name === 'levoy');
      const app = existing || initializeApp({
        credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: integrations.firebaseKey() }),
      }, 'levoy');
      this._m = getMessaging(app);
    }
    return this._m;
  }

  async register(ctx, body) {
    const token = String((body && body.token) || '').trim();
    if (token.length < 20 || token.length > 4096) throw new ValidationError('token required');
    const name = body.device_name ? String(body.device_name).slice(0, 120) : null;
    const platform = ['android', 'ios', 'web'].includes(body.platform) ? body.platform : 'android';
    // a token belongs to one person: if the phone is handed to someone else, it follows the new sign-in
    await q(
      `INSERT INTO push_tokens (user_id, token, platform, device_name, last_seen_at) VALUES ($1, $2, $3, $4, (NOW() AT TIME ZONE 'UTC'))
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, device_name = COALESCE(EXCLUDED.device_name, push_tokens.device_name), last_seen_at = (NOW() AT TIME ZONE 'UTC')`,
      [parseInt(ctx.userId), token, platform, name]);
    return { registered: true, push_enabled: this.enabled() };
  }

  async unregister(ctx, token) {
    await q('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [String(token || ''), parseInt(ctx.userId)]);
    return { registered: false };
  }

  async tokensOf(userId) {
    const r = await q('SELECT token FROM push_tokens WHERE user_id = $1', [userId]);
    return r.rows.map(x => x.token);
  }

  async wanted(userId) {
    const r = await q("SELECT value FROM user_settings WHERE user_id = $1 AND key = 'push_notifications'", [userId]);
    return !(r.rows[0] && String(r.rows[0].value).toLowerCase() === 'false');
  }

  // Send to every phone of one person. Never throws: a push is a courtesy, the notification row is the record.
  async send(userId, { title, body, data }) {
    if (!this.enabled()) return { sent: 0, skipped: 'push is not configured' };
    try {
      if (!(await this.wanted(userId))) return { sent: 0, skipped: 'turned off by the user' };
      const tokens = await this.tokensOf(userId);
      if (!tokens.length) return { sent: 0, skipped: 'no phones registered' };
      const flat = {};
      for (const [k, v] of Object.entries(data || {})) if (v !== null && v !== undefined) flat[k] = typeof v === 'string' ? v : JSON.stringify(v);
      const res = await this.messaging().sendEachForMulticast({
        tokens, notification: { title: String(title || 'Callio').slice(0, 120), body: String(body || '').slice(0, 300) }, data: flat,
        android: { priority: 'high', notification: { channelId: 'levoy_alerts' } },
      });
      const dead = [];
      res.responses.forEach((r, i) => { if (!r.success && BAD_TOKEN.has(r.error && r.error.code)) dead.push(tokens[i]); });
      if (dead.length) await q('DELETE FROM push_tokens WHERE token = ANY($1)', [dead]);
      return { sent: res.successCount, failed: res.failureCount, removed: dead.length };
    } catch (e) {
      console.error('Push failed:', e.message);
      return { sent: 0, error: e.message };
    }
  }

  // Wait for the database to announce new notifications. Reconnects by itself.
  startListener() {
    if (!this.enabled() || this._listening) return;
    this._listening = true;
    const connect = () => {
      const c = new Client(platformPool().options);
      let closed = false;
      const retry = () => { if (closed) return; closed = true; c.end().catch(() => {}); setTimeout(connect, 5000); };
      c.on('error', retry); c.on('end', retry);
      // One LISTEN sees every customer's notifications (the channel is database-wide); the payload says
      // which customer's schema it came from, and the push is sent from inside that customer's context.
      c.on('notification', async msg => {
        try {
          const n = JSON.parse(msg.payload);
          const cust = n.schema ? await Registry.bySchema(n.schema) : null;
          if (!cust) return;
          await runInTenant(toTenant(cust), () => this.send(n.user_id, { title: n.title, body: n.message, data: { type: n.type, notification_id: n.id, ...(n.data && typeof n.data === 'object' ? n.data : {}) } }));
        } catch (e) { console.error('Bad notification payload:', e.message); }
      });
      c.connect().then(() => c.query('LISTEN levoy_notification')).catch(retry);
      this._client = c;
    };
    connect();
  }

  async stop() { this._listening = false; if (this._client) await this._client.end().catch(() => {}); }

  // Tokens nobody has used for two months belong to phones that are gone.
  async purgeStale() {
    const r = await q("DELETE FROM push_tokens WHERE last_seen_at < (NOW() AT TIME ZONE 'UTC') - interval '60 days'");
    return r.rowCount;
  }
}

module.exports = new PushService();
