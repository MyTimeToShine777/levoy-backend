# Levoy Clone

A full-stack clone of [levoy.co](https://levoy.co) — a SIM-based telecalling analytics and CRM platform.

## What this is

Levoy monitors telesales calls across a team, tracks leads, and surfaces productivity analytics. This repo contains four working pieces:

| Path | What it is | Stack |
|------|-----------|-------|
| `frontend/` | Dashboard web app (the logged-in product) — CRM-style UI, light/dark theme, permission-driven sidebar | Next.js 16, App Router, TypeScript, Tailwind v4 |
| `backend-next/` | API server + database | Express (routes → controllers → services), PostgreSQL, Prisma (schema + migrations), JWT auth, bcrypt, Multer, `xlsx` |
| `android/` | Phone app that captures call logs on-device | Kotlin, Room, WorkManager, foreground service |
| `marketing-site/` | Public landing site (clone of levoy.co) | Next.js, App Router, Tailwind |
| `backend/` | Legacy Python API — **superseded by `backend-next/`**, kept for reference | FastAPI |

---

## Quick start

### 1. Database

Postgres must be running with a `levoy` database and a `levoy` login role.

```bash
sudo systemctl start postgresql
sudo -u postgres psql -c "CREATE ROLE levoy LOGIN PASSWORD 'levoy123';"
sudo -u postgres psql -c "CREATE DATABASE levoy OWNER levoy;"
```

The schema is owned by **Prisma** (`backend-next/prisma/schema.prisma`). On every start the server runs `prisma migrate deploy`, which applies any migration that has not run yet — including on a database built by the older hand-written `initDB` (it is baselined automatically; nothing is dropped). Reference data (pipeline stages, scoring rules) is seeded idempotently by `src/db/seed.js`.

```bash
cd backend-next
npm run db:status        # which migrations are applied
npm run db:migrate       # apply pending migrations by hand (the server also does this on boot)
npm run db:studio        # browse the data
```

CHECK constraints, the one-owner-per-lead partial index and a few expression indexes cannot be expressed in the Prisma schema, so they live in the migration SQL — keep them when you generate a new migration.

Demo data is optional: `backend-next/seed.sql` (a clean database works without it).
### 2. Backend

```bash
cd backend-next
npm install             # also runs `prisma generate`
node server.js          # or: npm run dev  (auto-restart on change)
npm test                # unit tests (assignment planner, Meta import, RBAC)
npm run lint
```

Code layout (`backend-next/src`): `routes/` (URL → handler) · `controllers/` (HTTP in/out) · `services/` (business rules and SQL) · `middleware/` (auth, `requirePage`, errors) · `config/` · `utils/` · `db/` (migrate, seed). `server.js.legacy` is the pre-refactor single file, kept only as the reference the characterization harness (`npm run characterize`) compares against.

Listens on **http://0.0.0.0:3001**.

The first admin is created on first start from `BOOTSTRAP_ADMIN_EMAIL` (only when the database has no active admin). Registration is invitation-only: admins add or invite people.

**Sign-in is by emailed code (OTP), with no passwords.** The person enters their email, receives a 6-digit code (valid 10 minutes) and enters it. The code is generated, emailed and checked by `medivoy.api` (the same service the pharmacy and vendor web apps use), reached at `MEDIVOY_API_BASE_URL`. Levoy only lets *its own active users* ask for a code, so strangers' addresses never reach Medivoy, then issues its own session once Medivoy confirms the code. Codes can be re-requested after `OTP_RESEND_SECONDS` (60). For automated tests, `backend-next/scripts/fake-medivoy.js` stands in for Medivoy (code `123456`).

Database connection is read from environment variables (a single `DATABASE_URL` wins), falling back to local defaults:

| Var | Default |
|-----|---------|
| `PG_HOST` | `localhost` |
| `PG_PORT` | `5432` |
| `PG_DB` | `levoy` |
| `PG_USER` | `levoy` |
| `PG_PASSWORD` | `levoy123` |
| `DATABASE_URL` | built from the `PG_*` values above |
| `JWT_SECRET` | `levoy-secret-key-2024` — **set your own** |
| `BOOTSTRAP_ADMIN_EMAIL` | unset (no admin is created); must be a real inbox, it receives the sign-in code |
| `MEDIVOY_API_BASE_URL` | unset — **required**, e.g. `https://api.medivoy.ae`; sends and checks the sign-in codes |
| `OTP_RESEND_SECONDS` | `60` |
| `CALLS_LEAD_ONLY` | `true` — the server keeps only uploaded calls whose number is a lead assigned to the uploader (last 10 digits); set `false` to accept every call |
| `PLATFORM_ADMIN_EMAILS` | comma-separated platform owners; defaults to `BOOTSTRAP_ADMIN_EMAIL` |
| `PG_SCHEMA` / `PLATFORM_SCHEMA` | `public` / `levoy_platform` — the original workspace's schema and the platform schema |
| `TENANT_POOL_MAX` | `4` connections per customer |
| `PORT` / `HOST` | `3001` / `0.0.0.0` |

### 3. Dashboard

```bash
cd frontend
npm install
npm run dev              # http://localhost:3000
```

The browser always calls `/api/...` on its own origin and Next proxies it to the backend (`API_ORIGIN`, default `http://127.0.0.1:3001`, see `frontend/next.config.mjs`). Example: `API_ORIGIN=http://127.0.0.1:3101 npm run dev`.

### 4. Marketing site (optional)

```bash
cd marketing-site
npm install
npm run dev              # http://localhost:3001 as well — run on a different port if the API is up
```

### 5. Android app

See `android/README.md`. The app registers a `BroadcastReceiver` for `PHONE_STATE`, runs a foreground service while tracking, stores call logs in a Room database, and syncs batches to `POST /api/calls/batch`.

---

## Integrations (storage, push, payments, scheduled jobs)

Credentials live in `backend-next/.env.integrations` (git-ignored; copied from the medivoy.api `.env`, only the variables below). Database settings stay in `.env`.

| What | Variables | Notes |
|---|---|---|
| File storage (recordings, exports, avatars, backups) | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `STORAGE_DRIVER=r2` | Cloudflare R2. The bucket is **shared with medivoy**: every key is forced under `levoy/uploads/…`. `STORAGE_DRIVER=local` (or unset) keeps files on disk. |
| Push notifications | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | FCM. A database trigger announces every new notification; the API pushes it to the person's registered phones. `ENABLE_PUSH_NOTIFICATIONS=false` turns it off (the test environment does). |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `PUBLIC_API_URL` | Stripe Checkout, **test mode** keys today. One-time prepaid months, confirmed with Stripe when the browser comes back and by webhook. `PUBLIC_API_URL` = the address Stripe/the phone can reach this API at. |
| Scheduled jobs | `INTERNAL_JOBS_SECRET`, `ENABLE_SCHEDULER` | Reminders, daily auto-backups (Premium), plan-ending notices, clean-up. Either run in-process (`ENABLE_SCHEDULER=true`) or let medivoy's Trigger.dev project call `POST /api/internal/jobs/hourly|daily` (see below) — not both. |

Check the live services with `node scripts/verify-integrations.js` (R2 round-trip under `levoy/_selftest/`, FCM dry run, Stripe session create + expire).

**Trigger.dev:** there is only one Trigger account, owned by the medivoy.api repo. Levoy's jobs run as two dedicated proxy schedules in medivoy.api, `levoy-hourly-batch-jobs` (every hour) and `levoy-daily-batch-jobs` (03:30 IST), declared in `src/trigger/levoyScheduledBatch.job.js` there (same shape as the pharmacy proxy). They only call this API's `POST /api/internal/jobs/hourly|daily` endpoint. Set `LEVOY_API_URL` and `LEVOY_JOBS_SECRET` (= `INTERNAL_JOBS_SECRET`, as loaded from `backend-next/.env.integrations`) in the Trigger project's environment variables and redeploy medivoy's tasks; until both are set the jobs are skipped and report success. The Levoy API must be reachable from the internet for this, and `ENABLE_SCHEDULER` must stay off so nothing runs twice. The systemd unit in `deploy/` sets no `INTERNAL_JOBS_SECRET`, so on the server it has to come from `.env.integrations` or the unit, otherwise the endpoint answers 503.

**Stripe webhook:** add an endpoint `<public API url>/api/plan/stripe/webhook` (event `checkout.session.completed`) in the Stripe dashboard and put *its* signing secret in `STRIPE_WEBHOOK_SECRET` (the value copied from medivoy belongs to medivoy's endpoint). Without it, payments still activate when the buyer is sent back to the pay page.

## Customers, plans and subscriptions (the platform console)

Levoy is sold as a tool: **each customer company gets its own separate system** — its own team, agents, leads, calls and settings — and its own subscription. You (the platform owner) manage the customers.

- **Data isolation is one Postgres schema per customer.** Every customer has a full copy of the tables in its own schema (`levoy_c<id>`; the original workspace keeps its schema as customer #1), so customers cannot see each other's data even if a query forgets a filter. A request carries its customer (`tid` in the login token); `src/config/db.js` resolves `q()`, `tx()` and `pool` to that customer's pool and **throws if there is no customer context** — it never falls back to "some" schema.
- **The platform schema (`levoy_platform`)** holds `customers`, `workspace_users` (the sign-in directory: one email belongs to exactly one customer), `platform_admins`, `plans` (the editable catalog), `subscriptions` and `subscription_events` (the history). Plain SQL migrations live in `backend-next/src/platform/migrations/`.
- **Platform owners** are listed in `PLATFORM_ADMIN_EMAILS` (default: `BOOTSTRAP_ADMIN_EMAIL`). They sign in with the same emailed code, get a session with no customer, and use **Customers** and **Plans** in the web app (`/platform`) or `/api/platform/*`. A platform session cannot read workspace data, and a workspace session cannot use the console.
- **Customers console:** create a customer (company name + owner email — the owner signs in with a code and invites their own agents), see plan / status / expiry / usage, **suspend** or resume, open the customer's workspace as one of its admins (**support access**, logged on both sides, with a banner and a way back), and delete a customer (type its short name).
- **Subscriptions** are per customer: grant months (stacks on the same plan), extend, set an exact end date, change plan, start a trial of any length, cancel now or at period end, undo a scheduled cancel, and **refund** (a card payment is refunded through Stripe, fully or partly, optionally taking the access back; anything else is recorded as a manual refund). Every change is in the customer's history. A customer's own admin can only start the one free trial and pay by card.
- **Plans are editable data**: name, price, currency, tagline, order, on/off sale and which features each plan includes. The feature keys themselves stay in code (`src/platform/features.js`) because each one gates specific code. Changes apply to every customer at once.
- Background jobs (reminders, daily backups, plan notices…) run once **per customer**, each in its own context. Push notifications carry the customer's schema so the right customer's phones are notified.
- Tuning: `TENANT_POOL_MAX` (connections per customer pool, default 4, idle ones close after 10 s) — keep `customers × TENANT_POOL_MAX` below your database's connection limit. `PLATFORM_SCHEMA` (default `levoy_platform`) and `PG_SCHEMA` (the original workspace's schema, customer #1) pick the schemas.
- Adding a new customer-data table: add it to `prisma/schema.prisma` and a migration; the server applies it to **every** customer's schema at startup.
- Tests: `node scripts/characterize.js --out <file>` runs the whole API suite against a throwaway database with a stand-in for medivoy.api (`scripts/fake-medivoy.js`) and for Stripe (`STRIPE_FAKE=1`, never honoured in production). `scripts/steps/96-multi-customer.js` proves isolation (same user ids, same emails, caches, storage) and `97-payments-refunds.js` covers payment → webhook → refund.

## Demo accounts

After running `seed.sql` these accounts exist, but there are no passwords: a person signs in with the code emailed to their address, so the addresses must be inboxes you can open (edit them in the seed, or add real users from **Users**).

| Email | Role |
|-------|------|
| `admin@levoy.co` | admin |
| `manager@levoy.co` | manager |
| `agent1@levoy.co` … `agent4@levoy.co` | agent |

Roles matter, and they are configurable — see **Roles & access** below.

---

## Leads: upload and assignment

Modelled on the operations sheet described in [`LEADS_SPEC.md`](LEADS_SPEC.md).

**Upload** (Leads → *Upload leads*): `.csv`, `.xlsx` or `.xls`. Meta (Facebook / Instagram) Lead Ads exports are detected automatically — the `l:` / `p:` prefixes, `ig` / `fb` platform, campaign / ad / form details and the redacted-permission placeholders are handled, and the ad details are stored on each lead. Dates in `dd/mm/yyyy` and ISO form are both accepted. Every upload is recorded as a batch (Leads → *Recent uploads* → *View leads*). Re-uploading a file updates leads instead of duplicating them and never takes a lead away from its owner.

**Matches your operations sheet.** Run on the real workbook (1,786 leads), the app's score, tier, active flag, follow-up window, days-since-call and follow-up date agree with the sheet's own formulas on every one of the 1,556 rows the sheet calculated (`node --env-file=.env.test scripts/sheet-parity.js <file.xlsx>`). Things the importer handles because the real file needed them:
- **Which tab?** An Excel workbook lists its tabs; pick *Leads (1)* in the wizard (other tabs are never imported).
- **Phones**: last 10 digits, so `081482 40010`, `+91…` and two numbers in one cell all resolve; Excel numbers are read as numbers.
- **Dates**: Excel date cells are read as the day the sheet shows. Slash dates such as `10/6/2026` are ambiguous (the sheet is month-first), so when a file cannot settle it the wizard asks.
- **Duplicates**: *keep both, flag the later one* (like the sheet, default in the wizard) or *merge*. Re-uploading a file updates leads and never grows the book.
- A row with a phone but no name is imported; only a row with neither is skipped.

**Assignment while uploading** — options are tried in this order, the first that applies wins:

1. *Send everything to one telecaller* (overrides the rest)
2. the telecaller named in the file's `Tellecaller Name` column
3. your assignment rules (by source, platform, priority, tag)
4. *Share the rest* — even split, least-loaded first, never past a telecaller's capacity
5. anything left lands in the **Unassigned** tab — nothing is given to a random person

**After upload** — select leads (or the whole *Unassigned* tab) → *Assign…*: pick one telecaller, balance across the ones you tick, run the rules, or unassign. *Team capacity* shows who has room.

## Lead rules (editable by admins)

Leads → **Lead Rules** is the sheet's *Settings* tab as a screen (hide or show it per role under Roles & Access):
- **Call status rules** — base score, live-lead flag, win chance, next best action and the Reached / Interested+ / Demo+ flags for each Call Status; add your own statuses.
- **Scoring & targets** — Hot and Warm thresholds, the follow-up urgency bonus (+30 when a follow-up is overdue or due today), the "this week" window, daily call target, plan price.
- **Assignment rules** — who gets a new lead, by campaign/segment, area, source or priority: always one person, shared evenly, or least loaded; checked top to bottom.

New imports use the rules at once. Existing leads keep their stored score until you press **Recalculate all leads** (the page offers it after every save), so a retune never rewrites history by surprise. Tiers: **Hot / Warm / Cool** (live but below Warm — an uncalled lead is Cool) **/ Closed / Won**.

## Roles & access (RBAC)

Admin → **Roles & Access**. Every sidebar tab is a *page* with the actions `view · create · update · delete · export · assign · import`. You choose, per **role** (admin / manager / agent), per **custom role** (e.g. "Outbound telecaller") or per **person**, which tabs they see and what they can do there. Resolution order: person override → custom role → the role's saved profile → built-in default. Hidden tabs are also refused by the API (`403`), not just hidden. Admins can never lock themselves out of Roles & Access, Users or Dashboard. After login each person lands on the first tab they are allowed to use.

Agents see the leads they created or are assigned to; managers and admins see the whole team.

---
## API overview

Base URL `http://localhost:3001/api`. All routes except `auth/send-otp`, `auth/verify-otp` and `auth/accept-invite` require `Authorization: Bearer <token>`.

**Auth**
- `POST /auth/send-otp {email}` (emails a 6-digit code) · `POST /auth/verify-otp {email, otp}` (returns the session) · `GET /auth/me` (both return `permissions` and `home`) · `POST /auth/accept-invite {token, name}` (creates the account; they then sign in with a code)

**Users**
- `GET /users` (admin) · `POST /users/:id/role` (admin)
- `GET /users/me` · `PUT /users/me` · `POST /users/me/avatar` (multipart)

**Teams**
- `POST /teams` · `GET /teams`
- `GET /teams/:id/members` · `POST /teams/:id/members` · `DELETE /teams/:id/members/:userId`

**Calls**
- `POST /calls` · `POST /calls/batch` · `GET /calls` (filterable by `direction`, `status`, `phone`, `date_from`, `date_to`, `pinned`, `limit`, `offset`)
- `GET /calls/stats` · `PUT /calls/:id/pin` · `PUT /calls/:id/notes`
- `POST /calls/:id/recordings` (multipart) · `GET /calls/:id/recordings` · `GET /calls/:id/recordings/:recId/file` · `DELETE /recordings/:recId`

**Leads**
- `POST /leads` · `GET /leads` (`status`, `priority`, `search`, `assigned` = `unassigned|mine`, `segment`, `tier`, `followup_window`, `call_status`, `import_batch_id`, `sort`, `limit`, `offset`; the total is in the `X-Total-Count` header) · `GET /leads/summary` · `GET /leads/:id` · `PUT /leads/:id` · `POST /leads/:id/contact`
- Import: `POST /leads/import/preview` · `POST /leads/import/plan` (dry run) · `POST /leads/import/commit` (also `date_order=dmy|mdy`, `duplicates=keep|merge`) · `GET /leads/import/batches[/:id]`
- Lead rules: `GET/POST /leads/status-rules` · `DELETE /leads/status-rules/:key` · `GET/PUT /leads/scoring-settings` · `POST /leads/enrichment/apply` (recalculate) — writes need the `lead-rules` page's *update* action
- Assignment: `POST /leads/bulk-assign` · `POST /leads/bulk-unassign` · `POST /leads/bulk-auto-assign` · `GET /leads/unassigned/summary` · `GET /agents/workload` · `GET/POST/PATCH/DELETE /assignment-rules`

**RBAC** (admin)
- `GET /rbac/registry` (any user) · `GET /rbac/matrix` · `PUT/DELETE /rbac/roles/:role` · `POST/PUT/DELETE /rbac/custom-roles[/:id]` · `GET/PUT/DELETE /rbac/users/:id` · `PUT /rbac/users/:id/custom-role`

**Call history, analytics, contacts, plans** (the Levoy-app features; see [`PARITY.md`](PARITY.md))
- `GET /call-history` (`tab=all|incoming|outgoing|missed|rejected|never_attended|not_pickup`, `date_from`, `date_to`, `search`, `sim=<slot>|whatsapp`, `contact_type=saved|unsaved`, `user_id`, `tz` = minutes east of UTC; Premium Plus: `notes`, `tag_id`, `group_id`) · `GET /call-history/tags` · `GET /call-history/people` · `PUT /call-history/:id/annotate` (note + tags, Premium Plus)
- `POST /calls` and `/calls/batch` also take `source` (`sim|whatsapp`), `sim_slot` (1–4), `sim_label`
- `GET /call-analytics/summary` (tiles, graph series, working hours, billing, leaderboard) · `GET /call-analytics/analysis`
- `GET /contacts` · `GET /contacts/:phone` (summary, analysis, history) · `GET /contacts/compare?phones=a,b,…` (max 5) · `GET/POST /contact-groups` · `PUT/DELETE /contact-groups/:id` · `POST /contact-groups/:id/members` · `DELETE /contact-groups/:id/members/:phone`
- `GET/POST/PUT/DELETE /call-reminders` — a due reminder becomes a `call_reminder` notification
- `POST /call-exports/report` (Excel; `exclude_contacts` is Premium Plus) · `POST /call-exports/contacts` · `POST /call-exports/working-hours` · `GET /call-exports/backup` · `POST /call-exports/restore` · `GET /call-exports/:id/file`
- `GET /plan` · `POST /plan/trial` (once per workspace, 7 days) · `POST /plan/activate` (admin, no payment) · `POST /plan/checkout` (admin; Stripe Checkout for 1/3/6/12 months) · `POST /plan/confirm` · `GET /plan/payments` · `POST /plan/stripe/webhook` · `GET /pay/success`, `/pay/cancel` — plans: Free, Premium ₹75, Premium Plus ₹125, Levoy Biz (custom). A feature outside the plan answers **402** with `required_plan` and `upgrade_url`.
- `GET/PUT /workspace-settings` (idle gap minutes, billing cycle) · `GET/PUT/DELETE /sims[/:slot]` · `POST /device/status` · `GET /devices`
- `POST /quick-call/dial` (Premium; browser → the person's phone) · `GET/POST/DELETE /quick-call/devices` · `GET /quick-call/pending` (the phone long-polls) — see [`chrome-extension/`](chrome-extension/README.md)
- `POST /calls/backfill` (fill in names / SIM on calls already uploaded; never overwrites)
- `POST/DELETE /push/tokens` (a phone registers for push) · `POST /push/test` · `POST /internal/jobs/hourly|daily` (shared secret, see Integrations)
- `GET/PUT /workspace-settings` also holds `support_whatsapp`, `social_*` and `blog_url` for the phone app's Help and More screens
- `GET/POST /users/me/consent` · `DELETE /users/me` (body `{email}` typed to confirm; refused for the last admin or someone who owns leads)

Calls are classified in one place (`src/utils/callKinds.js`): *never attended* = a missed/rejected call never returned or spoken about afterwards; *not pickup* = an outgoing call nobody answered and no later call connected. People are matched on the last 10 digits, so `+91 90000 11111` and `09000011111` are one contact.

**Reports & exports**
- `GET /reports/daily` · `POST /reports/generate-email`
- `GET /exports` · `POST /exports` · `GET /exports/:id/file` · `DELETE /exports/:id`

**Other**
- `GET/PUT /user-settings`
- `GET /notifications`
- `GET /whatsapp-templates`

---

## Repo conventions

- One git repo at the root. There used to be a nested `.git` in `frontend/` from `create-next-app` — it was removed in favour of a single monorepo history.
- `node_modules`, `.next`, `uploads`, `.env` and build artifacts are gitignored.
- Backend migrations are idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements in `initDB`, not a migration framework.