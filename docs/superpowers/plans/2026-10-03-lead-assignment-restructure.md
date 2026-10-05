# Lead assignment, CSV/Excel upload, backend restructure & CRM-style UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `backend-next/server.js` into controllers/services/routes (medivoy.api layering), add Meta-CSV + xlsx lead upload with assignment-at-upload, and rebuild the dashboard UI in the crm repo's style.

**Architecture:** Express + `pg` stays (CommonJS). `src/` holds config → middleware → routes → controllers → services → utils. A characterization harness records legacy API behaviour first; each phase must reproduce it byte-for-byte (after normalising ids/timestamps). Frontend keeps Next.js 16 and gets a ported CRM design system + reusable components.

**Tech Stack:** Node 22, Express 4, pg, xlsx, multer, express-validator, node:test; Next.js 16 / React 19 / Tailwind 4; Playwright for UI verification; throwaway Postgres 18 cluster on port 54329.

> **Status (2026-10-03):** Backend tasks (0–9, 1b) complete and verified by the characterization harness; frontend tasks (10–12) complete for Leads, Roles & Access and Exports, with the remaining pages inheriting the new tokens and shell but not individually redesigned. Prisma replaced the planned hand-written migrations (Task 1b); the stack line above predates that decision. See `REMAINING_WORK.md` §36–44 for what is still open.

## Global Constraints

- Every existing URL, method, status code and response body shape stays identical (spec §Non-goals).
- Errors keep the `{ "detail": "..." }` body (spec §1).
- CommonJS + `pg`; no Prisma/ESM (spec §Non-goals).
- Throwaway DB only: `PG_HOST=localhost PG_PORT=54329 PG_DB=levoy PG_USER=levoy PG_PASSWORD=levoy123`. The user's Postgres on 5432 is never touched.
- No git repo in `levoy/`: no commits. Keep `backend-next/server.js.legacy` as the diff reference.
- Uploads: CSV + xlsx, 10 MB, 5,000-row cap (existing `IMPORT_ROW_CAP`).
- Round-robin capacity default 50 open leads/user (existing `ASSIGNMENT_CAPACITY`).
- Phone cleaning: strip non-digits, drop leading `91` when result is 12 digits → 10-digit (existing `cleanPhone`).
- Meta lead assignments chain order: manual → file column → rules → round-robin → UNASSIGNED (spec §2.2).

## File Structure

```
backend-next/
  server.js                      -> becomes: require('./src/server')
  server.js.legacy               (snapshot, reference only)
  scripts/route-manifest.js      dumps method+path list from an express app
  scripts/characterize.js        records/compares API behaviour
  test/*.test.js                 node --test unit + integration tests
  src/
    server.js, app.js
    config/{env,db,constants,upload}.js
    middleware/{auth,asyncHandler,rateLimit,errorHandler,notFound}.js
    exceptions/{AppError,index}.js
    routes/{index,authRoutes,userRoutes,teamRoutes,callRoutes,leadRoutes,
            leadImportRoutes,assignmentRoutes,followUpRoutes,analyticsRoutes,
            qualityRoutes,reportRoutes,recordingRoutes,miscRoutes,systemRoutes}.js
    controllers/*Controller.js
    services/*Service.js
    utils/{phone,dates,tabularFile,metaLeads,audit}.js
    db/{schema.js,seed.sql}
frontend/src/
  app/globals.css                CRM tokens
  components/ui/*                PageHeader, GuidanceCard, QuickStatsBar, FilterTabs,
                                 DataTable, KpiCard, StatusBadge, SlideDrawer, Wizard, Sidebar
  components/leads/*             import wizard, assign drawer, workload panel, batches
```

---

### Task 0: Baseline — environment, legacy snapshot, characterization harness

**Files:**
- Create: `backend-next/server.js.legacy`, `backend-next/.env.test`, `backend-next/scripts/characterize.js`, `backend-next/scripts/route-manifest.js`, `backend-next/test/fixtures/meta-leads.csv`
- Output: `backend-next/test/baseline/legacy.json`

**Interfaces:**
- Produces: `node scripts/characterize.js --base http://localhost:3101 --out <file>` writes `[{key, status, shape}]`; `node scripts/characterize.js --compare a.json b.json` exits non-zero on any difference.

- [ ] **Step 1:** Copy `server.js` → `server.js.legacy`; copy `29-09-2026 - Oct3.csv` → `test/fixtures/meta-leads.csv`.
- [ ] **Step 2:** Create `.env.test` with the throwaway-DB vars, `JWT_SECRET=test-secret`, `BOOTSTRAP_ADMIN_EMAIL=admin@test.local`, `BOOTSTRAP_ADMIN_PASSWORD=Admin#12345`, `PORT=3101`.
- [ ] **Step 3:** Write `characterize.js`: logs in as bootstrap admin, creates 2 agents + 1 manager + a team via API, then runs a fixed ordered list of requests covering every route family (GET lists, create/update/delete flows for leads, tags, follow-ups, assignment, rules, stages, templates, notifications, settings, import preview/commit with CSV and xlsx, exports). For each response it stores `{key: "METHOD path#n", status, shape}` where `shape` is the body with numbers/ISO-dates/tokens/hashes replaced by type tokens and arrays collapsed to first-element shape + length bucket.
- [ ] **Step 4:** Start legacy: `node server.js.legacy` with `.env.test` loaded (dotenv preload `-r dotenv/config` with `DOTENV_CONFIG_PATH=.env.test`); run `characterize.js --out test/baseline/legacy.json`; run it twice and `--compare` the two runs → must be identical (proves normaliser is deterministic).
- [ ] **Step 5:** Static route manifest of the legacy file: regex over `app.(get|post|put|patch|delete|use)(` → `test/baseline/legacy-routes.json` (method, path, count). Expected ≈ 150 routes.

### Task 1: Skeleton (config, middleware, exceptions, db, app/server)

**Files:** Create everything under `src/config`, `src/middleware`, `src/exceptions`, `src/db`, `src/utils/audit.js`, `src/app.js`, `src/server.js`; modify `server.js`.

**Interfaces — Produces:**
- `config/db.js`: `{ pool, q(text, params), tx(fn) }` — identical semantics to legacy `q`/`tx`.
- `exceptions/AppError.js`: `class AppError extends Error { constructor(status, detail, extra) }` + `NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError` (status-preset subclasses).
- `middleware/errorHandler.js`: `(err, req, res, next)` → `res.status(err.status||500).json({ detail: err.detail||'Internal error', ...err.extra })`.
- `middleware/asyncHandler.js`: `(fn) => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)`.
- `middleware/auth.js`: `authMW` (verbatim legacy behaviour, 401/403 bodies).
- `middleware/rateLimit.js`: `rateLimit({windowMs,max,keyFn,code,message})` verbatim.
- `utils/audit.js`: `audit(client, req, action, entityType, entityId, details)`, `clientIp(req)`.
- `db/schema.js`: `initDB()` moved verbatim (lines 339–1146 of legacy), split into `schema/*.js` only if >600 lines per file.

- [ ] **Step 1:** Write test `test/appError.test.js`: errorHandler maps `new AppError(404,'x')` to `404 {detail:'x'}` and unknown errors to 500 `{detail:'Internal error'}`. Run `node --test test/appError.test.js` → FAIL.
- [ ] **Step 2:** Implement exceptions + errorHandler + asyncHandler; test PASS.
- [ ] **Step 3:** Move db pool/q/tx, auth, rateLimit, audit, `initDB`, upload config verbatim into the new files.
- [ ] **Step 4:** `src/routes/legacyRoutes.js`: the remainder of legacy handlers (lines 836–7143) wrapped as `module.exports = (app, deps) => { ... }` so behaviour is unchanged while domains are peeled off in later tasks. `src/app.js` mounts new routers first, then legacy.
- [ ] **Step 5:** `src/server.js` = initDB → listen → SIGTERM/SIGINT pool.end(). Root `server.js` = `require('./src/server')`.
- [ ] **Step 6:** Boot, run `characterize.js --out test/baseline/phase1.json`, `--compare legacy.json phase1.json` → identical; manifest equal.

### Task 1b: Prisma (DONE) + RBAC backend

**Done:** `prisma/schema.prisma`, migrations `0_init` + `1_leads_rbac_import`, `src/db/{migrate,seed,init}.js`, `src/config/prisma.js`; verified: fresh DB builds, legacy-built DB baselines, `prisma migrate diff` = no drift, characterization identical (326 calls).

**RBAC (next):** `src/config/rbac.js` (PAGES, ACTIONS, DEFAULT_ROLE_PROFILES, `resolveEffective`), `src/services/RbacService.js` (Prisma), `src/controllers/RbacController.js`, `src/routes/rbacRoutes.js`, `src/middleware/requirePage.js`; extend login/me with `permissions` + `home`; tests `test/rbac.test.js` (resolution order, defaults reproduce legacy role gates, custom role inherits base, user override wins, guard returns 403).

### Task 2: Leads domain — services/controllers/routes (verbatim logic, HTTP split)

**Files:** Create `services/{LeadService,LeadScoringService,LeadImportService,AssignmentService,AssignmentRuleService,TelecallerMapService,LeadTagService,FollowUpService,PipelineStageService,LeadMergeService,LeadAnalyticsService}.js`, matching controllers, `routes/{leadRoutes,leadImportRoutes,assignmentRoutes,followUpRoutes,analyticsRoutes}.js`, `utils/{phone,dates,tabularFile}.js`.

**Interfaces — Produces:** services never touch `req/res`; they take plain args plus a `ctx = { userId, userRole }` and throw `AppError`. Controllers translate query/body → args and shape the response exactly as legacy. Route order must preserve legacy precedence (`/api/leads/import/*`, `/api/leads/call-queue`, `/api/leads/pipeline`, `/api/leads/status-rules`… before `/api/leads/:leadId`).

- [ ] **Step 1:** Port legacy lines 1748–5990 domain by domain (leads CRUD+list → import → scoring/status-rules/telecaller-map → analytics (command-center, daily-report, area-analysis, call-queue) → tags → merge/duplicates → assignment-rules/auto-assign → pipeline stages → assign/assignees/bulk-assign/workload → follow-ups). Per domain: move helpers to the service, convert `res.status(n).json({detail})` returns into `throw new AppError(n, detail)`, keep SQL text unchanged.
- [ ] **Step 2:** After each domain: remove its handlers from `legacyRoutes.js`, boot, `characterize.js --compare` against `legacy.json` → identical.
- [ ] **Step 3:** Unit tests for moved pure helpers (`cleanPhone`, `parseLeadDate`, `computeDerived`) in `test/leadMath.test.js` using values from `LEADS_SPEC.md` (scores 60/90/110; Hot ≥ 80).

### Task 3: Meta Lead Ads import profile

**Files:** Create `src/utils/metaLeads.js`, `test/metaLeads.test.js`; modify `LeadImportService.js`, `db/schema.js` (columns `leads.external_id`, `leads.received_at`, `leads.lead_meta JSONB`).

**Interfaces — Produces:**
```js
// utils/metaLeads.js
isMetaExport(columns: string[]): boolean            // >=3 of ad_id,form_id,created_time,platform,campaign_id
stripMetaPrefix(v: string): string                  // 'l:123'->'123', 'p:+9195'->'+9195', 'ag:1'->'1'
platformToSource(p: string): string                 // ig->Instagram, fb->Facebook, else Title-case
metaRowToLead(row: Record<string,string>): {
  customer_name, phone_number, email_id, lead_source, segment: 'Social Media Campaign',
  received_at: string|null, external_id: string|null, lead_meta: object }
```
- [ ] **Step 1:** Write `test/metaLeads.test.js` with rows from the fixture (`Peeyush`, `p:+919522676677` → `+919522676677`; `ig` → `Instagram`; `lead_status CREATED` ignored). Run → FAIL.
- [ ] **Step 2:** Implement `metaLeads.js`; PASS.
- [ ] **Step 3:** In `LeadImportService.preview`, if `isMetaExport(columns)`: return `profile: 'meta_lead_ads'` and map via `metaRowToLead`; dedupe on `external_id` first. Add schema columns idempotently (`ADD COLUMN IF NOT EXISTS`, index on `external_id`).
- [ ] **Step 4:** Integration test: preview + commit `meta-leads.csv` (102 rows) → 102 leads (minus true dupes), all `segment='Social Media Campaign'`, `lead_source` ∈ {Instagram, Facebook}, `lead_meta.campaign_name` set. Re-commit same file → 0 new (external_id dedupe, flagged duplicates).
- [ ] **Step 5:** xlsx equivalence: convert the fixture to xlsx with the `xlsx` package in the test, preview both → identical mapped rows.

### Task 4: Assignment-at-upload resolver + batches + unassigned tools

**Files:** Create `services/ImportAssignmentService.js`, `test/importAssignment.test.js`; modify `LeadImportService.js`, `AssignmentService.js`, schema (`lead_import_batches`, `leads.import_batch_id`), routes (`/import/batches`, `/unassigned/summary`, `/bulk-unassign`), `LeadService.list` (`assigned`, `import_batch_id` filters).

**Interfaces — Produces:**
```js
// ImportAssignmentService
planAssignment({ leads: Lead[], options: AssignmentOptions, deps }) -> {
  assignments: Array<{ index: number, userId: number|null, reason: 'manual'|'file'|'rule'|'round_robin'|'unassigned'|'capacity' }>,
  summary: { byUser: Record<number,number>, byReason: Record<string,number>, unassigned: number }
}
// deps = { resolveTelecaller(name)->userId|null, matchRule(lead)->userId|null,
//          openLoad(userId)->number, capacity(userId)->number }
// AssignmentOptions = { manual_user_id?, use_file_column?, use_rules?,
//                       round_robin?: { enabled, user_ids: number[] } }
```
- [ ] **Step 1:** Write failing tests: (a) manual wins over everything; (b) file column beats rules; (c) rules beat round-robin; (d) round-robin 10 leads over 3 users with loads [0,0,0] → 4/3/3; with loads [48,0,0] and capacity 50 → user1 gets ≤2; (e) nothing configured → all `unassigned`; (f) round-robin user at capacity is skipped; all at capacity → `unassigned` with reason `capacity`.
- [ ] **Step 2:** Implement pure function (least-loaded-first, stable tie-break by user id); PASS.
- [ ] **Step 3:** Wire: `preview` returns `assignment_plan` (summary only) when `assignment` supplied; `commit` calls the same planner then writes owner via existing `applyAssignment` inside the batch transaction; every lead gets `import_batch_id`; one `lead_import_batches` row with totals + assignment JSON.
- [ ] **Step 4:** Integration test: commit Oct3 CSV with round-robin over 3 agents → each owns 33–34 leads; `GET /api/leads?assigned=unassigned` is empty; with no assignment → all unassigned and `GET /api/leads/unassigned/summary` equals total.
- [ ] **Step 5:** Test preview == commit (same per-user counts).

### Task 5: Auth, users, teams, invitations, audit-log, user-settings

Peel legacy lines 836–1560, 6687–6780 into `AuthService/UserService/TeamService/InvitationService/AuditLogService/UserSettingsService` + controllers + routes. Same per-domain loop: move → remove from legacy → compare. Rate limiters stay on the same routes.

### Task 6: Calls, recordings, reviews/quality, agents

Peel lines 1564–1746, 6187–6600, 6781–6940 into `CallService/RecordingService/ReviewService/QualityService/AgentService`. Keep `recordingUploadMw` and `safeUploadPath` in `config/upload.js` / `RecordingService`.

### Task 7: Analytics, reports, exports, notifications, WhatsApp templates; retire legacy

Peel lines 6601–6686, 6940–7143 and `/health`, `/`, `/api`, `/uploads`. Delete `legacyRoutes.js`. Final `characterize.js --compare` against `legacy.json` must be identical except documented additions (new endpoints/fields); route manifest ⊇ legacy manifest.

### Task 8: Backend verification gate

- [ ] Run all `node --test test/*.test.js` → all pass.
- [ ] Run existing `verify_*.sh` scripts via Git Bash against port 3101 (adapt `BASE`/DB env only) → record pass/fail honestly.
- [ ] `node --check` every file; start server with `.env.test`; hit `/health`.

### Task 9: Frontend design system

**Files:** modify `frontend/src/app/globals.css`, `layout.tsx`; create `components/ui/*`.
- [ ] Port tokens from `crm/crm-frontend/assets/css/main.css` (light + `html.dark`, shadows, radii, easing, module accent vars, Poppins via `next/font`). Keep existing class names working (`brand-*`) by aliasing.
- [ ] Build `PageHeader, GuidanceCard, QuickStatsBar, FilterTabs, FilterBar, DataTable (select/sort/skeleton/empty/pagination/mobile cards), KpiCard, StatusBadge, SlideDrawer, ConfirmModal, Wizard, ThemeToggle`; collapsible grouped `Sidebar` in `app-shell.tsx`.
- [ ] `npx tsc --noEmit` → 0 errors.

### Task 10: Leads UI (page, import wizard, assign drawer, workload, batches)

**Files:** modify `app/(app)/leads/page.tsx`, `components/import-leads-wizard.tsx`, `lib/api.ts`, `lib/lead-ops.ts`; create `components/leads/{assign-drawer,workload-panel,import-batches}.tsx`.
- [ ] Leads page: header, guidance card from `GET /api/leads/unassigned/summary` + follow-ups due, stats bar, filter bar, tabs (All/Unassigned/Hot/Warm/Due Today/Overdue + counts), selectable DataTable with assignee column, bulk bar (assign / reassign / unassign / auto-assign).
- [ ] Import wizard 4 steps (Upload CSV/XLSX drag-drop → Map columns with Meta auto-detect → Assignment chain switches + telecaller multiselect → Preview/Confirm with per-telecaller counts, duplicates, invalid phones).
- [ ] Workload panel (capacity bars) from `/api/agents/workload`; import-history list from `/api/leads/import/batches`.

### Task 11: Restyle remaining pages

Call Queue, Daily Report, Command Center, Follow-ups, Team, Pipeline, Dashboard, Users, Settings, Calls, Performance, Quality, Recordings, Reports, Login — move onto the shared components/tokens (layout and data logic unchanged).

### Task 12: End-to-end verification

- [ ] Backend (`.env.test`, :3101) + `npm run build && npm start` frontend (:3100, `NEXT_PUBLIC_API` → :3101).
- [ ] Playwright: upload `meta-leads.csv` through the wizard with round-robin → assert per-telecaller counts, Unassigned tab count, bulk assign; repeat with xlsx. Screenshots of Leads, Import wizard (each step), Call Queue at 1440px and 390px, light + dark; read each screenshot before claiming visual correctness.
- [ ] Existing `e2e-walkthrough.js` adapted to new base URLs; report real pass/fail.
- [ ] Update `README.md`, `REMAINING_WORK.md`, and API doc page for new endpoints.

## Self-Review

- Spec coverage: §1 structure → T1,2,5,6,7; §2.1 → T3; §2.2/2.3/2.4 → T4; §3 → T9–11; §4 → T0,8,12. 
- Placeholder scan: mechanical-move tasks name exact legacy line ranges and verification command instead of code, because the code is the existing code moved verbatim.
- Type consistency: `planAssignment`/`AssignmentOptions` (T4) match the spec JSON in §2.2; `metaRowToLead` fields (T3) match spec §2.1 table.
