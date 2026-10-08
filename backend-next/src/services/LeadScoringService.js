'use strict';

const { q, tx } = require('../config/db');
const {
  CALL_STATUS_TO_STAGE, NOT_CALLED_KEY, SCORING_SETTING_DEFAULTS, FOLLOWUP_WINDOWS,
} = require('../config/leadEngine');
const { ValidationError, NotFoundError, ConflictError, AppError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { cleanPhone } = require('../utils/phone');
const { MS_PER_DAY, utcMidnight, parseLeadDate, toDateStr } = require('../utils/dates');
const { statusKey } = require('../utils/leadMath');
const { visibleSql } = require('../utils/leadAccess');

/*
 * The derived-lead engine (LEADS_SPEC.md):
 *
 *   priority_score = base_priority(call_status)                  [lead_status_rules]
 *                  + followup_urgency_bonus IF window = Overdue  [lead_scoring_settings]
 *   tier           = Hot if score >= hot_threshold, Warm if >= warm_threshold, else Closed
 *
 * Worked example straight from the spec: Interested (base 80) whose follow-up has
 * lapsed scores 80 + 30 = 110 — the 110 the user's own sheet contains.
 */
class LeadScoringService {
  // Reads the two settings tables. `runner` is optional and accepts EITHER a query
  // function (what tx() hands out, so the read joins that transaction) OR a pg
  // client ({query}). Both are normalised here, once.
  async loadConfig(runner) {
    let run;
    if (typeof runner === 'function') run = runner;
    else if (runner && typeof runner.query === 'function') run = (t, p) => runner.query(t, p);
    else run = (t, p) => q(t, p);

    const rulesR = await run('SELECT * FROM lead_status_rules ORDER BY sort_order, call_status');
    const setR = await run('SELECT * FROM lead_scoring_settings');

    const byKey = new Map();
    for (const r of rulesR.rows) byKey.set(r.status_key, r);

    // Every setting is coerced to a real Number HERE, once. Postgres NUMERIC
    // arrives as a string, and `110 >= "95"` is a TypeError in JS, not a compare.
    const settings = {};
    const missing = [];
    for (const k of Object.keys(SCORING_SETTING_DEFAULTS)) settings[k] = null;
    for (const row of setR.rows) settings[row.key] = Number(row.value);
    for (const k of Object.keys(SCORING_SETTING_DEFAULTS)) {
      if (!Number.isFinite(settings[k])) { missing.push(k); settings[k] = SCORING_SETTING_DEFAULTS[k]; }
    }
    if (missing.length) {
      console.warn(`[lead-engine] scoring settings missing from DB (${missing.join(', ')}); using spec defaults`);
    }

    // A missing not-called row would otherwise score every untouched lead 0 and
    // silently empty the queue, so it is called out loudly.
    let fallback = byKey.get(NOT_CALLED_KEY) || null;
    if (!fallback) {
      console.warn('[lead-engine] lead_status_rules has no not-called row; uncalled leads score 0');
      fallback = {
        call_status: '(Not called yet)', status_key: NOT_CALLED_KEY, base_priority: 0,
        active_pipeline: false, win_prob: 0, next_action: 'Verify the lead status — no rule configured',
        reached: false, interested_plus: false, demo_plus: false,
      };
    }
    return { byKey, settings, fallback, rules: rulesR.rows };
  }

  ruleFor(cfg, callStatus) {
    return cfg.byKey.get(statusKey(callStatus)) || cfg.fallback;
  }

  // Pure: no I/O. `ctx.today` is a UTC-midnight Date.
  computeDerived(input, cfg, ctx) {
    const today = ctx.today;
    const s = cfg.settings;
    const rule = this.ruleFor(cfg, input.call_status);
    const callKey = statusKey(input.call_status);

    const phoneClean = cleanPhone(input.phone_number);
    const followup = parseLeadDate(input.followup_date);

    // "Closed" means there is no work to chase: either the status is out of the
    // active pipeline, or nobody ever scheduled a follow-up.
    let window;
    if (!rule.active_pipeline) window = 'Closed';
    else if (!followup) window = 'Closed';
    else {
      const days = Math.round((followup.getTime() - today.getTime()) / MS_PER_DAY);
      if (days < 0) window = 'Overdue';
      else if (days === 0) window = 'Due Today';
      else if (days <= Number(s.this_week_days)) window = 'This Week';
      else window = 'Upcoming';
    }

    const base = Number(rule.base_priority) || 0;
    // Settings tab: "Follow-up urgency bonus — added when a follow-up is overdue OR due today".
    const bonus = (window === 'Overdue' || window === 'Due Today') ? (Number(s.followup_urgency_bonus) || 0) : 0;
    const score = base + bonus;

    // The sheet's tiers: Hot / Warm for live leads at or above the thresholds, Cool for a live lead
    // below "warm" (a brand-new lead is Cool, not Closed), Won for a 100% status, Closed for the rest.
    const hot = Number(s.hot_threshold);
    const warm = Number(s.warm_threshold);
    let tier;
    if (!rule.active_pipeline) tier = Number(rule.win_prob) >= 1 ? 'Won' : 'Closed';
    else tier = score >= hot ? 'Hot' : score >= warm ? 'Warm' : 'Cool';

    // Days since the last call: the sheet's own column when present, else the
    // CRM's contact log. Null means "never called" — different from 0.
    const calledOn = parseLeadDate(input.call_attempted_date);
    const touched = calledOn || parseLeadDate(input.last_contacted_at);
    const daysSince = touched ? Math.floor((today.getTime() - touched.getTime()) / MS_PER_DAY) : null;

    const issues = [];
    if (!input.phone_number) issues.push('NO_PHONE');
    else if (!phoneClean) issues.push('PHONE_UNFIXABLE');
    if (input.followup_date && !followup) issues.push('FOLLOWUP_DATE_UNPARSED');
    if (input.call_attempted_date && !calledOn) issues.push('CALL_DATE_UNPARSED');
    if (!callKey) issues.push('NO_CALL_STATUS');
    else if (!cfg.byKey.has(callKey)) issues.push('STATUS_NOT_IN_CONFIG');
    if (!input.customer_name && !input.pharmacy_name) issues.push('NO_CUSTOMER_NAME');
    if (input.is_duplicate) issues.push('DUPLICATE_PHONE');

    return {
      phone_clean: phoneClean,
      followup_clean: toDateStr(followup),
      is_active_lead: !!rule.active_pipeline,
      followup_window: window,
      days_since_last_call: daysSince,
      priority_score: score,
      base_priority: base,
      urgency_bonus: bonus,
      tier,
      // A duplicate is not worked: the sheet tells the telecaller to skip it.
      next_best_action: input.is_duplicate ? 'Duplicate – skip' : rule.next_action,
      win_probability: Number(rule.win_prob) || 0,
      status_key: callKey,
      pipeline_stage: CALL_STATUS_TO_STAGE[callKey] || null,
      data_check: issues.length ? issues.join(';') : 'ok',
    };
  }

  // ── enrichment ──
  // Computes the 12 derived columns for existing leads and shows the result
  // WITHOUT writing: operators want to see what a retune would do first.
  async enrichmentPreview(ctx, query) {
    const limit = Math.min(Math.max(parseInt(query.limit) || 200, 1), 1000);
    const params = [];
    const where = ' WHERE 1=1' + visibleSql(ctx, 'l', params);

    const cfg = await this.loadConfig();
    const today = utcMidnight(new Date());

    const r = await q(
      `SELECT l.id, l.name, l.customer_name, l.pharmacy_name, l.locality, l.phone,
              l.call_status, l.call_attempted_date, l.followup_date, l.last_contacted_at,
              l.telecaller_name, l.assigned_to, l.segment,
              l.phone_clean, l.is_duplicate, l.followup_clean, l.is_active_lead,
              l.followup_window, l.days_since_last_call, l.priority_score, l.tier,
              l.next_best_action, l.data_check,
              -- dates as TEXT: node-postgres turns DATE into a local-midnight Date, which the engine would
              -- read one day early anywhere east of UTC
              l.call_attempted_date::text AS call_attempted_txt, l.followup_date::text AS followup_txt,
              l.last_contacted_at::text AS last_contacted_txt
         FROM leads l
        ${where}
          AND l.merged_into_lead_id IS NULL
          AND l.deleted_at IS NULL
        ORDER BY l.id
        LIMIT ${limit}`, params);

    let would_change = 0;
    const rows = r.rows.map(l => {
      const d = this.computeDerived({
        phone_number: l.phone,
        call_attempted_date: l.call_attempted_txt,
        followup_date: l.followup_txt,
        last_contacted_at: l.last_contacted_txt,
        call_status: l.call_status,
        customer_name: l.customer_name || l.name,
        pharmacy_name: l.pharmacy_name,
        is_duplicate: l.is_duplicate,
      }, cfg, { today });

      const changed =
        l.priority_score !== d.priority_score ||
        l.tier !== d.tier ||
        l.followup_window !== d.followup_window ||
        l.is_active_lead !== d.is_active_lead ||
        (l.phone_clean || null) !== d.phone_clean;
      if (changed) would_change++;

      return {
        id: l.id, name: l.name, telecaller_name: l.telecaller_name, call_status: l.call_status,
        current: {
          phone_clean: l.phone_clean, is_duplicate: l.is_duplicate,
          followup_clean: l.followup_clean, is_active_lead: l.is_active_lead,
          followup_window: l.followup_window, days_since_last_call: l.days_since_last_call,
          priority_score: l.priority_score, tier: l.tier,
          next_best_action: l.next_best_action, data_check: l.data_check,
        },
        computed: d,
        would_change: changed,
      };
    });

    return {
      computed_only: true,
      note: 'nothing was written — POST /api/leads/enrichment/apply to persist',
      config: {
        settings: cfg.settings,
        status_rules: cfg.rules.map(x => ({
          call_status: x.call_status, base_priority: x.base_priority,
          active_pipeline: x.active_pipeline, win_prob: Number(x.win_prob),
          next_action: x.next_action, reached: x.reached,
          interested_plus: x.interested_plus, demo_plus: x.demo_plus,
        })),
      },
      tier_thresholds: { hot: cfg.settings.hot_threshold, warm: cfg.settings.warm_threshold },
      followup_windows: FOLLOWUP_WINDOWS,
      rows_examined: rows.length,
      would_change,
      rows,
    };
  }

  // One-lead version of enrichmentApply: refresh the derived columns after a single
  // lead's call fields change. Skips phone_clean (the phone is not touched here).
  async rescoreLead(id) {
    const cfg = await this.loadConfig();
    const r = await q(
      `SELECT phone, call_attempted_date::text AS call_attempted_date, followup_date::text AS followup_date,
              last_contacted_at::text AS last_contacted_at, call_status, customer_name, name,
              pharmacy_name, is_duplicate FROM leads WHERE id = $1`, [id]);
    if (!r.rows.length) return;
    const l = r.rows[0];
    const d = this.computeDerived({
      phone_number: l.phone, call_attempted_date: l.call_attempted_date, followup_date: l.followup_date,
      last_contacted_at: l.last_contacted_at, call_status: l.call_status,
      customer_name: l.customer_name || l.name, pharmacy_name: l.pharmacy_name, is_duplicate: l.is_duplicate,
    }, cfg, { today: utcMidnight(new Date()) });
    await q(
      `UPDATE leads SET followup_clean=$2, is_active_lead=$3, followup_window=$4, days_since_last_call=$5,
              priority_score=$6, tier=$7, next_best_action=$8, data_check=$9, win_probability=$10 WHERE id=$1`,
      [id, d.followup_clean, d.is_active_lead, d.followup_window, d.days_since_last_call,
        d.priority_score, d.tier, d.next_best_action, d.data_check, d.win_probability]);
  }

  // Persist the recomputed derived columns across the whole book.
  async enrichmentApply(ctx, body) {
    const limit = Math.min(Math.max(parseInt(body.limit) || 20000, 1), 100000);
    const updated = await tx(async ({ q: tq }) => {
      const cfg = await this.loadConfig(tq);
      const today = utcMidnight(new Date());
      const sel = await tq(
        `SELECT id, phone, call_attempted_date::text AS call_attempted_date, followup_date::text AS followup_date,
                last_contacted_at::text AS last_contacted_at,
                call_status, customer_name, name, pharmacy_name, is_duplicate
           FROM leads
          WHERE merged_into_lead_id IS NULL AND deleted_at IS NULL
          ORDER BY id LIMIT ${limit}`);

      // Keyed by lead id, so the unnest() inputs below cannot repeat a row —
      // Postgres rejects an INSERT/UPDATE ... FROM unnest() that touches the same
      // target row twice.
      const byId = new Map();
      for (const l of sel.rows) {
        byId.set(l.id, this.computeDerived({
          phone_number: l.phone,
          call_attempted_date: l.call_attempted_date,
          followup_date: l.followup_date,
          last_contacted_at: l.last_contacted_at,
          call_status: l.call_status,
          customer_name: l.customer_name || l.name,
          pharmacy_name: l.pharmacy_name,
          is_duplicate: l.is_duplicate,
        }, cfg, { today }));
      }
      const ids = [...byId.keys()];
      const col = k => ids.map(id => byId.get(id)[k]);
      if (!ids.length) return 0;

      await tq(
        `UPDATE leads l SET
           phone_clean = u.phone_clean, followup_clean = u.followup_clean,
           is_active_lead = u.is_active_lead, followup_window = u.followup_window,
           days_since_last_call = u.days_since_last_call,
           priority_score = u.priority_score,
           tier = u.tier, next_best_action = u.next_best_action,
           data_check = u.data_check, win_probability = u.win_probability,
           updated_at = NOW()
          FROM unnest($1::int[], $2::text[], $3::date[], $4::bool[], $5::text[],
                      $6::int[], $7::int[], $8::text[], $9::text[],
                      $10::text[], $11::float[]) AS u(
                       id, phone_clean, followup_clean, is_active_lead, followup_window,
                       days_since_last_call, priority_score, tier, next_best_action,
                       data_check, win_probability)
          WHERE l.id = u.id`,
        [ids, col('phone_clean'), col('followup_clean'), col('is_active_lead'),
          col('followup_window'), col('days_since_last_call'), col('priority_score'),
          col('tier'), col('next_best_action'), col('data_check'), col('win_probability')]);
      return ids.length;
    });

    await audit(null, ctx, 'lead.enrichment_applied', 'lead_batch', null, { updated });
    return { updated, applied: true };
  }

  // ── scoring configuration (admin-editable) ──
  async statusRules() {
    const cfg = await this.loadConfig();
    return {
      status_rules: cfg.rules.map(r => ({
        id: r.id, call_status: r.call_status, status_key: r.status_key,
        base_priority: r.base_priority, active_pipeline: r.active_pipeline,
        win_prob: Number(r.win_prob), next_action: r.next_action,
        reached: r.reached, interested_plus: r.interested_plus, demo_plus: r.demo_plus,
        pipeline_stage: CALL_STATUS_TO_STAGE[r.status_key] || null,
        updated_at: r.updated_at,
      })),
      settings: cfg.settings,
      formula: 'priority_score = base_priority + (follow-up Overdue or Due Today ? followup_urgency_bonus : 0); tier = not in pipeline ? (win 100% ? Won : Closed) : score >= hot_threshold ? Hot : score >= warm_threshold ? Warm : Cool',
    };
  }

  async saveStatusRule(ctx, body) {
    const b = body || {};
    const callStatus = String(b.call_status || '').trim();
    if (!callStatus) throw new ValidationError('call_status required');
    const key = statusKey(callStatus);
    if (!key) throw new ValidationError('call_status has no usable characters');
    const r = await q(
      `INSERT INTO lead_status_rules
         (call_status, status_key, base_priority, active_pipeline, win_prob,
          next_action, reached, interested_plus, demo_plus, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (status_key) DO UPDATE SET
         call_status = EXCLUDED.call_status,
         base_priority = EXCLUDED.base_priority,
         active_pipeline = EXCLUDED.active_pipeline,
         win_prob = EXCLUDED.win_prob,
         next_action = EXCLUDED.next_action,
         reached = EXCLUDED.reached,
         interested_plus = EXCLUDED.interested_plus,
         demo_plus = EXCLUDED.demo_plus,
         updated_at = NOW()
       RETURNING *`,
      [callStatus, key, parseInt(b.base_priority) || 0, b.active_pipeline === true,
        Math.max(0, Math.min(1, Number(b.win_prob) || 0)),
        b.next_action || null, b.reached === true, b.interested_plus === true,
        b.demo_plus === true, parseInt(b.sort_order) || 0]);
    await audit(null, ctx, 'lead.status_rule_saved', 'lead_status_rule', r.rows[0].id, r.rows[0]);
    return r.rows[0];
  }

  // Rules are keyed by status_key (letters and digits of the name), so a plain save
  // under new wording would create a second rule and strand the leads on the old text.
  // Rename moves the rule and its leads together, then recalculates the book.
  async renameStatusRule(ctx, statusKeyParam, body) {
    const oldKey = String(statusKeyParam || '').toLowerCase();
    if (oldKey === NOT_CALLED_KEY) {
      throw new ValidationError('the not-called rule cannot be renamed — it is the engine fallback');
    }
    const callStatus = String((body && body.call_status) || '').trim();
    if (!callStatus) throw new ValidationError('call_status required');
    const newKey = statusKey(callStatus);
    if (!newKey) throw new ValidationError('call_status has no usable characters');
    if (newKey === NOT_CALLED_KEY) throw new ValidationError('that name is reserved for the not-called rule');

    const result = await tx(async ({ q: tq }) => {
      const cur = await tq('SELECT id, call_status FROM lead_status_rules WHERE status_key = $1 FOR UPDATE', [oldKey]);
      if (!cur.rows.length) throw new NotFoundError('No such status rule');
      if (newKey !== oldKey) {
        const clash = await tq('SELECT 1 FROM lead_status_rules WHERE status_key = $1', [newKey]);
        if (clash.rows.length) throw new ConflictError(`A rule for "${callStatus}" already exists`);
      }
      const rule = await tq(
        'UPDATE lead_status_rules SET call_status = $1, status_key = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
        [callStatus, newKey, cur.rows[0].id]);
      const moved = await tq(
        `UPDATE leads SET call_status = $1, updated_at = NOW()
          WHERE lower(regexp_replace(call_status, '[^a-zA-Z0-9]+', '', 'g')) = $2`,
        [callStatus, oldKey]);
      await audit({ query: tq }, ctx, 'lead.status_rule_renamed', 'lead_status_rule', cur.rows[0].id,
        { from: cur.rows[0].call_status, to: callStatus, leads_updated: moved.rowCount });
      return { rule: rule.rows[0], leads_updated: moved.rowCount };
    });

    // The new key may not match the old one's pipeline stage / scoring path, so rescore everything.
    const recalculated = await this.enrichmentApply(ctx, {});
    return { ...result, recalculated: recalculated.updated };
  }

  async deleteStatusRule(ctx, statusKeyParam) {
    if (statusKeyParam === NOT_CALLED_KEY) {
      throw new ValidationError('the not-called rule cannot be deleted — it is the engine fallback');
    }
    const d = await q('DELETE FROM lead_status_rules WHERE status_key = $1 RETURNING id, call_status',
      [String(statusKeyParam).toLowerCase()]);
    if (!d.rows.length) throw new NotFoundError('No such status rule');
    await audit(null, ctx, 'lead.status_rule_deleted', 'lead_status_rule', d.rows[0].id, d.rows[0]);
    return { deleted: d.rows[0] };
  }

  async getScoringSettings() {
    const cfg = await this.loadConfig();
    return { settings: cfg.settings, in_use_defaults: Object.keys(SCORING_SETTING_DEFAULTS) };
  }

  async putScoringSettings(ctx, body) {
    const b = body || {};
    const updates = b.settings && typeof b.settings === 'object' ? b.settings : b;
    const allowed = Object.keys(SCORING_SETTING_DEFAULTS);
    const bad = Object.keys(updates).filter(k => !allowed.includes(k));
    if (bad.length) throw new AppError(400, `unknown setting(s): ${bad.join(', ')}`, { allowed });
    await tx(async ({ q: tq }) => {
      for (const k of allowed) {
        if (updates[k] === undefined) continue;
        const n = Number(updates[k]);
        if (!Number.isFinite(n) || n < 0) throw new ValidationError(`'${k}' must be a non-negative number`);
        await tq(
          `INSERT INTO lead_scoring_settings (key, value, description) VALUES ($1, $2, $3)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [k, n, k]);
      }
    });
    const cfg = await this.loadConfig();
    await audit(null, ctx, 'lead.scoring_settings_updated', 'lead_scoring_settings', null, cfg.settings);
    return { settings: cfg.settings };
  }
}

module.exports = new LeadScoringService();
