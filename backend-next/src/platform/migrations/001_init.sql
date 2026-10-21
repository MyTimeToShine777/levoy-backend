-- Platform schema: everything that spans customers. Customer data lives in each customer's own schema.

-- One row per customer company (a "workspace"). `schema_name` is where that customer's tables live.
CREATE TABLE customers (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  slug         VARCHAR(80)  NOT NULL UNIQUE,
  schema_name  VARCHAR(63)  NOT NULL UNIQUE,
  status       VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  owner_email  VARCHAR(255),
  notes        TEXT,
  created_at   TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
  suspended_at TIMESTAMP
);

-- The sign-in directory: which customer an email belongs to. One email = one customer.
CREATE TABLE workspace_users (
  email       VARCHAR(255) PRIMARY KEY,                 -- always lower-case
  customer_id INTEGER      NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  created_at  TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);
CREATE INDEX idx_workspace_users_customer ON workspace_users (customer_id);

-- People who run the platform itself (create customers, manage subscriptions).
CREATE TABLE platform_admins (
  id         SERIAL PRIMARY KEY,
  email      VARCHAR(255) NOT NULL UNIQUE,              -- always lower-case
  name       VARCHAR(200) NOT NULL DEFAULT 'Platform owner',
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- The plan catalog. `features` is the FULL set of feature keys the plan includes (keys are defined in code,
-- because each one gates specific code); everything else here is editable.
CREATE TABLE plans (
  key           VARCHAR(30) PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  price_monthly NUMERIC(10, 2),                          -- NULL = not sold online ("contact us")
  currency      VARCHAR(10)  NOT NULL DEFAULT 'INR',
  tagline       TEXT         NOT NULL DEFAULT '',
  sort_order    INTEGER      NOT NULL DEFAULT 0,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  features      TEXT[]       NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- One subscription per customer. Dates are UTC wall-clock, like everywhere else in Callio.
CREATE TABLE subscriptions (
  customer_id          INTEGER PRIMARY KEY REFERENCES customers (id) ON DELETE CASCADE,
  plan_key             VARCHAR(30) NOT NULL DEFAULT 'free' REFERENCES plans (key) ON UPDATE CASCADE,
  status               VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
  trial_started_at     TIMESTAMP,
  trial_ends_at        TIMESTAMP,
  current_period_end   TIMESTAMP,
  cancel_at_period_end BOOLEAN     NOT NULL DEFAULT FALSE,
  changed_by           VARCHAR(255),
  updated_at           TIMESTAMP   NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- Every change to a subscription, newest first in the UI.
CREATE TABLE subscription_events (
  id          BIGSERIAL PRIMARY KEY,
  customer_id INTEGER      NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  action      VARCHAR(40)  NOT NULL,
  details     JSONB        NOT NULL DEFAULT '{}',
  actor       VARCHAR(255),
  created_at  TIMESTAMP    NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);
CREATE INDEX idx_subscription_events_customer ON subscription_events (customer_id, created_at DESC);
