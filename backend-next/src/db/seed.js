'use strict';

// Idempotent reference data + first-admin bootstrap. Schema lives in Prisma
// migrations; this file only inserts rows. Safe to run on every start: every
// insert is ON CONFLICT DO NOTHING so an admin's retune is never clobbered.

const { OTP_ONLY_HASH } = require('../utils/passwords');
const { pool } = require('../config/db');
const Directory = require('../platform/Directory');

// The kanban columns are data, not an enum: sales teams add their own.
// leads.status stores the stage SLUG.
const DEFAULT_STAGES = [
  ['New', 'new', 0, '#3b82f6', false, false, 5],
  ['Contacted', 'contacted', 1, '#8b5cf6', false, false, 20],
  ['Qualified', 'qualified', 2, '#0ea5e9', false, false, 40],
  ['Proposal', 'proposal', 3, '#f59e0b', false, false, 70],
  ['Won', 'won', 4, '#22c55e', true, false, 100],
  ['Lost', 'lost', 5, '#ef4444', false, true, 0],
];

// The 9 rows exactly as LEADS_SPEC.md records them (the sheet's Settings tab).
const DEFAULT_STATUS_RULES = [
  ['Not Answered',                 'notanswered',                 25, true,  0.03, 'Retry call at a different time of day',                 false, false, false, 1],
  ['Under Consideration',          'underconsideration',          60, true,  0.15, 'Follow up on WhatsApp and confirm a demo slot',         true,  false, false, 2],
  ['Interested',                   'interested',                   80, true,  0.30, 'Book the demo',                                        true,  true,  false, 3],
  ['Not Interested',               'notinterested',                 0, false, 0.00, 'Closed – no action',                                   true,  false, false, 4],
  ['Call Back Later',              'callbacklater',                40, true,  0.08, 'Call back at the promised time',                       true,  false, false, 5],
  ['Demo Done',                    'demodone',                     90, true,  0.50, 'Close the deal – share payment link / onboard',         true,  true,  true,  6],
  ['Converted',                    'converted',                   100, false, 1.00, 'Won – support & onboarding',                          true,  true,  true,  7],
  ['Switched Off / Invalid Number','switchedoffinvalidnumber',      0, false, 0.00, 'Verify the number or drop the lead',                   false, false, false, 8],
  ['(Not called yet)',             'notcalledyet',                 10, true,  0.01, 'Make the first call',                                 false, false, false, 9],
  // Not in the sheet: set automatically when a call to the lead was answered but nobody has recorded the outcome yet.
  ['Called',                       'called',                       30, true,  0.02, 'Record the outcome of the call',                      true,  false, false, 10],
];

const DEFAULT_SCORING_SETTINGS = [
  ['plan_price',              499, '₹ per conversion (weighted pipeline)'],
  ['daily_call_target',        60, 'calls per telecaller per day'],
  ['hot_threshold',            80, 'tier = Hot at or above this score'],
  ['warm_threshold',           50, 'tier = Warm at or above this score'],
  ['followup_urgency_bonus',   30, 'added when a follow-up is Overdue'],
  ['this_week_days',            7, 'follow-up window width for "This Week"'],
];

// Runs inside ONE customer's context. `bootstrapEmail`/`customerId` are given only for the customer that has no
// owner yet (customer #1 on a fresh install); customers created from the platform console get their owner
// at creation time and are seeded with reference data only.
async function seed({ bootstrapEmail = null, customerId = null } = {}) {
  const BOOTSTRAP_ADMIN_EMAIL = bootstrapEmail;
  const client = await pool.connect();
  try {
    for (const [name, slug, position, color, isWon, isLost, probability] of DEFAULT_STAGES) {
      await client.query(
        `INSERT INTO pipeline_stages (name, slug, position, color, is_won, is_lost, probability)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (slug) DO NOTHING`,
        [name, slug, position, color, isWon, isLost, probability]);
    }

    for (const r of DEFAULT_STATUS_RULES) {
      await client.query(
        `INSERT INTO lead_status_rules
           (call_status, status_key, base_priority, active_pipeline, win_prob,
            next_action, reached, interested_plus, demo_plus, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (status_key) DO NOTHING`,
        r);
    }

    for (const [k, v, d] of DEFAULT_SCORING_SETTINGS) {
      await client.query(
        `INSERT INTO lead_scoring_settings (key, value, description) VALUES ($1,$2,$3)
         ON CONFLICT (key) DO NOTHING`, [k, v, d]);
    }

    // Backfill: leads assigned before lead_assignees existed have an
    // assigned_to but no owner row. Without this the very first syncLeadOwner()
    // on such a lead would NULL the column and silently orphan the lead.
    await client.query(
      `INSERT INTO lead_assignees (lead_id, user_id, role, assigned_by)
       SELECT l.id, l.assigned_to, 'owner', l.owner_id
         FROM leads l
        WHERE l.assigned_to IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM lead_assignees la WHERE la.lead_id = l.id)
       ON CONFLICT (lead_id, user_id) DO NOTHING`);

    // ─── First-admin bootstrap ───
    // Runs only when the database has no active admin. This is the ONLY place an
    // admin account is ever created implicitly, and it is driven purely by env
    // vars set by the operator — never by an inbound request. If the env vars
    // are missing the install simply has no admin until one is invited, which is
    // the safe direction to fail.
    const adminCount = await client.query(
      `SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_active = true`);
    if (adminCount.rows[0].n === 0 && customerId !== null) {
      if (BOOTSTRAP_ADMIN_EMAIL) {
        const hash = OTP_ONLY_HASH;
        const existing = await client.query('SELECT id,role,is_active FROM users WHERE email = $1', [BOOTSTRAP_ADMIN_EMAIL]);
        if (existing.rows.length === 0) {
          await Directory.register(BOOTSTRAP_ADMIN_EMAIL, customerId);
          await client.query(
            `INSERT INTO users (email, password_hash, name, role, is_active)
             VALUES ($1,$2,$3,'admin',true)`,
            [BOOTSTRAP_ADMIN_EMAIL, hash, 'Bootstrap Administrator']);
          // Loud on purpose: an operator must never have to guess which account
          // holds admin, or whether one was created at all.
          console.log('┌──────────────────────────────────────────────────────────────┐');
          console.log(`│ BOOTSTRAP ADMIN CREATED: ${BOOTSTRAP_ADMIN_EMAIL.padEnd(45)}│`);
          console.log('│ Sign in with the 6-digit code emailed to this address.       │');
          console.log('└──────────────────────────────────────────────────────────────┘');
          await client.query(
            `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, ip)
             VALUES (NULL,'user.bootstrap_admin','user',NULL,$1,NULL)`,
            [JSON.stringify({ email: BOOTSTRAP_ADMIN_EMAIL, path: 'bootstrap' })]);
        } else {
          // The account exists but holds no admin role (e.g. it was demoted).
          // Promote rather than create a second account on the same address.
          await client.query(
            `UPDATE users SET role = 'admin', is_active = true WHERE id = $1`, [existing.rows[0].id]);
          console.log(`BOOTSTRAP: promoted existing account ${BOOTSTRAP_ADMIN_EMAIL} to admin (no active admin existed)`);
          await client.query(
            `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, ip)
             VALUES (NULL,'user.bootstrap_admin_promoted','user',$1,$2,NULL)`,
            [String(existing.rows[0].id), JSON.stringify({ email: BOOTSTRAP_ADMIN_EMAIL, path: 'bootstrap' })]);
        }
      } else {
        console.warn('WARNING: no active admin exists and BOOTSTRAP_ADMIN_EMAIL is unset.');
        console.warn('         Registration is closed, so NOBODY can log in. Set the env vars and restart,');
        console.warn('         or insert an admin row directly into the database.');
      }
    }
  } finally { client.release(); }
}

module.exports = { seed };
