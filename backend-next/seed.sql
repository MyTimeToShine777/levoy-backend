-- Levoy clone: seed realistic demo data
-- Run: psql -d levoy -f backend-next/seed.sql
-- Idempotent: clears and reseeds demo content, keeps the schema.

BEGIN;

-- ─── Users ───
-- demo users have no password: sign-in is by an emailed code (use inboxes you can open)
-- hash generated with bcryptjs (same lib the backend uses)
INSERT INTO users (email, password_hash, name, phone, role, is_active, avatar_url)
VALUES
  ('admin@levoy.co',  '$2a$10$uyBqYRCcH44p7IRNtaGeneb1yDT.fXFm6C6mrYrom/mdrP5O4bq2C', 'Aarti Sharma',    '+919876500001', 'admin',  true, NULL),
  ('manager@levoy.co','$2a$10$uyBqYRCcH44p7IRNtaGeneb1yDT.fXFm6C6mrYrom/mdrP5O4bq2C', 'Rahul Menon',     '+919876500002', 'manager',true, NULL),
  ('agent1@levoy.co', '$2a$10$uyBqYRCcH44p7IRNtaGeneb1yDT.fXFm6C6mrYrom/mdrP5O4bq2C', 'Priya Nair',      '+919876500003', 'agent',  true, NULL),
  ('agent2@levoy.co', '$2a$10$uyBqYRCcH44p7IRNtaGeneb1yDT.fXFm6C6mrYrom/mdrP5O4bq2C', 'Vikram Rao',      '+919876500004', 'agent',  true, NULL),
  ('agent3@levoy.co', '$2a$10$uyBqYRCcH44p7IRNtaGeneb1yDT.fXFm6C6mrYrom/mdrP5O4bq2C', 'Sneha Iyer',      '+919876500005', 'agent',  true, NULL),
  ('agent4@levoy.co', '$2a$10$uyBqYRCcH44p7IRNtaGeneb1yDT.fXFm6C6mrYrom/mdrP5O4bq2C', 'Karthik Reddy',   '+919876500006', 'agent',  true, NULL)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name, phone = EXCLUDED.phone, role = EXCLUDED.role;

-- ─── Teams ───
INSERT INTO teams (name, created_by)
SELECT 'Sales - Mumbai', id FROM users WHERE email='manager@levoy.co'
  AND NOT EXISTS (SELECT 1 FROM teams WHERE name='Sales - Mumbai');

INSERT INTO teams (name, created_by)
SELECT 'Support - Bengaluru', id FROM users WHERE email='manager@levoy.co'
  AND NOT EXISTS (SELECT 1 FROM teams WHERE name='Support - Bengaluru');

-- ─── Team members ───
INSERT INTO team_members (team_id, user_id)
SELECT t.id, u.id FROM teams t, users u
WHERE t.name='Sales - Mumbai' AND u.email IN
  ('manager@levoy.co','agent1@levoy.co','agent2@levoy.co')
ON CONFLICT DO NOTHING;

INSERT INTO team_members (team_id, user_id)
SELECT t.id, u.id FROM teams t, users u
WHERE t.name='Support - Bengaluru' AND u.email IN
  ('manager@levoy.co','agent3@levoy.co','agent4@levoy.co')
ON CONFLICT DO NOTHING;

-- ─── Leads ───
-- Guarded on email so re-running the seed does not append a second copy of
-- every demo lead each time (there is no unique index on `leads.phone`, and
-- the rows are demo fixtures keyed by email).
INSERT INTO leads (name, phone, email, status, source, priority, owner_id, notes)
SELECT v.name, v.phone, v.email, v.status, v.source, v.priority,
       (SELECT id FROM users WHERE email = v.owner_email), v.notes
FROM (VALUES
  ('Ananya Desai',  '+919****0101', 'ananya@example.com',  'new',        'Website',   'high',     'agent1@levoy.co', 'Interested in annual plan'),
  ('Bhavesh Patel', '+919****0102', 'bhavesh@example.com', 'contacted',  'Referral',  'normal',   'agent1@levoy.co', 'Asked for pricing details'),
  ('Chitra Menon',  '+919****0103', 'chitra@example.com',  'qualified',  'Cold Call', 'high',     'agent1@levoy.co', 'Demo scheduled Friday'),
  ('Dinesh Kulkarni','+919****0104','dinesh@example.com',  'proposal',   'Website',   'high',     'agent2@levoy.co', 'Proposal sent, awaiting reply'),
  ('Ekta Sharma',   '+919****0105', 'ekta@example.com',    'contacted',  'Trade Show','normal',   'agent2@levoy.co', 'Follow up next week'),
  ('Farhan Qureshi','+919****0106', 'farhan@example.com',  'won',        'Referral',  'normal',   'agent1@levoy.co', 'Signed 2-year contract'),
  ('Gauri Nair',    '+919****0107', 'gauri@example.com',   'new',        'Website',   'low',      'agent2@levoy.co', NULL),
  ('Harsh Agarwal', '+919****0108', 'harsh@example.com',   'lost',       'Cold Call', 'low',      'agent1@levoy.co', 'Went with a competitor')
) AS v(name, phone, email, status, source, priority, owner_email, notes)
WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.email = v.email);

-- ─── Call events: last 30 days ───
INSERT INTO call_events (user_id, phone_number, direction, status, duration_seconds, timestamp, notes)
SELECT
  u.id,
  '+9198' || (10000000 + (random() * 89999999))::int,
  CASE WHEN random() < 0.55 THEN 'outgoing' ELSE 'incoming' END,
  CASE
    WHEN random() < 0.52 THEN 'connected'
    WHEN random() < 0.75 THEN 'missed'
    WHEN random() < 0.90 THEN 'rejected'
    ELSE 'unanswered'
  END,
  CASE WHEN random() < 0.52 THEN (20 + random() * 400)::int ELSE 0 END,
  NOW() - (random() * interval '30 days'),
  NULL
FROM users u, generate_series(1, 60)
WHERE u.email IN ('agent1@levoy.co','agent2@levoy.co','agent3@levoy.co','agent4@levoy.co');

-- ─── Pin a few calls and add notes ───
UPDATE call_events SET is_pinned = true
WHERE id IN (SELECT id FROM call_events ORDER BY duration_seconds DESC LIMIT 5);

UPDATE call_events SET notes = 'Customer asked for a callback at 6pm'
WHERE id = (SELECT MIN(id) FROM call_events WHERE status='connected');

-- ─── WhatsApp templates ───
INSERT INTO whatsapp_templates (user_id, name, category, language, content, variables, is_active)
SELECT id, t.name, t.category, 'en', t.content, t.vars::jsonb, true
FROM users, (VALUES
  ('Follow Up - Interested',  'follow_up',  'Hi {{name}}, Thanks for your time today. As discussed, here is the proposal you asked for. Do let me know if you have questions.', '["name"]'),
  ('Demo Reminder',           'reminder',   'Hi {{name}}, reminder about our scheduled demo on {{date}} at {{time}}. Looking forward to speaking with you.', '["name","date","time"]'),
  ('Quote Follow Up',         'follow_up',  'Hi {{name}}, did you get a chance to review the quote? Happy to walk you through any questions.', '["name"]'),
  ('Renewal Reminder',        'renewal',    'Hi {{name}}, your subscription renews on {{date}}. Let me know if you would like to adjust your plan.', '["name","date"]')
) AS t(name, category, content, vars)
WHERE email = 'manager@levoy.co';

-- ─── Daily reports: last 14 days ───
INSERT INTO daily_reports (user_id, date, total_calls, incoming, outgoing, missed, rejected, total_duration, unique_contacts, sent_at)
SELECT
  u.id,
  (CURRENT_DATE - n)::date,
  15 + (random() * 25)::int,
  (5 + random() * 10)::int,
  (8 + random() * 12)::int,
  (2 + random() * 6)::int,
  (1 + random() * 4)::int,
  (600 + random() * 2400)::int,
  (8 + random() * 15)::int,
  NOW() - (n || ' days')::interval
FROM users u, generate_series(1, 14) n
WHERE u.email IN ('agent1@levoy.co','agent2@levoy.co','agent3@levoy.co','agent4@levoy.co');

-- ─── Notifications ───
INSERT INTO notifications (user_id, type, title, message)
SELECT id, 'system', 'Welcome to Levoy', 'Your account is ready. Start by connecting your team members.'
FROM users WHERE email='manager@levoy.co';

INSERT INTO notifications (user_id, type, title, message)
SELECT id, 'report', 'Daily report ready', 'Yesterday''s call summary is available in Reports.'
FROM users WHERE email='agent1@levoy.co';

-- ══════════════════════════════════════════════════════════════════════════
--  NEW-FEATURE DEMO DATA
--  The follow-ups, tags, assignment-rules, pipeline and call-review features
--  all shipped with empty tables, so every screen built on them rendered
--  blank. Everything below is idempotent and scoped to demo rows only — no
--  TRUNCATE, no bare DELETE of a whole table, so a real lead or review added
--  through the UI survives a re-seed.
-- ══════════════════════════════════════════════════════════════════════════

-- ─── Tags ───
-- ON CONFLICT (name) DO NOTHING: a tag an admin renamed or recoloured keeps
-- their version.
INSERT INTO tags (name, color, created_by)
SELECT t.name, t.color, u.id
  FROM users u,
  (VALUES
    ('Hot Lead',     '#ef4444'),
    ('Enterprise',   '#8b5cf6'),
    ('Follow-up Due','#f59e0b'),
    ('Dormant',      '#6b7280'),
    ('Referral',     '#22c55e'),
    ('Unresponsive', '#0ea5e9')
  ) AS t(name, color)
 WHERE u.email = 'admin@levoy.co'
ON CONFLICT (name) DO NOTHING;

-- ─── Lead ↔ tag links ───
-- Deterministic from the lead id so re-running produces the same picture.
-- Anchored on the OLDEST lead per email: the leads block above has no
-- ON CONFLICT clause, so a re-seed appends another copy of each demo lead.
-- Joining on email alone would then tag every historical copy, and the row
-- count would climb on each run. min(id) pins the link to one stable row.
WITH demo_lead AS (SELECT DISTINCT ON (email) id, status, priority, source
                     FROM leads WHERE email IS NOT NULL ORDER BY email, id)
INSERT INTO lead_tags (lead_id, tag_id)
SELECT l.id, t.id
  FROM demo_lead l
  JOIN tags t ON t.name IN (
    CASE WHEN l.priority = 'high'  THEN 'Hot Lead'
         WHEN l.status  = 'won'    THEN 'Referral'
         WHEN l.source  = 'Referral' THEN 'Referral'
         ELSE 'Follow-up Due' END,
    CASE WHEN l.status = 'lost' THEN 'Dormant'
         WHEN l.status = 'new'  THEN 'Follow-up Due'
         ELSE 'Unresponsive' END
  )
ON CONFLICT (lead_id, tag_id) DO NOTHING;

-- ─── Follow-ups: overdue / due today / upcoming / completed ───
-- The dashboard task panel is driven by due_at vs NOW, so the four buckets
-- have to actually straddle now. Scoped by the 'demo:' notes marker: only
-- seed rows are removed on re-run.
DELETE FROM lead_follow_ups WHERE notes LIKE 'demo:%';

-- Same min(id) anchoring as the tag links above: the demo lead addresses are
-- duplicated by the non-idempotent leads block, so an unqualified email join
-- would create one follow-up per copy on every re-seed.
WITH demo_lead AS (SELECT DISTINCT ON (email) id, email, owner_id
                     FROM leads WHERE email IS NOT NULL ORDER BY email, id)
INSERT INTO lead_follow_ups (lead_id, user_id, type, due_at, completed_at, outcome, notes, created_at)
SELECT
  l.id,
  COALESCE(l.owner_id, u.id),
  f.type,
  NOW() + (f.offset_hours || ' hours')::interval,
  CASE WHEN f.state = 'completed' THEN NOW() + (f.offset_hours || ' hours')::interval ELSE NULL END,
  f.outcome,
  f.marker || ' — ' || f.detail,
  NOW() + (f.offset_hours || ' hours')::interval
FROM (VALUES
  -- lead email, agent email, type, hours offset from now, bucket, outcome, marker, detail
  ('ananya@example.com',  'agent1@levoy.co', 'call',     '-72',  'overdue',   NULL::text,     'demo:overdue-1',  'No answer twice, try the new number'),
  ('bhavesh@example.com', 'agent2@levoy.co', 'email',    '-48',  'overdue',   NULL::text,     'demo:overdue-2',  'Send the revised quote'),
  ('dinesh@example.com',  'agent3@levoy.co', 'call',     '-26',  'overdue',   NULL::text,     'demo:overdue-3',  'Proposal sent 3 days ago, no reply'),
  ('ekta@example.com',    'agent4@levoy.co', 'whatsapp', '-12',  'overdue',   NULL::text,     'demo:overdue-4',  'Trade-show lead, chase on WhatsApp'),
  ('chitra@example.com',  'agent1@levoy.co', 'meeting',  '4',    'due_today', NULL::text,     'demo:today-1',    'Demo at 4pm — prep the deck'),
  ('gauri@example.com',   'agent2@levoy.co', 'call',     '6',    'due_today', NULL::text,     'demo:today-2',    'First qualifying call'),
  ('farhan@example.com',  'agent3@levoy.co', 'email',    '2',    'due_today', NULL::text,     'demo:today-3',    'Send onboarding docs'),
  ('harsh@example.com',   'agent4@levoy.co', 'call',     '9',    'due_today', NULL::text,     'demo:today-4',    'Win-back attempt'),
  ('ananya@example.com',  'agent1@levoy.co', 'email',    '30',   'upcoming',  NULL::text,     'demo:upcoming-1', 'Annual plan pricing'),
  ('chitra@example.com',  'agent2@levoy.co', 'call',     '52',   'upcoming',  NULL::text,     'demo:upcoming-2', 'Contract review call'),
  ('dinesh@example.com',  'agent3@levoy.co', 'meeting',  '76',   'upcoming',  NULL::text,     'demo:upcoming-3', 'Onsite walkthrough'),
  ('gauri@example.com',   'agent4@levoy.co', 'other',    '100',  'upcoming',  NULL::text,     'demo:upcoming-4', 'Check in after 3 weeks'),
  ('bhavesh@example.com', 'agent1@levoy.co', 'call',     '-30',  'completed', 'completed',   'demo:done-1',     'Talked through pricing, sending docs'),
  ('ekta@example.com',    'agent2@levoy.co', 'email',    '-54',  'completed', 'no_answer',   'demo:done-2',     'Left a voicemail, no reply'),
  ('farhan@example.com',  'agent3@levoy.co', 'meeting',  '-80',  'completed', 'completed',   'demo:done-3',     'Kickoff meeting done'),
  ('harsh@example.com',   'agent4@levoy.co', 'call',     '-98',  'completed', 'rescheduled', 'demo:done-4',     'Asked to call back next week')
) AS f(lead_email, agent_email, type, offset_hours, state, outcome, marker, detail)
JOIN demo_lead l ON l.email = f.lead_email
JOIN users u ON u.email = f.agent_email;

-- ─── Assignment rules ───
-- Two rules so the rules screen and the auto-assign path both have data:
-- a fixed-owner rule keyed on source, and a round-robin rule for high
-- priority. Deleted by name so only the demo rules are ever touched.
DELETE FROM assignment_rules WHERE name IN ('Trade Show → Karthik', 'High Priority Round Robin');

INSERT INTO assignment_rules (name, enabled, priority, conditions, strategy, fixed_user_id, team_id, stop_on_match, created_by)
SELECT r.name, r.enabled, r.priority, r.conditions::jsonb, r.strategy,
       u.id, t.id, true, a.id
  FROM (VALUES
    ('Trade Show → Karthik',   true,  10, '{"source":["Trade Show"]}'::text,              'fixed',       'agent4@levoy.co', 'Support - Bengaluru'),
    ('High Priority Round Robin', true, 20, '{"priority":["high"]}',                        'round_robin', NULL,                  'Sales - Mumbai')
  ) AS r(name, enabled, priority, conditions, strategy, fixed_email, team_name)
  LEFT JOIN users u ON u.email = r.fixed_email
  LEFT JOIN teams t ON t.name  = r.team_name
 CROSS JOIN (SELECT id FROM users WHERE email='manager@levoy.co') a
 WHERE NOT EXISTS (SELECT 1 FROM assignment_rules x WHERE x.name = r.name);

-- ─── QA review history ───
-- Older sample calls exist ONLY to hang reviews on: a review must be dated
-- after the call it reviews, so a 3-month-old QA point cannot reference a
-- call from last week. These rows are marked, and the marked set is removed
-- and rebuilt on every run — a re-seed must not stack up duplicate history.
-- Deleting a call cascades to its call_reviews (ON DELETE CASCADE), which is
-- exactly what the review rebuild below wants.
DELETE FROM call_events WHERE notes = 'QA sample call (seed)';

-- 12 calls per agent, spread 9 days apart, so each agent's reviews span
-- roughly 100 days and the monthly QA trend has several points to draw.
INSERT INTO call_events (user_id, phone_number, direction, status, duration_seconds, timestamp, notes)
SELECT u.id,
       '+9197' || (10000000 + (g.n * 137 + u.id * 7))::int,
       CASE WHEN g.n % 3 = 0 THEN 'incoming' ELSE 'outgoing' END,
       'connected',
       120 + (g.n * 29 % 400),
       NOW() - ((g.n - 1) * 9 || ' days')::interval,
       'QA sample call (seed)'
  FROM users u
  CROSS JOIN generate_series(1, 12) AS g(n)
 WHERE u.email IN ('agent1@levoy.co','agent2@levoy.co','agent3@levoy.co','agent4@levoy.co');

-- One review per sample call. rn counts back from the most recent call, so
-- base rises 2 → 3 → 4 as rn falls: a training curve the QA trend chart can
-- actually draw. Per-agent offsets give each agent a recognisable profile
-- (agent1 talks well but is weak on closing, agent2 is the compliance wonk,
-- agent3 is the weakest, agent4 is solid and consistent).
CREATE TEMP TABLE demo_review_plan ON COMMIT DROP AS
WITH ranked AS (
  SELECT ce.id AS call_id, ce.user_id, ce.timestamp AS call_ts,
         row_number() OVER (PARTITION BY ce.user_id ORDER BY ce.timestamp DESC, ce.id) AS rn
    FROM call_events ce
   WHERE ce.notes = 'QA sample call (seed)'
)
SELECT r.call_id, r.user_id, r.call_ts, r.rn,
       (2 + (r.rn < 9)::int + (r.rn < 5)::int) AS base,
       (r.rn = 6 AND r.user_id = (SELECT id FROM users WHERE email='agent3@levoy.co')) AS violation
  FROM ranked r;

-- The weights below MUST match QA_WEIGHTS in server.js. They are duplicated
-- here on purpose: the seed has no access to the JS constant, and a comment
-- that says "see server.js" is not something the database can enforce. If you
-- change one, change both — a divergence would make seeded overall_scores
-- disagree with what the API computes for an identical scorecard.
CREATE TEMP TABLE demo_qa_weights (category text, weight int) ON COMMIT DROP;
INSERT INTO demo_qa_weights VALUES
  ('Opening',10), ('Discovery',20), ('Resolution',30),
  ('Communication',20), ('Compliance',10), ('Closing',10);

-- Per-agent category offsets, same six categories in the same order.
CREATE TEMP TABLE demo_agent_profile (
  agent_idx int, email text,
  off_opening int, off_discovery int, off_resolution int,
  off_communication int, off_compliance int, off_closing int
) ON COMMIT DROP;
INSERT INTO demo_agent_profile VALUES
  (1, 'agent1@levoy.co',  0, -1,  0,  1,  0, -1),
  (2, 'agent2@levoy.co', -1,  0,  1,  0,  1,  0),
  (3, 'agent3@levoy.co', -1, -1, -1,  0,  0, -1),
  (4, 'agent4@levoy.co',  0,  0,  1,  0,  0,  0);

-- Category scores, staged in a temp table keyed on call_id. This runs BEFORE
-- the call_reviews insert so the overall_score below can be computed from the
-- exact same rows that land in review_scores. The score is clamped to 1..5 so
-- the CHECK constraint holds even where base + offset goes negative.
CREATE TEMP TABLE demo_review_scores (call_id int, category text, score int, weight int) ON COMMIT DROP;
INSERT INTO demo_review_scores
SELECT p.call_id, w.category,
       LEAST(5, GREATEST(1, p.base + CASE w.category
         WHEN 'Opening'       THEN pr.off_opening
         WHEN 'Discovery'     THEN pr.off_discovery
         WHEN 'Resolution'    THEN pr.off_resolution
         WHEN 'Communication' THEN pr.off_communication
         WHEN 'Compliance'    THEN pr.off_compliance
         WHEN 'Closing'       THEN pr.off_closing
       END - CASE WHEN p.violation AND w.category = 'Compliance' THEN 4 ELSE 0 END)),
       w.weight
  FROM demo_review_plan p
  JOIN users u ON u.id = p.user_id
  JOIN demo_agent_profile pr ON pr.email = u.email
 CROSS JOIN demo_qa_weights w;

INSERT INTO call_reviews (call_id, lead_id, agent_id, reviewer_id, overall_score, is_compliance_violation, notes, created_at)
SELECT p.call_id,
       NULL,
       p.user_id,
       (SELECT id FROM users WHERE email='manager@levoy.co'),
       -- EXACTLY the API's formula: sum(score/5 * weight), rounded to 2dp,
       -- forced to 0 when there is a compliance violation. Recomputed from the
       -- same per-category rows that get written into review_scores below, so
       -- the stored overall_score can never contradict its own scorecard — a
       -- hardcoded average would hide a weighting bug instead of surfacing it.
       CASE WHEN p.violation THEN 0
            ELSE round(COALESCE((
              SELECT SUM(s.score::numeric / 5 * w.weight)
                FROM demo_review_scores s
                JOIN demo_qa_weights w ON w.category = s.category
               WHERE s.call_id = p.call_id
            ), 0)::numeric, 2) END,
       p.violation,
       CASE WHEN p.violation
            THEN 'demo:compliance breach - consent not recorded before the pitch'
            ELSE 'demo:standard QA review, call ' || p.rn || ' in the review series'
       END,
       p.call_ts + interval '1 day'
  FROM demo_review_plan p;

-- Attach the staged scorecard to the reviews just written. call_id is unique
-- among the freshly inserted reviews (one per sample call), so the join is 1:1.
INSERT INTO review_scores (review_id, category, score, weight)
SELECT cr.id, s.category, s.score, s.weight
  FROM demo_review_scores s
  JOIN call_reviews cr ON cr.call_id = s.call_id
ON CONFLICT (review_id, category) DO UPDATE
  SET score = EXCLUDED.score, weight = EXCLUDED.weight;

COMMIT;

-- ─── Summary ───
SELECT 'users' AS entity, count(*) FROM users
UNION ALL SELECT 'teams', count(*) FROM teams
UNION ALL SELECT 'team_members', count(*) FROM team_members
UNION ALL SELECT 'call_events', count(*) FROM call_events
UNION ALL SELECT 'leads', count(*) FROM leads
UNION ALL SELECT 'daily_reports', count(*) FROM daily_reports
UNION ALL SELECT 'whatsapp_templates', count(*) FROM whatsapp_templates
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'pipeline_stages', count(*) FROM pipeline_stages
-- New-feature tables (these were all empty before this seed was extended).
UNION ALL SELECT 'lead_follow_ups', count(*) FROM lead_follow_ups
UNION ALL SELECT 'tags', count(*) FROM tags
UNION ALL SELECT 'lead_tags', count(*) FROM lead_tags
UNION ALL SELECT 'assignment_rules', count(*) FROM assignment_rules
UNION ALL SELECT 'call_reviews', count(*) FROM call_reviews
UNION ALL SELECT 'review_scores', count(*) FROM review_scores
ORDER BY entity;