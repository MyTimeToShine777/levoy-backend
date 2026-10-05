# Lead assignment, CSV/Excel upload, backend restructure & CRM-style UI — design

Date: 2026-10-03 · Status: approved by user ("yea finish everything")

## Goals

1. Lead assignment & management modelled on the user's operations Google Sheet (see `LEADS_SPEC.md`).
2. CSV **and** Excel upload for leads, including Meta Lead Ads exports (`29-09-2026 - Oct3.csv`).
3. Restructure `backend-next/server.js` (6,690 lines) into controllers / services / routes like `medivoy.api`.
4. Dashboard UI/UX in the style of the `crm` repo (Nuxt) — ported to the existing Next.js/React app.

## Non-goals

- No change to any existing URL, method or response shape (web + Android clients keep working) — except the deliberate fixes listed in §6.
- No switch to ESM/TypeScript (CommonJS stays). medivoy.api's layering and naming are copied.
- No rewrite of the frontend in Vue.

## Amendment 2026-10-03 (user request): Prisma + role-based login + RBAC page

- **Postgres + Prisma own the schema.** `backend-next/prisma/schema.prisma` (PascalCase models, `@@map` to the physical snake_case tables), migrations in `prisma/migrations` (`0_init` = baseline of the pre-Prisma `initDB()`, `1_leads_rbac_import` = new tables/columns), applied at startup by `src/db/migrate.js` (`prisma migrate deploy`; legacy-built databases are baselined automatically). CHECK constraints, the partial unique index `idx_lead_assignees_one_owner` and expression indexes live in migration SQL (Prisma cannot express them). Reference data + first-admin bootstrap moved to `src/db/seed.js`.
- **Prisma Client** (`src/config/prisma.js`) is used by services that do plain model CRUD (RBAC, import batches). The raw-SQL-heavy lead services keep the shared `pg` pool (`src/config/db.js`) — same database, same credentials.
- **Role-based login + RBAC**, modelled on `crm/crm-frontend` (`AdminPermissions.vue`, `useAuthStore.canAccessPath`, `role` middleware) and `crm-backend` (`RolePermissionProfile`, `CustomRoleProfile`, `UserPermissionProfile`):
  - Pages (= sidebar tabs) × actions (`view create update delete export assign import`) registry in `src/config/rbac.js`.
  - Effective permissions resolve: per-user override → custom role → role profile → built-in default for the role.
  - `POST /api/auth/login`, `GET /api/auth/me` additionally return `permissions` and `home` (first allowed tab). All existing fields are unchanged.
  - `requirePage(page, action)` middleware guards the API (not only the UI); built-in defaults reproduce today's behaviour, so nothing regresses until an admin edits a profile.
  - Admin endpoints: `GET /api/rbac/matrix`, `PUT /api/rbac/roles/:role`, `POST/PUT/DELETE /api/rbac/custom-roles[/:id]`, `GET/PUT/DELETE /api/rbac/users/:userId`.
  - Frontend: permission-aware sidebar + route guard + RBAC page (role/user mode toggle, role tabs, module checklist, page×action matrix, custom roles) in the crm style.

## 1. Backend structure

```
backend-next/
  server.js                 thin entry: require('./src/server')
  src/
    server.js               initDB -> app.listen -> graceful shutdown
    app.js                  express app: cors, json, routes, notFound, errorHandler
    config/                 env.js, db.js (pool, q, tx), constants.js, upload.js
    middleware/             auth, asyncHandler, rateLimit, errorHandler, notFound, requireRole
    exceptions/             AppError (+ NotFound, Validation, Conflict, Authz)
    routes/                 index.js + one router per domain
    controllers/            class per domain; parse req -> service -> res
    services/               SQL + business logic
    utils/                  phone, dates, tabularFile (csv/xlsx), leadMath, audit
    db/                     schema/*.js (initDB split by domain), seed.sql
```

- CommonJS + `pg`. Controllers are classes exported as singletons (medivoy style).
- Error contract unchanged: `{ detail: '...' }` bodies with the same status codes.
- **Parity rule:** a route manifest (method + path + middleware count) is captured from the
  legacy `server.js` before any move (`scripts/route-manifest.js`). After every phase the manifest
  of the new app must equal the baseline exactly, and behavioural checks must pass.

### Phases

| # | Scope |
|---|---|
| 1 | Skeleton: config, middleware, exceptions, db/schema split, app/server. Legacy handlers still mounted. |
| 2 | **Leads domain** (+ new features, §2): leads CRUD, import, assignment, rules, telecaller map, scoring, call queue, tags, follow-ups, merge, pipeline stages |
| 3 | Auth, users, teams, invitations, audit log, user settings |
| 4 | Calls, recordings, reviews/quality, agents performance |
| 5 | Analytics, reports, exports, notifications, WhatsApp templates; delete legacy `server.js` body |

## 2. New lead features

### 2.1 Meta Lead Ads import profile
Auto-detected when headers include `ad_id`, `form_id`, `created_time`, `platform` (any 3).

| Meta column | Lands in |
|---|---|
| `full_name` | `customer_name` (also `name`) |
| `phone_number` | `phone_number` — `p:` prefix stripped, then standard `cleanPhone` |
| `email` | `email_id` |
| `platform` (`ig`/`fb`) | `lead_source` = `Instagram` / `Facebook` |
| — | `segment` = `Social Media Campaign` (overridable in the wizard) |
| `created_time` | `received_at` (new column) |
| `lead_status` (`CREATED`) | ignored → status `(Not called yet)` |
| `id` / `z` (`l:…`), `ad_*`, `adset_*`, `campaign_*`, `form_*`, `is_organic` | `lead_meta` JSONB; Meta lead id (prefix stripped) stored in `external_id` |

Header quirk: the first column of the supplied CSV is `z`/`id` carrying `l:<id>`; treated as external id.
Dedupe: `external_id` (exact), cleaned phone, normalised pharmacy+locality — duplicates are flagged, never dropped.

### 2.2 Assignment at upload — ordered fallback chain
Request field `assignment` (JSON): 
```
{ use_file_column: bool, use_rules: bool,
  round_robin: { enabled: bool, user_ids: int[], team_id?: int },
  manual_user_id?: int }
```
Resolution per lead, first hit wins:
1. `manual_user_id` (assign the entire upload to one telecaller) — if set, skips the chain.
2. File `Tellecaller Name` via telecaller map / exact user name (if `use_file_column`).
3. Assignment rules (campaign / segment / platform / source conditions) (if `use_rules`).
4. Round-robin over chosen users — even split, least-loaded first, capacity-aware (existing per-user capacity; default 50 open leads); stops assigning to a user at capacity.
5. Otherwise → **UNASSIGNED** (listed, never random).

Preview (`/api/leads/import/preview`) returns a dry-run `assignment_plan`: counts per telecaller, per-reason breakdown, unassigned count, capacity skips. Commit uses the same resolver, so preview == outcome.

### 2.3 Import batches
New `lead_import_batches` (id, filename, format, created_by, created_at, totals JSON, assignment JSON). `leads.import_batch_id`. Endpoints: `GET /api/leads/import/batches`, `GET /api/leads/import/batches/:id`. Leads list gains `import_batch_id` filter.

### 2.4 Manual assignment & workload
Existing endpoints kept. Added: `GET /api/leads/unassigned/summary` (count + by segment), `POST /api/leads/bulk-unassign`, filter `assigned=unassigned|mine|<userId>` on `GET /api/leads`.

## 3. Frontend (Next.js, CRM-style)

- Tokens: Poppins, light default + dark theme via `html.dark`, per-area accent, shadow/radius/ease tokens (ported from `crm/crm-frontend/assets/css/main.css`).
- Components (React): `PageHeader`, `GuidanceCard`, `QuickStatsBar`, `FilterBar`, `FilterTabs` (count chips), `DataTable` (select, sort, skeleton, empty, numbered pagination, mobile card list), `KpiCard`, `StatusBadge`, `SlideDrawer`, `ConfirmModal`, `Wizard`, collapsible grouped `Sidebar`, theme toggle.
- Pages: Leads (page anatomy per crm), Import wizard (Upload → Map → Assignment → Preview/Confirm), Assign drawer, Workload panel, Import history; Call Queue/Daily Report/Command Center/Follow-ups/Team restyled on the same shell.
- Verified by screenshots at desktop + phone width, both themes.

## 4. Testing

- Route-manifest parity (per phase).
- Existing `verify_*.sh` scripts and `e2e-walkthrough.js` Playwright suite, adapted to Windows where needed.
- New tests (`backend-next/test/*.test.js`, `node --test`): Meta mapping, phone cleaning, xlsx vs csv equivalence on the Oct3 fixture, assignment-chain resolver (round-robin fairness, capacity, rules, unassigned), preview==commit.
- Throwaway Postgres cluster (own port) for all DB-backed tests; the user's local Postgres is never modified.

## 6. Deliberate deviations from legacy behaviour (bug fixes)

Found by the characterization harness / code reading; each is covered by a test in the new baseline.

1. `GET /api/users?role=…` returned 500 (the role value was bound to `$1` but never passed). Fixed.
2. **Agents could not see leads assigned to them** unless they were the record's creator (`owner_id`) — an imported lead owned by the importing admin and assigned to a telecaller was invisible to that telecaller. Visibility is now: creator OR assigned owner OR any assignee row (admin/manager unchanged).
3. Lead import wrote raw `dd/mm/yyyy` strings into DATE columns: any day > 12 or any unparsable date aborted the **whole** import transaction ("current transaction is aborted"). Dates are now normalised with `parseLeadDate`; each row runs in a SAVEPOINT so a poisonous row is reported and skipped, as the code comments always claimed.
4. Malformed JSON bodies / oversized uploads now return `{detail}` JSON (central error handler; multer errors are 400) instead of Express's HTML error page / a 500.
5. `PATCH /api/assignment-rules/:id` never re-checked "fixed strategy needs a fixed_user_id" when the strategy was changed in the same request (an off-by-one in the field lookup), so a fixed rule with no user could be saved. Fixed.
6. Telecaller-name matching no longer resolves to a **deactivated** user (it would have assigned leads to someone who cannot log in).
7. A re-import no longer **wipes an existing assignment**: legacy wrote `assigned_to = NULL` for any re-imported row whose telecaller cell was blank. Only an explicit choice (file column / manual / rule) moves an owned lead; "share the rest" (round-robin) only fills leads that have no owner yet and reports the others as "already assigned — kept as is" (they do not consume a telecaller's capacity in the dry run either).
8. Lead import / enrichment-apply / import-history now require the RBAC `leads.import` action (default: manager + admin). Legacy let any signed-in agent upload files.
9. Analytics pages (Command Centre, Daily Report, Area Analysis, Call Queue, Team Workload) are enforced at the API by their RBAC page permission, not only hidden in the sidebar. Defaults match the old sidebar (`managerOnly` pages denied to agents), so the visible change is `GET /api/analytics/command-center` and `/area-analysis` now return 403 for agents.
10. `PUT /api/leads/:id` with `assigned_to` (changing the owner) now needs the `leads.assign` action; legacy let any agent with access hand a lead to someone else.
11. Bulk status skips leads that were merged away (the check existed but selected the wrong columns, so it never fired).
12. `POST /api/reports/generate-email` always returned 500: it wrote to a `daily_reports` table no migration ever created. Added by migration `2_daily_reports`.
13. Creating/updating a WhatsApp template **with variables** saved the row and then returned 500 (`JSON.parse` on an already-parsed JSONB value). Fixed.
14. Exports: `leads`, `leads_pipeline` and `calls` without `params` all returned 500 (wrong bind-parameter counts, `params` undefined); unknown types crashed; and `order`/`dir` were interpolated into SQL (**injection**). Now: validated type (400 + allowed list), whitelisted sort, RFC-4180 CSV quoting, `leads_pipeline` driven by the configured stages, agents export only leads they may see.
15. The `/` landing page no longer advertises a non-existent `/api/version` or hard-codes a server IP.

**Found by running the user's real workbook through the engine** (`scripts/sheet-parity.js`: 1,556 calculated rows × 7 derived columns, now 100 % identical; `scripts/sheet-phone-check.js`). The earlier spec was extracted from a screenshot-level reading and was incomplete:

16. **Tiers** are Hot / Warm / **Cool** (a live lead below Warm — an uncalled lead is Cool, score 10) / Closed / **Won** (win probability 100 %). The **+30 urgency bonus** applies when a follow-up is overdue **or due today** (legacy: overdue only). A **duplicate** keeps its score but its Next Best Action is "Duplicate – skip". Two next-action texts now match the sheet ("…different time of day", "…share payment link / onboard").
17. **Excel date cells were one day early** east of Greenwich (SheetJS returns a date cell as local 23:59:50 on the previous day, and the reader took the calendar day from it). Fixed and tested in four timezones. Free-text dates ("06-Oct-2026") had the same off-by-one through `Date.parse`.
18. **Slash dates** (10/6/2026) are ambiguous: the sheet is month-first, Indian CSVs are usually day-first. A file proves its own order when any value has a part above 12; otherwise the wizard asks (default day-first).
19. **Phone cleaning** follows the sheet: keep the last 10 digits (drops +91, 91 and the trunk 0; with two numbers in a cell the last wins), valid only with a 6–9 prefix; Excel numbers are read as numbers, so `9.19E+11` cells the sheet itself loses are recovered. 1,351 of the sheet's 1,777 phones had a leading 0 and were all flagged "unusable" before.
20. A row with a **phone but no name** is imported ("Lead <phone>"); only a row with no name, pharmacy and phone is skipped.
21. The Daily Report / Area Analysis **"called"** counted every lead whose `call_done` was not NULL (including the text `'false'`); it now counts `'true'` or a call date.
22. **Duplicates**: the sheet keeps every row and flags later repeats; the legacy importer merged them (1,786 rows became 1,520 leads). The wizard now offers *Keep both, flag the later one* (default) or *Merge*; API callers keep *merge* unless they pass `duplicates=keep`. Re-importing stays idempotent (the Nth repeat of a phone maps to the Nth existing lead).
23. **Assignment rules** can match by campaign/segment and locality (previously only source, status, priority and tags).
24. The rules the sheet keeps on its Settings tab (call-status rules, thresholds, targets) and the assignment rules are editable in the app (**Lead Rules** page, RBAC page `lead-rules`); existing leads are rescored on demand with *Recalculate*.

## 5. Status (2026-10-03)

Implemented and verified: backend restructure (443-call parity run + 539-call full run, 31 unit tests), Prisma migrations, CSV / XLSX / Meta import with the assignment chain, RBAC (API and UI), CRM-style UI for Leads, Roles & Access and Exports in light and dark themes, clean `next build`.

Not done: individual redesign of the remaining analytics pages (they inherit the tokens and shell), re-running the legacy `e2e-walkthrough.js` / `verify_*.sh`, and opening the real Google Sheet (needs a login).

## 5b. Risks

- Big-bang move risk → mitigated by manifest parity + per-phase verification and by moving code verbatim (no logic edits) in phases 3–5.
- `LEADS_SPEC.md` was extracted from the Google Sheet; the sheet itself could not be opened (login). Discrepancies found later are fixed in the spec first.
- No git repo in `levoy/`: no commits are made; a pre-change snapshot (`server.js.legacy`) is kept for diffing.
