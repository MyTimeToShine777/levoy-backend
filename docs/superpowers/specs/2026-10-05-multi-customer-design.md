# Callio multi-customer platform — design

Callio is sold as a tool: each customer company gets its own system, its own team and agents, and its own
subscription. The platform owner (you) manages customers and their subscriptions.

## Decisions (agreed with the owner)

- **Subscriber = a customer company** (a "workspace"), not an individual user.
- **Data isolation = one Postgres schema per customer.** Every customer has its own copy of the 46 tables
  (same Prisma migrations). Customers cannot see each other's data even if a query forgets a filter.
- **One email belongs to exactly one customer.**
- Sign-in stays "emailed code via medivoy.api" (see the OTP section of the README).

## Platform schema (`levoy_platform`)

Not managed by Prisma; plain SQL migrations in `src/platform/migrations/` tracked in `schema_migrations`.

| table | purpose |
|---|---|
| `customers` | id, name, slug, `schema_name`, status (`active`/`suspended`), owner_email, created_at |
| `workspace_users` | email (unique) → customer_id. The login directory: tells a sign-in which customer an email is in |
| `platform_admins` | platform owners (email, name, is_active) |
| `plans` | editable catalog: key, name, price_monthly, currency, tagline, sort, is_active, `features text[]` (full set) |
| `subscriptions` | one row per customer: plan, status (`trial`/`active`/`expired`/`cancelled`), trial dates, current_period_end, cancel_at_period_end |
| `subscription_events` | history of every change (grant, extend, set date, cancel, refund, payment, trial) |

The existing Callio data (schema `levoy`, or `public` in the test DB) is registered as **customer #1**.

## Request flow

1. Sign-in: `send-otp {email}` → directory finds the customer → code is sent only if that customer has an active
   user with that email. `verify-otp` returns a JWT carrying `tid` (customer id).
2. Every authenticated request: `authMW` verifies the JWT, loads the customer (cached ~30 s), refuses
   suspended customers, then runs the rest of the request inside an `AsyncLocalStorage` tenant context.
3. `config/db.js` resolves `q()`, `tx()` and `pool` to a **per-customer pool** (`search_path` = the customer's
   schema, small `max`, idle connections released). With no tenant context the code **throws** rather than
   guessing — a missing context can never silently read another customer's data.
4. Platform owners get a session without `tid` (`plat: true`) and use `/api/platform/*`. "Open workspace"
   issues an audit-logged tenant session (support access).

## Things that must not leak (found in the code)

- `RbacService` permission cache was keyed by user id → keyed by schema + user id; Prisma client usage in
  `RbacService` replaced by SQL through `q()` (Prisma stays migration-only: one client per tenant would hold
  too many connections).
- File storage: deterministic paths (backups per user id) get a per-customer prefix; customer #1 keeps the
  legacy layout so existing files still resolve.
- Import preview cache is tagged with the customer and checked on use.
- Background jobs (`hourly`, `daily`, reminders) iterate customers, each inside its own context.
- Invitation tokens carry the customer (`c<id>_<hex>`) so the public accept-invite call can find the schema.

## Subscriptions

- `PlanService` reads the plan from `plans` (catalog) and `subscriptions` (state) instead of one global row.
  A feature is on if the customer's effective plan lists it. Trial, expiry and "expired = Free" rules unchanged.
- Platform owner actions: grant N months, extend, set an exact end date, cancel (now or at period end),
  refund (Stripe refund when the payment was by Stripe; otherwise recorded manually), start/clear trial.
- A customer's admin can see their plan and pay by Stripe; they can no longer give themselves free months.
- Plan catalog is editable (name, price, tagline, active, which features); the feature keys stay in code
  because each one gates specific code.

## Screens (web)

`/platform/customers`, `/platform/customers/[id]`, `/platform/plans`; visible only to platform owners.
Android and the Chrome extension need no change (their session just carries `tid`).

## Order of work

1. Foundation: platform schema + migrations, tenant context and pools, provisioning, registry, directory,
   login routing, JWT `tid`, RbacService off Prisma, jobs per customer, register customer #1.
2. Subscriptions and plan catalog; `PlanService` switch.
3. Platform console API + screens.
4. Stripe per customer, refunds.
5. Isolation tests (two customers, same user ids, cross-read attempts), full harness green.
