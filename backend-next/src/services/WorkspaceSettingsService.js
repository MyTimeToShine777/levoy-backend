'use strict';

const { q } = require('../config/db');
const { ValidationError } = require('../exceptions');
const { audit } = require('../utils/audit');

// Workspace-wide settings. Stored as text rows; every read returns the right type, falling back to the
// default so a missing row never breaks a report.
const DEFAULTS = {
  idle_gap_minutes: 15,            // a pause longer than this between calls is a break (working hours)
  billing_enabled: 0,
  billing_cycle_day: 1,            // day of the month a bill starts (1–28)
  billing_rate_per_minute: 1,      // price of a minute of a call
  billing_pulse_seconds: 60,       // billed in blocks of this many seconds (60 = per started minute, 1 = per second)
  billing_charge_incoming: 0,      // 1 = incoming calls cost money too
  billing_currency: '₹',
  // shown in the phone app (More screen / Help & Support); blank = the button is hidden
  support_whatsapp: '',            // phone number for "quick technical support on WhatsApp" (Premium)
  social_twitter: '', social_instagram: '', social_facebook: '', social_telegram: '', social_reddit: '',
  blog_url: '',
};
const TEXT_MAX = { billing_currency: 4, support_whatsapp: 20, social_twitter: 200, social_instagram: 200, social_facebook: 200, social_telegram: 200, social_reddit: 200, blog_url: 200 };
const NUMERIC = new Set(Object.keys(DEFAULTS).filter(k => !(k in TEXT_MAX)));
const LINKS = new Set(['social_twitter', 'social_instagram', 'social_facebook', 'social_telegram', 'social_reddit', 'blog_url']);

class WorkspaceSettingsService {
  async all() {
    const r = await q('SELECT key, value FROM workspace_settings');
    const out = { ...DEFAULTS };
    for (const row of r.rows) {
      if (!(row.key in DEFAULTS)) continue;
      out[row.key] = NUMERIC.has(row.key) ? (Number.isFinite(Number(row.value)) ? Number(row.value) : DEFAULTS[row.key]) : (row.value ?? DEFAULTS[row.key]);
    }
    return out;
  }

  async update(ctx, body) {
    const updates = body && typeof body === 'object' ? body : {};
    const bad = Object.keys(updates).filter(k => !(k in DEFAULTS));
    if (bad.length) throw new ValidationError(`unknown setting(s): ${bad.join(', ')}`, { allowed: Object.keys(DEFAULTS) });
    for (const [k, v] of Object.entries(updates)) {
      let value = v;
      if (NUMERIC.has(k)) {
        value = Number(v);
        if (!Number.isFinite(value) || value < 0) throw new ValidationError(`'${k}' must be a non-negative number`);
        if (k === 'billing_cycle_day' && (value < 1 || value > 28)) throw new ValidationError('billing_cycle_day must be 1–28');
        if (k === 'billing_pulse_seconds' && value < 1) throw new ValidationError('billing_pulse_seconds must be at least 1');
        if (k === 'idle_gap_minutes' && value < 1) throw new ValidationError('idle_gap_minutes must be at least 1');
      } else {
        value = String(v ?? '').trim().slice(0, TEXT_MAX[k]);
        if (k === 'billing_currency') value = value || DEFAULTS[k];
        // links must be real web addresses: they open in the phone's browser
        if (LINKS.has(k) && value && !/^https:\/\/[^\s]+$/i.test(value)) throw new ValidationError(`'${k}' must be an https:// link`);
        if (k === 'support_whatsapp' && value && value.replace(/\D/g, '').length < 8) throw new ValidationError('support_whatsapp must be a phone number with country code');
      }
      await q(`INSERT INTO workspace_settings (key, value) VALUES ($1, $2)
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [k, String(value)]);
    }
    await audit(null, ctx, 'workspace.settings_updated', 'workspace_settings', null, updates);
    return this.all();
  }
}

module.exports = new WorkspaceSettingsService();
module.exports.DEFAULTS = DEFAULTS;
