'use strict';

const { pool, q } = require('../config/db');
const { OPEN_LEAD_STATUSES, QA_WEIGHTS } = require('../config/constants');
const { ValidationError, NotFoundError, ForbiddenError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { canonicalCategory, computeQAScore } = require('../utils/qa');
const ScopeService = require('./ScopeService');

const round2 = v => Math.round(parseFloat(v) * 100) / 100;
const scopeOf = ctx => ScopeService.teamScopeIds({ userId: ctx.userId, userRole: ctx.role });

class QualityService {
  // Reviewing is a supervisor job (the controller requires manager+). The overall
  // score is ALWAYS computed server-side from the fixed weight table.
  async createReview(ctx, callIdRaw, body) {
    const callId = parseInt(callIdRaw);
    const call = await q('SELECT id,user_id,phone_number,duration_seconds,timestamp,status FROM call_events WHERE id = $1', [callId]);
    if (call.rows.length === 0) throw new NotFoundError('Not found');

    // Normalise the incoming category keys: case/spacing tolerant.
    const incoming = body.scores;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new ValidationError('scores object required');
    const scores = {};
    const unknown = [];
    for (const [key, val] of Object.entries(incoming)) {
      const cat = canonicalCategory(key);
      if (!cat) { unknown.push(key); continue; }
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1 || n > 5) throw new ValidationError(`Score for ${cat} must be an integer 1-5`);
      scores[cat] = n;
    }
    if (unknown.length) throw new ValidationError(`Unknown categories: ${unknown.join(', ')}`);
    const missing = Object.keys(QA_WEIGHTS).filter(c => scores[c] === undefined);
    if (missing.length) throw new ValidationError(`Missing categories: ${missing.join(', ')}`);

    const isViolation = body.compliance_violation === true || body.compliance_violation === 'true';
    // Server-side math only — any client-sent overall_score is ignored.
    const { overall, rows: breakdown } = computeQAScore(scores, isViolation);

    // The agent under review defaults to the agent who made the call.
    const agentId = body.agent_id ? parseInt(body.agent_id) : call.rows[0].user_id;
    const agent = await q('SELECT id,name,role FROM users WHERE id = $1', [agentId]);
    if (agent.rows.length === 0) throw new ValidationError('Agent does not exist');
    if (!['agent', 'manager'].includes(agent.rows[0].role)) throw new ValidationError('Reviews are for agents or managers');
    // Link the lead by phone when the caller didn't name one explicitly.
    let leadId = body.lead_id ? parseInt(body.lead_id) : null;
    if (!leadId && call.rows[0].phone_number) {
      const lr = await q('SELECT id FROM leads WHERE phone = $1 ORDER BY id DESC LIMIT 1', [call.rows[0].phone_number]);
      if (lr.rows.length) leadId = lr.rows[0].id;
    }

    const client = await pool.connect();
    let released = false;
    try {
      await client.query('BEGIN');
      const rev = await client.query(
        `INSERT INTO call_reviews (call_id, lead_id, agent_id, reviewer_id, overall_score, is_compliance_violation, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [callId, leadId, agentId, parseInt(ctx.userId), overall, isViolation, body.notes || null]);
      const review = rev.rows[0];
      for (const b of breakdown) {
        await client.query(
          `INSERT INTO review_scores (review_id, category, score, weight) VALUES ($1,$2,$3,$4)
           ON CONFLICT (review_id, category) DO UPDATE SET score = EXCLUDED.score, weight = EXCLUDED.weight`,
          [review.id, b.category, b.score, b.weight]);
      }
      await audit(client, ctx, 'call.review_created', 'call_review', review.id, {
        call_id: callId, agent_id: agentId, overall_score: overall,
        is_compliance_violation: isViolation,
        categories: Object.fromEntries(breakdown.map(b => [b.category, b.score])),
      });
      await client.query('COMMIT');
      client.release(); released = true;   // give the connection back BEFORE the follow-up reads: they need another one
      return {
        id: review.id, call_id: review.call_id, lead_id: review.lead_id,
        agent_id: review.agent_id, agent_name: agent.rows[0].name,
        reviewer_id: review.reviewer_id,
        reviewer_name: (await q('SELECT name FROM users WHERE id = $1', [ctx.userId])).rows[0]?.name || null,
        overall_score: parseFloat(review.overall_score),
        is_compliance_violation: review.is_compliance_violation,
        notes: review.notes, created_at: review.created_at,
        scores: breakdown,
        scoring: {
          weights: QA_WEIGHTS,
          formula: 'overall = sum(score/5 * weight) over all categories, forced to 0 if compliance_violation',
          max_score: 100,
        },
      };
    } catch (e) { if (!released) await client.query('ROLLBACK'); throw e; } finally { if (!released) client.release(); }
  }

  async getReview(ctx, reviewId) {
    const r = await q(
      `SELECT cr.*, ag.name AS agent_name, ag.email AS agent_email, rv.name AS reviewer_name,
              ce.phone_number, ce.duration_seconds, ce.timestamp AS call_timestamp, ce.status AS call_status,
              l.name AS lead_name
         FROM call_reviews cr
         LEFT JOIN users ag ON ag.id = cr.agent_id
         LEFT JOIN users rv ON rv.id = cr.reviewer_id
         LEFT JOIN call_events ce ON ce.id = cr.call_id
         LEFT JOIN leads  l  ON l.id  = cr.lead_id
        WHERE cr.id = $1`, [reviewId]);
    if (r.rows.length === 0) throw new NotFoundError('Not found');
    const rev = r.rows[0];
    // An agent may read their own review; team-wide review data needs manager+.
    if (ctx.role === 'agent' && rev.agent_id !== parseInt(ctx.userId)) throw new ForbiddenError('Not yours');
    const s = await q('SELECT category,score,weight FROM review_scores WHERE review_id = $1 ORDER BY id', [reviewId]);
    const rows = s.rows.map(x => ({ ...x, weighted: Math.round((x.score / 5) * x.weight * 100) / 100 }));
    return {
      id: rev.id, call_id: rev.call_id, lead_id: rev.lead_id, lead_name: rev.lead_name,
      agent_id: rev.agent_id, agent_name: rev.agent_name, agent_email: rev.agent_email,
      reviewer_id: rev.reviewer_id, reviewer_name: rev.reviewer_name,
      overall_score: parseFloat(rev.overall_score),
      is_compliance_violation: rev.is_compliance_violation,
      notes: rev.notes, created_at: rev.created_at,
      call: rev.call_id ? { phone_number: rev.phone_number, duration_seconds: rev.duration_seconds, timestamp: rev.call_timestamp, status: rev.call_status } : null,
      scores: rows,
      weights: QA_WEIGHTS,
    };
  }

  // Per-agent performance table with a period-over-period comparison.
  // "Assigned" = explicit assignee if set, else the lead's record owner.
  async performance(ctx) {
    const scope = await scopeOf(ctx);
    const d = new Date();
    const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    const d30 = new Date(d.getTime() - 30 * 86400000).toISOString();
    const d60 = new Date(d.getTime() - 60 * 86400000).toISOString();

    const r = await q(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_url,
              COALESCE(c.total_calls, 0)        AS total_calls,
              COALESCE(c.calls_today, 0)        AS calls_today,
              COALESCE(c.connected, 0)          AS connected,
              COALESCE(c.avg_call_duration, 0)  AS avg_call_duration,
              COALESCE(c.calls_30d, 0)          AS calls_30d,
              COALESCE(c.calls_prev_30d, 0)     AS calls_prev_30d,
              COALESCE(l.total_leads, 0)        AS total_leads,
              COALESCE(l.open_leads, 0)         AS open_leads,
              COALESCE(l.won, 0)                AS won,
              COALESCE(l.won_30d, 0)            AS won_30d,
              COALESCE(l.won_prev_30d, 0)       AS won_prev_30d,
              v.avg_qa_score, v.review_count, v.qa_30d, v.qa_prev_30d, v.compliance_violations
         FROM users u
         LEFT JOIN LATERAL (
              SELECT COUNT(*)                                                          AS total_calls,
                     COUNT(*) FILTER (WHERE ce.timestamp >= $3)                        AS calls_today,
                     COUNT(*) FILTER (WHERE ce.status = 'connected')                   AS connected,
                     COALESCE(AVG(ce.duration_seconds), 0)                            AS avg_call_duration,
                     COUNT(*) FILTER (WHERE ce.timestamp >= $4)                        AS calls_30d,
                     COUNT(*) FILTER (WHERE ce.timestamp >= $5 AND ce.timestamp < $4) AS calls_prev_30d
                FROM call_events ce WHERE ce.user_id = u.id
         ) c ON true
         LEFT JOIN LATERAL (
              SELECT COUNT(*)                                                          AS total_leads,
                     COUNT(*) FILTER (WHERE l.status = ANY($2))                         AS open_leads,
                     COUNT(*) FILTER (WHERE l.status = 'won')                           AS won,
                     COUNT(*) FILTER (WHERE l.status = 'won' AND l.updated_at >= $4)     AS won_30d,
                     COUNT(*) FILTER (WHERE l.status = 'won' AND l.updated_at >= $5 AND l.updated_at < $4) AS won_prev_30d
                FROM leads l WHERE COALESCE(l.assigned_to, l.owner_id) = u.id
         ) l ON true
         LEFT JOIN LATERAL (
              SELECT AVG(cr.overall_score)                                              AS avg_qa_score,
                     COUNT(*)                                                          AS review_count,
                     AVG(cr.overall_score) FILTER (WHERE cr.created_at >= $4)          AS qa_30d,
                     AVG(cr.overall_score) FILTER (WHERE cr.created_at >= $5 AND cr.created_at < $4) AS qa_prev_30d,
                     COUNT(*) FILTER (WHERE cr.is_compliance_violation)                AS compliance_violations
                FROM call_reviews cr WHERE cr.agent_id = u.id
         ) v ON true
        WHERE u.is_active = true
          AND u.role IN ('agent','manager')
          AND ($1::int[] IS NULL OR u.id = ANY($1))
        ORDER BY u.name ASC`,
      [scope, OPEN_LEAD_STATUSES, todayStart, d30, d60]);

    const pct = (cur, prev) => {
      const c = Number(cur) || 0, p = Number(prev) || 0;
      if (p === 0) return c === 0 ? 0 : null; // null = no baseline, not "infinite growth"
      return Math.round(((c - p) / p) * 1000) / 10;
    };
    const has = v => v !== null && v !== undefined;

    const rows = r.rows.map(u => {
      const totalLeads = parseInt(u.total_leads) || 0;
      const won = parseInt(u.won) || 0;
      const totalCalls = parseInt(u.total_calls) || 0;
      const connected = parseInt(u.connected) || 0;
      return {
        agent_id: u.id, name: u.name, email: u.email, role: u.role, avatar_url: u.avatar_url,
        total_calls: totalCalls,
        calls_today: parseInt(u.calls_today) || 0,
        total_leads: totalLeads,
        open_leads: parseInt(u.open_leads) || 0,
        won_leads: won,
        conversion_rate: totalLeads ? Math.round((won / totalLeads) * 1000) / 10 : null,
        avg_call_duration: Math.round((parseFloat(u.avg_call_duration) || 0) * 10) / 10,
        connect_rate: totalCalls ? Math.round((connected / totalCalls) * 1000) / 10 : null,
        connected_calls: connected,
        qa_score: has(u.avg_qa_score) ? round2(u.avg_qa_score) : null,
        review_count: parseInt(u.review_count) || 0,
        compliance_violations: parseInt(u.compliance_violations) || 0,
        period: {
          calls_last_30d: parseInt(u.calls_30d) || 0,
          calls_prev_30d: parseInt(u.calls_prev_30d) || 0,
          calls_change_pct: pct(u.calls_30d, u.calls_prev_30d),
          won_last_30d: parseInt(u.won_30d) || 0,
          won_prev_30d: parseInt(u.won_prev_30d) || 0,
          won_change_pct: pct(u.won_30d, u.won_prev_30d),
          qa_last_30d: has(u.qa_30d) ? round2(u.qa_30d) : null,
          qa_prev_30d: has(u.qa_prev_30d) ? round2(u.qa_prev_30d) : null,
          qa_change: (has(u.qa_30d) && has(u.qa_prev_30d))
            ? Math.round((parseFloat(u.qa_30d) - parseFloat(u.qa_prev_30d)) * 100) / 100 : null,
        },
      };
    });
    return {
      scope: scope === null ? 'all' : 'team',
      period: { days: 30, current_from: d30, previous_from: d60, to: new Date().toISOString() },
      agents: rows,
    };
  }

  // One agent's QA deep dive: score trend, per-category averages (what tells a
  // team manager where to coach), worst category, review count, call stats.
  async agentQuality(ctx, agentIdRaw) {
    const agentId = parseInt(agentIdRaw);
    const agent = await q('SELECT id,name,email,role,avatar_url FROM users WHERE id = $1', [agentId]);
    if (agent.rows.length === 0) throw new NotFoundError('Not found');
    if (ctx.role === 'agent' && agentId !== parseInt(ctx.userId)) throw new ForbiddenError('Not yours');
    if (ctx.role === 'manager') {
      const scope = await scopeOf(ctx);
      if (!scope.includes(agentId)) throw new ForbiddenError('Not in your team');
    }

    const d = new Date();
    const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    const d30 = new Date(d.getTime() - 30 * 86400000).toISOString();

    // Per-category averages across all of this agent's reviews.
    const cat = await q(
      `SELECT rs.category, rs.weight, AVG(rs.score) AS avg_score, COUNT(*) AS ratings
         FROM review_scores rs
         JOIN call_reviews cr ON cr.id = rs.review_id
        WHERE cr.agent_id = $1
        GROUP BY rs.category, rs.weight`, [agentId]);
    const categories = cat.rows.map(c => ({
      category: c.category, weight: parseInt(c.weight),
      avg_score: round2(c.avg_score),
      ratings: parseInt(c.ratings) || 0,
      // Gap between "always 5" and where this agent actually lands.
      pct_of_max: Math.round((parseFloat(c.avg_score) / 5) * 1000) / 10,
    }));
    // Worst = lowest average score; null when nothing has been reviewed yet.
    const worst = categories.length ? categories.reduce((a, b) => (b.avg_score < a.avg_score ? b : a)) : null;

    const trend = await q(
      `SELECT to_char(date_trunc('month', cr.created_at), 'YYYY-MM') AS period,
              ROUND(AVG(cr.overall_score)::numeric, 2)                  AS avg_score,
              COUNT(*)                                                 AS reviews
         FROM call_reviews cr
        WHERE cr.agent_id = $1
        GROUP BY date_trunc('month', cr.created_at)
        ORDER BY date_trunc('month', cr.created_at)`, [agentId]);

    const summary = await q(
      `SELECT COUNT(*) AS review_count,
              AVG(overall_score) AS avg_qa_score,
              MIN(overall_score) AS min_qa_score,
              MAX(overall_score) AS max_qa_score,
              AVG(overall_score) FILTER (WHERE created_at >= $2) AS qa_30d,
              COUNT(*) FILTER (WHERE is_compliance_violation)    AS compliance_violations,
              MAX(created_at) AS last_review_at
         FROM call_reviews WHERE agent_id = $1`, [agentId, d30]);

    const calls = await q(
      `SELECT COUNT(*) AS total_calls,
              COUNT(*) FILTER (WHERE timestamp >= $2) AS calls_today,
              COUNT(*) FILTER (WHERE status = 'connected') AS connected,
              COALESCE(AVG(duration_seconds), 0) AS avg_call_duration,
              MAX(timestamp) AS last_call_at
         FROM call_events WHERE user_id = $1`, [agentId, todayStart]);

    const leads = await q(
      `SELECT COUNT(*) AS total_leads,
              COUNT(*) FILTER (WHERE status = ANY($2)) AS open_leads,
              COUNT(*) FILTER (WHERE status = 'won')   AS won,
              COUNT(*) FILTER (WHERE status = 'lost')  AS lost
         FROM leads WHERE COALESCE(assigned_to, owner_id) = $1`, [agentId, OPEN_LEAD_STATUSES]);

    const recent = await q(
      `SELECT cr.id, cr.overall_score, cr.is_compliance_violation, cr.notes, cr.created_at,
              rv.name AS reviewer_name
         FROM call_reviews cr
         LEFT JOIN users rv ON rv.id = cr.reviewer_id
        WHERE cr.agent_id = $1
        ORDER BY cr.created_at DESC, cr.id DESC
        LIMIT 10`, [agentId]);

    const s = summary.rows[0], cl = calls.rows[0], ld = leads.rows[0];
    return {
      agent: { ...agent.rows[0] },
      review_count: parseInt(s.review_count) || 0,
      qa_score: s.avg_qa_score !== null ? round2(s.avg_qa_score) : null,
      qa_score_30d: s.qa_30d !== null ? round2(s.qa_30d) : null,
      min_qa_score: s.min_qa_score !== null ? parseFloat(s.min_qa_score) : null,
      max_qa_score: s.max_qa_score !== null ? parseFloat(s.max_qa_score) : null,
      compliance_violations: parseInt(s.compliance_violations) || 0,
      last_review_at: s.last_review_at || null,
      qa_trend: trend.rows.map(t => ({ period: t.period, avg_score: parseFloat(t.avg_score), reviews: parseInt(t.reviews) })),
      category_averages: categories,
      worst_category: worst ? worst.category : null,
      worst_category_avg: worst ? worst.avg_score : null,
      weights: QA_WEIGHTS,
      calls: {
        total_calls: parseInt(cl.total_calls) || 0,
        calls_today: parseInt(cl.calls_today) || 0,
        connected_calls: parseInt(cl.connected) || 0,
        connect_rate: parseInt(cl.total_calls) ? Math.round((parseInt(cl.connected) / parseInt(cl.total_calls)) * 1000) / 10 : null,
        avg_call_duration: Math.round((parseFloat(cl.avg_call_duration) || 0) * 10) / 10,
        last_call_at: cl.last_call_at || null,
      },
      leads: {
        total_leads: parseInt(ld.total_leads) || 0,
        open_leads: parseInt(ld.open_leads) || 0,
        won_leads: parseInt(ld.won) || 0,
        lost_leads: parseInt(ld.lost) || 0,
        conversion_rate: parseInt(ld.total_leads) ? Math.round((parseInt(ld.won) / parseInt(ld.total_leads)) * 1000) / 10 : null,
      },
      recent_reviews: recent.rows.map(r => ({
        id: r.id, overall_score: parseFloat(r.overall_score),
        is_compliance_violation: r.is_compliance_violation,
        notes: r.notes, reviewer_name: r.reviewer_name, created_at: r.created_at,
      })),
    };
  }

  // Agents ranked by QA score, then conversion rate. The numbers sit side by side
  // so a manager can see "top QA but poor conversion" instead of a single blend.
  async leaderboard(ctx) {
    const scope = await scopeOf(ctx);
    const r = await q(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_url,
              v.avg_qa_score, v.review_count, v.violations,
              COALESCE(l.total_leads, 0) AS total_leads,
              COALESCE(l.won, 0)         AS won,
              COALESCE(c.total_calls, 0)  AS total_calls,
              COALESCE(c.connected, 0)   AS connected
         FROM users u
         LEFT JOIN LATERAL (
              SELECT AVG(cr.overall_score) AS avg_qa_score, COUNT(*) AS review_count,
                     COUNT(*) FILTER (WHERE cr.is_compliance_violation) AS violations
                FROM call_reviews cr WHERE cr.agent_id = u.id
         ) v ON true
         LEFT JOIN LATERAL (
              SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE l.status = 'won') AS won
                FROM leads l WHERE COALESCE(l.assigned_to, l.owner_id) = u.id
         ) l ON true
         LEFT JOIN LATERAL (
              SELECT COUNT(*) AS total_calls, COUNT(*) FILTER (WHERE ce.status = 'connected') AS connected
                FROM call_events ce WHERE ce.user_id = u.id
         ) c ON true
        WHERE u.is_active = true
          AND u.role IN ('agent','manager')
          AND ($1::int[] IS NULL OR u.id = ANY($1))
        -- Ranked by QA score first, conversion as the tie-break; unreviewed
        -- agents (NULL QA) sink to the bottom instead of sorting to the top.
        ORDER BY v.avg_qa_score DESC NULLS LAST,
                 (CASE WHEN COALESCE(l.total_leads,0) > 0 THEN COALESCE(l.won,0)::float / l.total_leads ELSE -1 END) DESC,
                 v.review_count DESC,
                 u.name ASC`, [scope]);

    let rank = 0;
    const rows = r.rows.map(u => {
      const total = parseInt(u.total_leads) || 0;
      const won = parseInt(u.won) || 0;
      const hasQa = u.avg_qa_score !== null && u.avg_qa_score !== undefined;
      rank += 1;
      return {
        rank,
        agent_id: u.id, name: u.name, email: u.email, role: u.role, avatar_url: u.avatar_url,
        qa_score: hasQa ? round2(u.avg_qa_score) : null,
        review_count: parseInt(u.review_count) || 0,
        compliance_violations: parseInt(u.violations) || 0,
        total_leads: total,
        won_leads: won,
        conversion_rate: total ? Math.round((won / total) * 1000) / 10 : null,
        total_calls: parseInt(u.total_calls) || 0,
        connect_rate: parseInt(u.total_calls) ? Math.round((parseInt(u.connected) / parseInt(u.total_calls)) * 1000) / 10 : null,
        reviewed: hasQa,
      };
    });
    return { scope: scope === null ? 'all' : 'team', weights: QA_WEIGHTS, generated_at: new Date().toISOString(), leaderboard: rows };
  }
}

module.exports = new QualityService();
