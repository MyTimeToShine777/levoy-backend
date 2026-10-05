-- Baseline: the schema exactly as created by the pre-Prisma initDB().
-- Databases that were built by initDB() are marked as already applied with
-- `prisma migrate resolve --applied 0_init` (see src/db/migrate.js).

CREATE TABLE assignment_rules (
    id integer NOT NULL,
    name character varying(120) NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    strategy character varying(20) DEFAULT 'round_robin'::character varying NOT NULL,
    fixed_user_id integer,
    team_id integer,
    stop_on_match boolean DEFAULT true NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT assignment_rules_strategy_check CHECK (((strategy)::text = ANY ((ARRAY['round_robin'::character varying, 'least_loaded'::character varying, 'fixed'::character varying])::text[])))
);

CREATE SEQUENCE assignment_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE assignment_rules_id_seq OWNED BY assignment_rules.id;

CREATE TABLE audit_log (
    id integer NOT NULL,
    actor_id integer,
    action character varying(80) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(64),
    details jsonb,
    ip character varying(64),
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE audit_log_id_seq OWNED BY audit_log.id;

CREATE TABLE call_events (
    id integer NOT NULL,
    user_id integer,
    phone_number character varying(50) NOT NULL,
    direction character varying(20) DEFAULT 'outgoing'::character varying,
    status character varying(20) DEFAULT 'connected'::character varying,
    duration_seconds integer DEFAULT 0,
    "timestamp" timestamp without time zone DEFAULT now(),
    caller_id character varying(255),
    notes text,
    is_pinned boolean DEFAULT false,
    recording_path character varying(500)
);

CREATE SEQUENCE call_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE call_events_id_seq OWNED BY call_events.id;

CREATE TABLE call_recordings (
    id integer NOT NULL,
    call_id integer,
    user_id integer,
    file_path character varying(500) NOT NULL,
    file_size integer DEFAULT 0,
    duration_seconds integer,
    uploaded_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE call_recordings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE call_recordings_id_seq OWNED BY call_recordings.id;

CREATE TABLE call_reviews (
    id integer NOT NULL,
    call_id integer,
    lead_id integer,
    agent_id integer,
    reviewer_id integer,
    overall_score numeric(6,2) DEFAULT 0 NOT NULL,
    is_compliance_violation boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE call_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE call_reviews_id_seq OWNED BY call_reviews.id;

CREATE TABLE exports (
    id integer NOT NULL,
    user_id integer,
    type character varying(50) NOT NULL,
    params jsonb,
    file_path character varying(500),
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE exports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE exports_id_seq OWNED BY exports.id;

CREATE TABLE invitations (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'agent'::character varying NOT NULL,
    invited_by integer,
    token character varying(128) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    accepted_at timestamp without time zone,
    CONSTRAINT invitations_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'manager'::character varying, 'agent'::character varying])::text[]))),
    CONSTRAINT invitations_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'revoked'::character varying])::text[])))
);

CREATE SEQUENCE invitations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE invitations_id_seq OWNED BY invitations.id;

CREATE TABLE lead_activities (
    id integer NOT NULL,
    lead_id integer,
    user_id integer,
    activity_type character varying(20) NOT NULL,
    summary text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT lead_activities_activity_type_check CHECK (((activity_type)::text = ANY ((ARRAY['call'::character varying, 'follow_up'::character varying, 'assignment'::character varying, 'status_change'::character varying, 'note'::character varying, 'email'::character varying, 'whatsapp'::character varying, 'meeting'::character varying, 'review'::character varying, 'system'::character varying])::text[])))
);

CREATE SEQUENCE lead_activities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE lead_activities_id_seq OWNED BY lead_activities.id;

CREATE TABLE lead_assignees (
    id integer NOT NULL,
    lead_id integer,
    user_id integer,
    role character varying(20) DEFAULT 'collaborator'::character varying NOT NULL,
    assigned_by integer,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT lead_assignees_role_check CHECK (((role)::text = ANY ((ARRAY['owner'::character varying, 'collaborator'::character varying, 'watcher'::character varying])::text[])))
);

CREATE SEQUENCE lead_assignees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE lead_assignees_id_seq OWNED BY lead_assignees.id;

CREATE TABLE lead_assignments (
    id integer NOT NULL,
    lead_id integer,
    previous_user_id integer,
    user_id integer,
    assigned_by integer,
    note text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE lead_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE lead_assignments_id_seq OWNED BY lead_assignments.id;

CREATE TABLE lead_follow_ups (
    id integer NOT NULL,
    lead_id integer,
    user_id integer,
    type character varying(20) DEFAULT 'call'::character varying NOT NULL,
    due_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    outcome character varying(20),
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT lead_follow_ups_outcome_check CHECK (((outcome)::text = ANY ((ARRAY['completed'::character varying, 'no_answer'::character varying, 'rescheduled'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT lead_follow_ups_type_check CHECK (((type)::text = ANY ((ARRAY['call'::character varying, 'email'::character varying, 'meeting'::character varying, 'whatsapp'::character varying, 'other'::character varying])::text[])))
);

CREATE SEQUENCE lead_follow_ups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE lead_follow_ups_id_seq OWNED BY lead_follow_ups.id;

CREATE TABLE lead_scoring_settings (
    key character varying(60) NOT NULL,
    value numeric(14,4) NOT NULL,
    description text,
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE lead_status_rules (
    id integer NOT NULL,
    call_status character varying(80) NOT NULL,
    status_key character varying(80) NOT NULL,
    base_priority integer DEFAULT 0 NOT NULL,
    active_pipeline boolean DEFAULT false NOT NULL,
    win_prob numeric(6,4) DEFAULT 0 NOT NULL,
    next_action text,
    reached boolean DEFAULT false NOT NULL,
    interested_plus boolean DEFAULT false NOT NULL,
    demo_plus boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT lead_status_rules_win_prob_check CHECK (((win_prob >= (0)::numeric) AND (win_prob <= (1)::numeric)))
);

CREATE SEQUENCE lead_status_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE lead_status_rules_id_seq OWNED BY lead_status_rules.id;

CREATE TABLE lead_tags (
    lead_id integer NOT NULL,
    tag_id integer NOT NULL
);

CREATE TABLE lead_telecaller_map (
    name character varying(150) NOT NULL,
    user_id integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE lead_telecaller_unmatched (
    name character varying(150) NOT NULL,
    leads_count integer DEFAULT 0 NOT NULL,
    last_seen_at timestamp without time zone DEFAULT now()
);

CREATE TABLE leads (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(50) NOT NULL,
    email character varying(255),
    status character varying(20) DEFAULT 'new'::character varying,
    source character varying(255),
    priority character varying(20) DEFAULT 'normal'::character varying,
    owner_id integer,
    assigned_to integer,
    notes text,
    last_contacted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    merged_into_lead_id integer,
    deleted_at timestamp without time zone,
    segment character varying(150),
    lead_assigned_date date,
    call_attempted_date date,
    telecaller_name character varying(150),
    customer_name character varying(255),
    pharmacy_name character varying(255),
    locality character varying(150),
    address text,
    followup_date date,
    call_done character varying(30),
    call_status character varying(80),
    remarks text,
    pharmacy_locality_key character varying(330),
    duplicate_reasons character varying(200),
    phone_clean character varying(20),
    is_duplicate boolean DEFAULT false,
    followup_clean date,
    is_active_lead boolean DEFAULT false,
    followup_window character varying(20),
    days_since_last_call integer,
    priority_score integer DEFAULT 0,
    tier character varying(20) DEFAULT 'Closed'::character varying,
    next_best_action text,
    data_check character varying(200),
    queue_key character varying(80),
    queue_rank integer,
    win_probability numeric(6,4) DEFAULT 0
);

CREATE SEQUENCE leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE leads_id_seq OWNED BY leads.id;

CREATE TABLE notifications (
    id integer NOT NULL,
    user_id integer,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    message text,
    data jsonb,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE notifications_id_seq OWNED BY notifications.id;

CREATE TABLE password_resets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(128) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    request_ip character varying(64)
);

CREATE SEQUENCE password_resets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE password_resets_id_seq OWNED BY password_resets.id;

CREATE TABLE pipeline_stages (
    id integer NOT NULL,
    name character varying(60) NOT NULL,
    slug character varying(60) NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    color character varying(20) DEFAULT '#64748b'::character varying,
    is_won boolean DEFAULT false NOT NULL,
    is_lost boolean DEFAULT false NOT NULL,
    probability integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE pipeline_stages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE pipeline_stages_id_seq OWNED BY pipeline_stages.id;

CREATE TABLE review_scores (
    id integer NOT NULL,
    review_id integer,
    category character varying(40) NOT NULL,
    score integer NOT NULL,
    weight integer NOT NULL,
    CONSTRAINT review_scores_score_check CHECK (((score >= 1) AND (score <= 5)))
);

CREATE SEQUENCE review_scores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE review_scores_id_seq OWNED BY review_scores.id;

CREATE TABLE tags (
    id integer NOT NULL,
    name character varying(60) NOT NULL,
    color character varying(20) DEFAULT '#3b82f6'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE tags_id_seq OWNED BY tags.id;

CREATE TABLE team_members (
    id integer NOT NULL,
    team_id integer,
    user_id integer,
    joined_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE team_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE team_members_id_seq OWNED BY team_members.id;

CREATE TABLE teams (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE teams_id_seq OWNED BY teams.id;

CREATE TABLE user_capacity (
    user_id integer NOT NULL,
    max_open_leads integer,
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE user_settings (
    id integer NOT NULL,
    user_id integer,
    key character varying(100) NOT NULL,
    value text
);

CREATE SEQUENCE user_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE user_settings_id_seq OWNED BY user_settings.id;

CREATE TABLE users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(50),
    role character varying(20) DEFAULT 'agent'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    avatar_url character varying(500),
    last_login_at timestamp without time zone
);

CREATE SEQUENCE users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE users_id_seq OWNED BY users.id;

CREATE TABLE whatsapp_templates (
    id integer NOT NULL,
    user_id integer,
    name character varying(255) NOT NULL,
    category character varying(50),
    language character varying(20) DEFAULT 'en'::character varying,
    content text,
    variables jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE whatsapp_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE whatsapp_templates_id_seq OWNED BY whatsapp_templates.id;

ALTER TABLE ONLY assignment_rules ALTER COLUMN id SET DEFAULT nextval('assignment_rules_id_seq'::regclass);

ALTER TABLE ONLY audit_log ALTER COLUMN id SET DEFAULT nextval('audit_log_id_seq'::regclass);

ALTER TABLE ONLY call_events ALTER COLUMN id SET DEFAULT nextval('call_events_id_seq'::regclass);

ALTER TABLE ONLY call_recordings ALTER COLUMN id SET DEFAULT nextval('call_recordings_id_seq'::regclass);

ALTER TABLE ONLY call_reviews ALTER COLUMN id SET DEFAULT nextval('call_reviews_id_seq'::regclass);

ALTER TABLE ONLY exports ALTER COLUMN id SET DEFAULT nextval('exports_id_seq'::regclass);

ALTER TABLE ONLY invitations ALTER COLUMN id SET DEFAULT nextval('invitations_id_seq'::regclass);

ALTER TABLE ONLY lead_activities ALTER COLUMN id SET DEFAULT nextval('lead_activities_id_seq'::regclass);

ALTER TABLE ONLY lead_assignees ALTER COLUMN id SET DEFAULT nextval('lead_assignees_id_seq'::regclass);

ALTER TABLE ONLY lead_assignments ALTER COLUMN id SET DEFAULT nextval('lead_assignments_id_seq'::regclass);

ALTER TABLE ONLY lead_follow_ups ALTER COLUMN id SET DEFAULT nextval('lead_follow_ups_id_seq'::regclass);

ALTER TABLE ONLY lead_status_rules ALTER COLUMN id SET DEFAULT nextval('lead_status_rules_id_seq'::regclass);

ALTER TABLE ONLY leads ALTER COLUMN id SET DEFAULT nextval('leads_id_seq'::regclass);

ALTER TABLE ONLY notifications ALTER COLUMN id SET DEFAULT nextval('notifications_id_seq'::regclass);

ALTER TABLE ONLY password_resets ALTER COLUMN id SET DEFAULT nextval('password_resets_id_seq'::regclass);

ALTER TABLE ONLY pipeline_stages ALTER COLUMN id SET DEFAULT nextval('pipeline_stages_id_seq'::regclass);

ALTER TABLE ONLY review_scores ALTER COLUMN id SET DEFAULT nextval('review_scores_id_seq'::regclass);

ALTER TABLE ONLY tags ALTER COLUMN id SET DEFAULT nextval('tags_id_seq'::regclass);

ALTER TABLE ONLY team_members ALTER COLUMN id SET DEFAULT nextval('team_members_id_seq'::regclass);

ALTER TABLE ONLY teams ALTER COLUMN id SET DEFAULT nextval('teams_id_seq'::regclass);

ALTER TABLE ONLY user_settings ALTER COLUMN id SET DEFAULT nextval('user_settings_id_seq'::regclass);

ALTER TABLE ONLY users ALTER COLUMN id SET DEFAULT nextval('users_id_seq'::regclass);

ALTER TABLE ONLY whatsapp_templates ALTER COLUMN id SET DEFAULT nextval('whatsapp_templates_id_seq'::regclass);

ALTER TABLE ONLY assignment_rules
    ADD CONSTRAINT assignment_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY call_events
    ADD CONSTRAINT call_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY call_recordings
    ADD CONSTRAINT call_recordings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY call_reviews
    ADD CONSTRAINT call_reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY exports
    ADD CONSTRAINT exports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invitations
    ADD CONSTRAINT invitations_token_key UNIQUE (token);

ALTER TABLE ONLY lead_activities
    ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY lead_assignees
    ADD CONSTRAINT lead_assignees_lead_id_user_id_key UNIQUE (lead_id, user_id);

ALTER TABLE ONLY lead_assignees
    ADD CONSTRAINT lead_assignees_pkey PRIMARY KEY (id);

ALTER TABLE ONLY lead_assignments
    ADD CONSTRAINT lead_assignments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY lead_follow_ups
    ADD CONSTRAINT lead_follow_ups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY lead_scoring_settings
    ADD CONSTRAINT lead_scoring_settings_pkey PRIMARY KEY (key);

ALTER TABLE ONLY lead_status_rules
    ADD CONSTRAINT lead_status_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY lead_status_rules
    ADD CONSTRAINT lead_status_rules_status_key_key UNIQUE (status_key);

ALTER TABLE ONLY lead_tags
    ADD CONSTRAINT lead_tags_pkey PRIMARY KEY (lead_id, tag_id);

ALTER TABLE ONLY lead_telecaller_map
    ADD CONSTRAINT lead_telecaller_map_pkey PRIMARY KEY (name);

ALTER TABLE ONLY lead_telecaller_unmatched
    ADD CONSTRAINT lead_telecaller_unmatched_pkey PRIMARY KEY (name);

ALTER TABLE ONLY leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY password_resets
    ADD CONSTRAINT password_resets_token_key UNIQUE (token);

ALTER TABLE ONLY pipeline_stages
    ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY pipeline_stages
    ADD CONSTRAINT pipeline_stages_slug_key UNIQUE (slug);

ALTER TABLE ONLY review_scores
    ADD CONSTRAINT review_scores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY review_scores
    ADD CONSTRAINT review_scores_review_id_category_key UNIQUE (review_id, category);

ALTER TABLE ONLY tags
    ADD CONSTRAINT tags_name_key UNIQUE (name);

ALTER TABLE ONLY tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY team_members
    ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);

ALTER TABLE ONLY teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);

ALTER TABLE ONLY user_capacity
    ADD CONSTRAINT user_capacity_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY user_settings
    ADD CONSTRAINT user_settings_user_id_key_key UNIQUE (user_id, key);

ALTER TABLE ONLY users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);

CREATE INDEX idx_assignment_rules_created ON assignment_rules USING btree (created_at);

CREATE INDEX idx_assignment_rules_order ON assignment_rules USING btree (priority, id);

CREATE INDEX idx_audit_log_action ON audit_log USING btree (action, created_at DESC);

CREATE INDEX idx_audit_log_actor ON audit_log USING btree (actor_id, created_at DESC);

CREATE INDEX idx_audit_log_created ON audit_log USING btree (created_at DESC);

CREATE INDEX idx_call_recordings_call ON call_recordings USING btree (call_id);

CREATE INDEX idx_call_reviews_agent ON call_reviews USING btree (agent_id, created_at DESC);

CREATE INDEX idx_call_reviews_call ON call_reviews USING btree (call_id);

CREATE INDEX idx_calls_phone ON call_events USING btree (phone_number);

CREATE INDEX idx_calls_timestamp ON call_events USING btree ("timestamp");

CREATE INDEX idx_calls_user ON call_events USING btree (user_id);

CREATE INDEX idx_follow_ups_lead ON lead_follow_ups USING btree (lead_id, due_at DESC);

CREATE INDEX idx_follow_ups_user_due ON lead_follow_ups USING btree (user_id, due_at);

CREATE INDEX idx_invitations_email ON invitations USING btree (email, status);

CREATE INDEX idx_lead_activities_lead ON lead_activities USING btree (lead_id, created_at DESC);

CREATE INDEX idx_lead_assignees_lead ON lead_assignees USING btree (lead_id);

CREATE UNIQUE INDEX idx_lead_assignees_one_owner ON lead_assignees USING btree (lead_id) WHERE ((role)::text = 'owner'::text);

CREATE INDEX idx_lead_assignees_user ON lead_assignees USING btree (user_id);

CREATE INDEX idx_lead_assignments_lead ON lead_assignments USING btree (lead_id, id DESC);

CREATE INDEX idx_lead_tags_tag ON lead_tags USING btree (tag_id);

CREATE INDEX idx_leads_assigned_to ON leads USING btree (assigned_to);

CREATE INDEX idx_leads_call_status ON leads USING btree (call_status);

CREATE INDEX idx_leads_followup_window ON leads USING btree (followup_window);

CREATE INDEX idx_leads_locality ON leads USING btree (locality);

CREATE INDEX idx_leads_merged ON leads USING btree (merged_into_lead_id);

CREATE INDEX idx_leads_owner ON leads USING btree (owner_id);

CREATE INDEX idx_leads_phone_clean ON leads USING btree (phone_clean);

CREATE INDEX idx_leads_pl_key ON leads USING btree (pharmacy_locality_key);

CREATE INDEX idx_leads_priority ON leads USING btree (priority_score DESC);

CREATE INDEX idx_leads_segment ON leads USING btree (segment);

CREATE INDEX idx_leads_status ON leads USING btree (status);

CREATE INDEX idx_leads_telecaller ON leads USING btree (telecaller_name);

CREATE INDEX idx_password_resets_active ON password_resets USING btree (token) WHERE (used_at IS NULL);

CREATE INDEX idx_password_resets_user ON password_resets USING btree (user_id);

CREATE INDEX idx_pipeline_stages_position ON pipeline_stages USING btree ("position", id);

CREATE INDEX idx_tags_name ON tags USING btree (lower((name)::text));

CREATE INDEX idx_telecaller_map_lower ON lead_telecaller_map USING btree (lower(btrim((name)::text)));

ALTER TABLE ONLY assignment_rules
    ADD CONSTRAINT assignment_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY assignment_rules
    ADD CONSTRAINT assignment_rules_fixed_user_id_fkey FOREIGN KEY (fixed_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY assignment_rules
    ADD CONSTRAINT assignment_rules_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY call_events
    ADD CONSTRAINT call_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY call_recordings
    ADD CONSTRAINT call_recordings_call_id_fkey FOREIGN KEY (call_id) REFERENCES call_events(id) ON DELETE CASCADE;

ALTER TABLE ONLY call_recordings
    ADD CONSTRAINT call_recordings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY call_reviews
    ADD CONSTRAINT call_reviews_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY call_reviews
    ADD CONSTRAINT call_reviews_call_id_fkey FOREIGN KEY (call_id) REFERENCES call_events(id) ON DELETE CASCADE;

ALTER TABLE ONLY call_reviews
    ADD CONSTRAINT call_reviews_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE ONLY call_reviews
    ADD CONSTRAINT call_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY exports
    ADD CONSTRAINT exports_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY invitations
    ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY lead_activities
    ADD CONSTRAINT lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY lead_activities
    ADD CONSTRAINT lead_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY lead_assignees
    ADD CONSTRAINT lead_assignees_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY lead_assignees
    ADD CONSTRAINT lead_assignees_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY lead_assignees
    ADD CONSTRAINT lead_assignees_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY lead_assignments
    ADD CONSTRAINT lead_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY lead_assignments
    ADD CONSTRAINT lead_assignments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY lead_assignments
    ADD CONSTRAINT lead_assignments_previous_user_id_fkey FOREIGN KEY (previous_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY lead_assignments
    ADD CONSTRAINT lead_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY lead_follow_ups
    ADD CONSTRAINT lead_follow_ups_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY lead_follow_ups
    ADD CONSTRAINT lead_follow_ups_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY lead_tags
    ADD CONSTRAINT lead_tags_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

ALTER TABLE ONLY lead_tags
    ADD CONSTRAINT lead_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

ALTER TABLE ONLY lead_telecaller_map
    ADD CONSTRAINT lead_telecaller_map_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY leads
    ADD CONSTRAINT leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY leads
    ADD CONSTRAINT leads_merged_into_lead_id_fkey FOREIGN KEY (merged_into_lead_id) REFERENCES leads(id) ON DELETE SET NULL;

ALTER TABLE ONLY leads
    ADD CONSTRAINT leads_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY password_resets
    ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY review_scores
    ADD CONSTRAINT review_scores_review_id_fkey FOREIGN KEY (review_id) REFERENCES call_reviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY tags
    ADD CONSTRAINT tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY teams
    ADD CONSTRAINT teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE ONLY user_capacity
    ADD CONSTRAINT user_capacity_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
