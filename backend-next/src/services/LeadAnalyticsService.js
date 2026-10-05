'use strict';

const { q } = require('../config/db');
const { pctOf, money } = require('../utils/leadMath');
const { visibleSql } = require('../utils/leadAccess');
const LeadScoringService = require('./LeadScoringService');

// Every figure below is a count or a function of counts. There is not a single
// literal percentage, deal value or target in these queries.
const LIVE_LEAD_FILTER = 'l.merged_into_lead_id IS NULL AND l.deleted_at IS NULL';

// Join each lead to its status rule by the NORMALISED call status, falling back
// to the "not called yet" rule for blank statuses.
const RULE_JOIN = `LEFT JOIN lead_status_rules r
         ON r.status_key = COALESCE(
       NULLIF(regexp_replace(lower(btrim(COALESCE(NULLIF(btrim(l.call_status), ''), '(Not called yet)'))), '[^a-z0-9]+', '', 'g'), ''),
       'notcalledyet')`;

// The funnel is defined by the spec:
//   Total → Called → Reached a person → Interested or better →
//   Demo done or better → Converted
const FUNNEL_STAGES = [
  { key: 'total',      label: 'Total leads' },
  { key: 'called',     label: 'Called' },
  { key: 'reached',    label: 'Reached a person' },
  { key: 'interested', label: 'Interested or better' },
  { key: 'demo',       label: 'Demo done or better' },
  { key: 'converted',  label: 'Converted' },
];

function buildFunnel(counts) {
  const total = counts.total || 0;
  return FUNNEL_STAGES.map((s, i) => {
    const n = counts[s.key] || 0;
    // The first stage has no predecessor, so "% of previous" is 100% of itself.
    const prev = i === 0 ? null : (counts[FUNNEL_STAGES[i - 1].key] || 0);
    return {
      stage: s.key, label: s.label, count: n,
      pct_of_previous: i === 0 ? 100 : pctOf(n, prev),
      pct_of_total: pctOf(n, total),
    };
  });
}

class LeadAnalyticsService {
  async commandCenter(ctx) {
    const cfg = await LeadScoringService.loadConfig();
    const price = cfg.settings.plan_price;
    const params = [];
    const scope = visibleSql(ctx, 'l', params);

    // One pass over the live leads. COUNT(*) FILTER (...) gets every funnel number
    // without a self-join or N queries.
    const tot = await q(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE l.call_attempted_date IS NOT NULL OR lower(btrim(l.call_done)) IN ('true','yes','y','1'))::int AS called,
         COUNT(*) FILTER (WHERE COALESCE(r.reached, false))::int AS reached,
         COUNT(*) FILTER (WHERE COALESCE(r.interested_plus, false))::int AS interested,
         COUNT(*) FILTER (WHERE COALESCE(r.demo_plus, false))::int AS demo,
         COUNT(*) FILTER (WHERE r.status_key = 'converted')::int AS converted,
         COUNT(*) FILTER (WHERE COALESCE(l.is_duplicate, false))::int AS duplicates,
         COUNT(*) FILTER (WHERE COALESCE(r.active_pipeline, false))::int AS active_pipeline,
         COUNT(*) FILTER (WHERE l.telecaller_name IS NOT NULL AND btrim(l.telecaller_name) <> ''
                             AND l.assigned_to IS NULL)::int AS unassigned,
         COUNT(*) FILTER (WHERE l.assigned_to IS NULL)::int AS unowned,
         COALESCE(SUM(COALESCE(r.win_prob, 0)) FILTER (WHERE COALESCE(r.active_pipeline, false)), 0)::float AS win_prob_sum,
         COALESCE(SUM(COALESCE(r.win_prob, 0) * $${params.length + 1})
                  FILTER (WHERE COALESCE(r.active_pipeline, false)), 0)::float AS weighted_pipeline,
         COUNT(*) FILTER (WHERE l.segment IS NOT NULL)::int AS with_segment
       FROM leads l
       ${RULE_JOIN}
      WHERE 1=1 AND ${LIVE_LEAD_FILTER}${scope}`,
      [...params, price]);

    const counts = tot.rows[0];
    const funnel = buildFunnel(counts);

    // Call-status mix: how many leads sit at each status, what each is worth, and
    // what share of the book that is.
    const mix = await q(
      `SELECT COALESCE(NULLIF(btrim(l.call_status), ''), '(Not called yet)') AS call_status,
              r.status_key, r.base_priority, r.win_prob, r.active_pipeline, r.next_action,
              COUNT(*)::int AS leads
         FROM leads l
         ${RULE_JOIN}
        WHERE 1=1 AND ${LIVE_LEAD_FILTER}${scope}
        GROUP BY 1,2,3,4,5,6
        ORDER BY leads DESC, 1`,
      params);

    const total = counts.total || 0;
    const statusMix = mix.rows.map(m => ({
      call_status: m.call_status,
      base_priority: m.base_priority,
      win_probability: Number(m.win_prob) || 0,
      active_pipeline: !!m.active_pipeline,
      next_best_action: m.next_action,
      leads: m.leads,
      pct_of_book: pctOf(m.leads, total),
      weighted_value: money((Number(m.win_prob) || 0) * (m.active_pipeline ? m.leads : 0) * price),
    }));

    // Weighted pipeline = Σ(active-pipeline leads × win probability × price).
    // Recomputed from the same rows the mix lists so headline and breakdown can
    // never disagree.
    const weighted = money(statusMix.reduce((a, s) => a + s.weighted_value, 0));

    return {
      generated_at: new Date().toISOString(),
      plan_price: price,
      kpis: {
        total_leads: total,
        called: counts.called,
        reached: counts.reached,
        interested_or_better: counts.interested,
        demo_or_better: counts.demo,
        converted: counts.converted,
        active_pipeline_leads: counts.active_pipeline,
        duplicate_leads: counts.duplicates,
        unassigned_telecaller_leads: counts.unassigned,
        unowned_leads: counts.unowned,
        leads_with_segment: counts.with_segment,
        win_probability_sum: Math.round(counts.win_prob_sum * 1000) / 1000,
        weighted_pipeline_value: weighted,
        conversion_rate_pct: pctOf(counts.converted, total),
        called_pct: pctOf(counts.called, total),
        reached_pct: pctOf(counts.reached, total),
      },
      sales_funnel: funnel,
      call_status_mix: statusMix,
      weighted_pipeline: {
        value: weighted,
        formula: 'Σ(active-pipeline leads × win probability × plan price)',
        plan_price: price,
        active_leads: counts.active_pipeline,
        win_probability_sum: Math.round(counts.win_prob_sum * 1000) / 1000,
      },
      settings: cfg.settings,
    };
  }

  async dailyReport(ctx) {
    const cfg = await LeadScoringService.loadConfig();
    const price = cfg.settings.plan_price;
    const params = [];
    const scope = visibleSql(ctx, 'l', params);

    const snap = await q(
      `SELECT
         COUNT(*) FILTER (WHERE (l.created_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date)::int AS new_today,
         COUNT(*) FILTER (WHERE (l.call_attempted_date AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date)::int AS called_today,
         COUNT(*) FILTER (WHERE (l.lead_assigned_date AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date)::int AS assigned_today,
         COUNT(*) FILTER (WHERE l.followup_window = 'Due Today')::int AS due_today,
         COUNT(*) FILTER (WHERE l.followup_window = 'Overdue')::int AS overdue,
         COUNT(*) FILTER (WHERE l.followup_window = 'This Week')::int AS this_week,
         COUNT(*) FILTER (WHERE r.status_key = 'converted')::int AS converted_total,
         COUNT(*)::int AS total
       FROM leads l
       ${RULE_JOIN}
      WHERE 1=1 AND ${LIVE_LEAD_FILTER}${scope}`, params);

    // Segment bifurcation: how each campaign splits by outcome. NULL segment is
    // reported as its own bucket rather than hidden.
    const seg = await q(
      `SELECT COALESCE(NULLIF(btrim(l.segment), ''), '(unsegmented)') AS segment,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE l.call_attempted_date IS NOT NULL OR lower(btrim(l.call_done)) IN ('true','yes','y','1'))::int AS called,
              COUNT(*) FILTER (WHERE COALESCE(r.reached, false))::int AS reached,
              COUNT(*) FILTER (WHERE COALESCE(r.interested_plus, false))::int AS interested,
              COUNT(*) FILTER (WHERE COALESCE(r.demo_plus, false))::int AS demo,
              COUNT(*) FILTER (WHERE r.status_key = 'converted')::int AS converted,
              COALESCE(SUM(COALESCE(r.win_prob, 0) * $${params.length + 1})
                       FILTER (WHERE COALESCE(r.active_pipeline, false)), 0)::float AS weighted
         FROM leads l
         ${RULE_JOIN}
        WHERE 1=1 AND ${LIVE_LEAD_FILTER}${scope}
        GROUP BY 1
        ORDER BY total DESC, 1`, [...params, price]);

    // status × segment matrix. Every selected column is either grouped or
    // aggregated — mixing the two is the classic way this query 500s.
    const matrix = await q(
      `SELECT COALESCE(NULLIF(btrim(l.segment), ''), '(unsegmented)') AS segment,
              COALESCE(NULLIF(btrim(l.call_status), ''), '(Not called yet)') AS call_status,
              COUNT(*)::int AS leads
         FROM leads l
        WHERE 1=1 AND ${LIVE_LEAD_FILTER}${scope}
        GROUP BY 1, 2
        ORDER BY 1, leads DESC, 2`, params);

    const s = snap.rows[0];
    const segments = seg.rows.map(r => ({
      segment: r.segment,
      total: r.total, called: r.called, reached: r.reached,
      interested: r.interested, demo: r.demo, converted: r.converted,
      called_pct: pctOf(r.called, r.total),
      reached_pct: pctOf(r.reached, r.called),
      interested_pct: pctOf(r.interested, r.reached),
      conversion_rate_pct: pctOf(r.converted, r.total),
      weighted_pipeline_value: money(r.weighted),
    }));

    return {
      generated_at: new Date().toISOString(),
      date: (await q("SELECT (NOW() AT TIME ZONE 'UTC')::date AS d")).rows[0].d,
      snapshot: {
        total_leads: s.total,
        new_today: s.new_today,
        called_today: s.called_today,
        assigned_today: s.assigned_today,
        due_today: s.due_today,
        overdue: s.overdue,
        this_week: s.this_week,
        converted_total: s.converted_total,
        conversion_rate_pct: pctOf(s.converted_total, s.total),
        daily_call_target: cfg.settings.daily_call_target,
        calls_vs_target: cfg.settings.daily_call_target
          ? pctOf(s.called_today, cfg.settings.daily_call_target) : null,
      },
      segment_bifurcation: segments,
      status_segment_matrix: matrix.rows,
      settings: cfg.settings,
    };
  }

  async areaAnalysis(ctx) {
    const cfg = await LeadScoringService.loadConfig();
    const price = cfg.settings.plan_price;
    const params = [];
    const scope = visibleSql(ctx, 'l', params);

    const r = await q(
      `SELECT COALESCE(NULLIF(btrim(l.locality), ''), '(unspecified)') AS locality,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE l.call_attempted_date IS NOT NULL OR lower(btrim(l.call_done)) IN ('true','yes','y','1'))::int AS called,
              COUNT(*) FILTER (WHERE COALESCE(r.reached, false))::int AS reached,
              COUNT(*) FILTER (WHERE COALESCE(r.interested_plus, false))::int AS interested,
              COUNT(*) FILTER (WHERE COALESCE(r.demo_plus, false))::int AS demo,
              COUNT(*) FILTER (WHERE r.status_key = 'converted')::int AS converted,
              COUNT(*) FILTER (WHERE COALESCE(l.is_duplicate, false))::int AS duplicates,
              COUNT(*) FILTER (WHERE COALESCE(r.active_pipeline, false))::int AS active_pipeline,
              COALESCE(SUM(COALESCE(r.win_prob, 0)) FILTER (WHERE COALESCE(r.active_pipeline, false)), 0)::float AS win_prob_sum,
              COALESCE(SUM(COALESCE(r.win_prob, 0) * $${params.length + 1})
                       FILTER (WHERE COALESCE(r.active_pipeline, false)), 0)::float AS weighted
         FROM leads l
         ${RULE_JOIN}
        WHERE 1=1 AND ${LIVE_LEAD_FILTER}${scope}
        GROUP BY 1
        ORDER BY total DESC, 1`, [...params, price]);

    const total = r.rows.reduce((a, x) => a + x.total, 0);

    // rank_key packs the funnel order into one sortable number: converted
    // dominates, then demo, then interested, then reached.
    const withRank = r.rows.map(x => ({
      locality: x.locality,
      total: x.total, called: x.called, reached: x.reached,
      interested: x.interested, demo: x.demo, converted: x.converted,
      duplicates: x.duplicates,
      active_pipeline: x.active_pipeline,
      win_probability_sum: Math.round(x.win_prob_sum * 1000) / 1000,
      weighted_pipeline_value: money(x.weighted),
      called_pct: pctOf(x.called, x.total),
      reached_pct: pctOf(x.reached, x.called),
      conversion_rate_pct: pctOf(x.converted, x.total),
      coverage_pct: pctOf(x.total, total),
      rank_key: x.converted * 1000000 + x.demo * 10000 + x.interested * 100 + x.reached,
    }));

    withRank.sort((a, b) => b.rank_key - a.rank_key || b.total - a.total || a.locality.localeCompare(b.locality));
    withRank.forEach((x, i) => { x.rank = i + 1; });

    return {
      generated_at: new Date().toISOString(),
      total_localities: withRank.length,
      total_leads: total,
      plan_price: price,
      localities: withRank,
    };
  }

  // The worklist, one bucket per telecaller plus an UNASSIGNED bucket for names
  // that never matched. Ordering is priority score desc, then days-since-last-call
  // desc so the lead nobody has touched in the longest sits at the top of a tied
  // score. A NULL days-since means "never called" and sorts last.
  async callQueue(ctx, query) {
    const limit = Math.min(Math.max(parseInt(query.limit) || 500, 1), 5000);
    const includeClosed = query.include_closed === 'true';
    const activeOnly = !includeClosed;

    const params = [];
    let where = ' WHERE 1=1' + visibleSql(ctx, 'l', params);
    where += ` AND ${LIVE_LEAD_FILTER}`;
    if (activeOnly) where += ' AND COALESCE(l.is_active_lead, false) = true';
    if (query.telecaller) {
      where += ` AND lower(btrim(l.telecaller_name)) = lower(btrim($${params.length + 1}))`;
      params.push(String(query.telecaller));
    }

    const r = await q(
      `SELECT l.id, l.name, l.customer_name, l.pharmacy_name, l.locality, l.segment,
              l.phone, l.phone_clean, l.call_status, l.telecaller_name, l.assigned_to,
              u.name AS telecaller_user_name,
              l.priority_score, l.tier, l.followup_window, l.followup_clean,
              l.days_since_last_call, l.next_best_action, l.is_duplicate, l.is_active_lead,
              l.last_contacted_at, l.call_attempted_date
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_to
        ${where}
        ORDER BY COALESCE(l.priority_score, 0) DESC,
                 l.days_since_last_call DESC NULLS LAST,
                 l.id
        LIMIT ${limit}`, params);

    const buckets = new Map();
    const keyOf = l => (l.telecaller_user_name ? `u:${l.assigned_to}` : (l.telecaller_name ? `n:${l.telecaller_name}` : 'unassigned'));

    for (const l of r.rows) {
      const k = keyOf(l);
      if (!buckets.has(k)) {
        buckets.set(k, {
          telecaller_name: l.telecaller_user_name || l.telecaller_name || null,
          telecaller_name_from_sheet: l.telecaller_name || null,
          user_id: l.assigned_to,
          assigned: !!l.assigned_to,
          leads_count: 0, leads: [],
        });
      }
      const b = buckets.get(k);
      b.leads_count++;
      b.leads.push({
        id: l.id, name: l.name, customer_name: l.customer_name, pharmacy_name: l.pharmacy_name,
        locality: l.locality, segment: l.segment, phone: l.phone, phone_clean: l.phone_clean,
        call_status: l.call_status, priority_score: l.priority_score, tier: l.tier,
        followup_window: l.followup_window, followup_clean: l.followup_clean,
        days_since_last_call: l.days_since_last_call, next_best_action: l.next_best_action,
        is_duplicate: l.is_duplicate, is_active_lead: l.is_active_lead,
        last_contacted_at: l.last_contacted_at, call_attempted_date: l.call_attempted_date,
      });
    }

    // queue_rank is the position within its own telecaller's list, which is what
    // the sheet's Queue Rank column means.
    for (const b of buckets.values()) b.leads.forEach((l, i) => { l.queue_rank = i + 1; });

    const all = [...buckets.values()].sort((a, b) => {
      if (a.assigned !== b.assigned) return a.assigned ? -1 : 1;   // real telecallers first
      return a.leads_count - b.leads_count || String(a.telecaller_name).localeCompare(String(b.telecaller_name));
    });

    return {
      generated_at: new Date().toISOString(),
      include_closed: includeClosed,
      ordering: 'priority_score DESC, then days_since_last_call DESC (never-called last)',
      unassigned_bucket: all.filter(b => !b.assigned),
      buckets: all,
      totals: {
        queue_items: r.rows.length,
        telecallers: all.filter(b => b.assigned).length,
        unassigned_buckets: all.filter(b => !b.assigned).length,
        unassigned_leads: all.filter(b => !b.assigned).reduce((a, b) => a + b.leads_count, 0),
      },
    };
  }
}

module.exports = new LeadAnalyticsService();
