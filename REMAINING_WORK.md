# Callio clone — remaining-work register

Single source of truth for "what is still open", so a gap does not get lost
between sessions or get re-asked as "did you finish everything?".

Status legend: **DONE** · **TODO** · **BLOCKED** (needs a human)

Last verified end-to-end: `tsc --noEmit` 0 errors, `next build` 19 routes, Playwright **24/24 pass,
0 console errors, 0 failed requests**, Android 30 Kotlin files with 0 unbalanced / 0 invalid XML /
0 dangling `R.*` references.

---

## Blocking / deployment

| # | Item | Status | Note |
|---|---|---|---|
| 1 | systemd services not installed | **BLOCKED** | Units written + `systemd-analyze verify` clean, staged in `deploy/`. Installing to `/etc/systemd/system/` needs human approval. Finish with `make -C /root/callyzer-clone units`. Until then all three servers are gateway children and die on gateway restart. |
| 2 | No APK built | **BLOCKED** | No JDK / Android SDK / Gradle on this machine. Source is structurally validated only. Needs Android Studio. |
| 3 | HTTPS | **TODO** | Everything is plain HTTP on a raw IP. Fine for local testing; required before any real deployment. |
| 4 | `ALLOWED_ORIGINS` for CORS | **TODO** | `app.use(cors())` is wide open. Should be pinned to the dashboard origin once a domain exists. |

## Security

| # | Item | Status | Note |
|---|---|---|---|
| 5 | Open self-signup | **DONE** | `ALLOW_SELF_REGISTER` defaults false; register is 403. First-user-becomes-admin rule deleted — it was a race and a landmine. Bootstrap is env-based and fails closed. |
| 6 | No forgot/reset password | **DONE** | `password_resets` table, single-use tokens, admin-side link generator (no SMTP here). |
| 7 | First-user-becomes-admin race | **DONE** | Removed. Bootstrap admin only when no active admin exists, with a loud log line. |
| 8 | No password-reset rate limit | **DONE** | 10/IP/15min + 3/email/hr. Verified trips on the 4th. |
| 9 | `JWT_SECRET` default in source | **DONE** | Strong random value is in the systemd unit; the hardcoded default is no longer used there. Should also be unset-able in dev without falling back to the default. |
| 9a | **`/uploads` served recordings with no auth** | **DONE** | The static mount published every recording to anyone with the URL, defeating the gated `GET /api/recordings/:id/file`. Now 404; avatars get a separate path since they render in other users' rows. |
| 9b | **`seed.sql` duplicated leads every run** | **DONE** | No `ON CONFLICT` — had accumulated 9 copies of each demo lead. Now guarded on email, owner resolved by email. Verified stable across runs. |

## Android app

| # | Item | Status | Note |
|---|---|---|---|
**Correction (2026-10-03):** items 10–19 in the earlier version of this table said "DONE … verified in the source" for an Android tree that had **never been compiled** (stray text in three files, missing imports, an invalid resources file). That claim was wrong. The app was rebuilt in Jetpack Compose and now compiles, passes its tests and is rendered against the reference screenshots. The honest, per-screenshot status is in [`PARITY.md`](PARITY.md).

| # | Item | Status | Note |
|---|---|---|---|
| 10 | Compose rebuild matching the 50 reference screens | **DONE (not run on a device)** | `assembleDebug` OK; 28 screens rendered by Paparazzi at 738×1600; call-log read, SIM mapping, permissions, bubble and WhatsApp listener are unexercised on hardware. |
| 11 | Run on a real phone / emulator | **OPEN** | No emulator or device was available. First thing to do before trusting call sync. |
| 12 | Call-log sync correctness | **DONE (logic) / OPEN (device)** | Sync sends only new calls, asks the server for its newest call on a fresh install, maps Android call types to direction + status (missed/rejected are *incoming*). The earlier `CallLog.Calls.STATUS` bug (a column that does not exist) is gone with the old code. |
| 13 | Payments | **BUILT (Stripe, test mode)** | Checkout + confirm-on-return verified with a real test-card payment on the web; the Android flow (browser → `levoy://premium`) is untested on a device; the webhook is covered by signature unit tests only (Stripe cannot reach localhost). Open: live keys, webhook endpoint/secret, Play Billing question. |
| 13a | Storage on Cloudflare R2 | **VERIFIED live** | put/get/delete round-trip under `levoy/` in the shared `medivoy-uploads` bucket (`scripts/verify-integrations.js`). Local disk remains the fallback. |
| 13b | Push notifications (FCM) | **BUILT; server verified, phone untested** | Server credentials accepted by FCM (dry run); migration 5 trigger + listener; token endpoints in the harness. The app side (token registration, channel, foreground display) compiles but has never received a push on a device. |
| 13c | Scheduled jobs | **BUILT; Trigger side not deployed** | Jobs + secret-guarded endpoint verified in the harness. The medivoy.api change (`src/jobs/levoyJobs.js`, two lines in `scheduledBatchJobs.js`) is written and its jest suite passes, but is **not committed or deployed**; needs `LEVOY_API_URL` / `LEVOY_JOBS_SECRET` in the Trigger project and a publicly reachable API. |
| 14 | Google Drive backup, Chrome Quick Call extension, default-dialler role, post-call prompts, missing-details scan | **BUILT, untested on device** | Drive backup = Android Auto Backup of one file; extension in `chrome-extension/`; dialler role is experimental. See `PARITY.md`. |
| 15 | Translations of long help texts and errors | **OPEN** | 6 languages cover navigation, tabs, tiles, settings, Premium, filter, onboarding, Compare. |
| 18 | ESLint `react-hooks/set-state-in-effect` in the new web pages | **OPEN** | 10 errors, same rule the older pages trip. |
| 16 | Gradle wrapper jar | **OPEN** | not checked in; use Gradle 8.5+ |
| 17 | HTTPS | **OPEN** | the app allows plain HTTP for development |
| 20 | Call recording | **BUILT, untested on a device** | Opt-in (Settings → Call Recording), lead calls only, only while Callio is the default phone app. Records the microphone (`VOICE_COMMUNICATION`, falling back to `MIC`) in a foreground service with a visible notification, saves `<start>_<phoneKey>_<seconds>.m4a`, and `CallSync` attaches it to the synced call via `POST /api/calls/:id/recordings`. Admin/manager list them at `GET /api/recordings` (now with `lead` and a `lead_id` filter). **Open:** Android 10+ gives non-system apps the mic only, so the far end is heard on speaker only; verify on real phones. Play review: declare the mic / foreground-service use and the default-dialer role; the Accessibility-API route (what Truecaller used) is banned for call recording since May 2022. India: the other party must be told the call is recorded. The web dashboard is not in this repo, so the admin player UI still needs to call `/api/recordings`. |

## Web dashboard

| # | Item | Status | Note |
|---|---|---|---|
| 21 | Call Recordings screen | **DONE** | New `/recordings` route: playback, download, filters, delete, agent filter. Nav entry added, plus a `has_recording` indicator on `/calls`. |
| 22 | Lead timeline in drawer | **DONE** | Timeline wired into the lead drawer. |
| 23 | Tags filter + tag editor | **DONE** | Filter control on `/leads` plus tag editing in the drawer. |
| 24 | Merge / dedupe UI | **DONE** | Duplicate finder with a merge confirmation showing what will move. |
| 25 | Bulk status edit | **DONE** | Multi-select with a bulk action bar. |
| 26 | Pipeline stages from config | **DONE** | Stage metadata now read from the API. |
| 27 | CSV import UI | **DONE** | Upload control with a per-row result panel. |
| 28 | Settings screen | **DONE** | New `/settings` route + nav entry. |
| 29 | Login honours registration-status | **DONE** | Register tab hidden and message shown when self-signup is closed. |
| 30 | Admin create-user password reveal | **DONE** | One-time password reveal with a copy button. |

## Data / seeding

| # | Item | Status | Note |
|---|---|---|---|
| 31 | Follow-ups, tags, rules, stages, reviews tables are empty | **DONE** | Follow-ups, tags, rules, stages and 48 reviews seeded. |
| 32 | Demo credential for `pugazh1x@gmail.com` | **DONE** | Reset during diagnosis; user should rotate it. |

## Testing

| # | Item | Status | Note |
|---|---|---|---|
| 33 | Playwright E2E for the web app | **DONE** | `e2e-walkthrough.js`, 21/21, run against both localhost and the public IP. |
| 34 | E2E for the Android app | **TODO** | Needs a device or emulator. Not possible here. |
| 35 | Kotlin/XML structural validation | **DONE** | Brace balance, XML well-formedness, `R.*` reference resolution. Cannot catch type errors — no compiler. |

## Lead assignment, restructure, Prisma, RBAC, CRM UI (2026-10-03)

Design: `docs/superpowers/specs/2026-10-03-lead-assignment-restructure-design.md` · plan: `docs/superpowers/plans/2026-10-03-lead-assignment-restructure.md`.

| # | Item | Status | Note |
|---|---|---|---|
| 36 | Backend restructured into routes / controllers / services | **DONE** | `backend-next/src`. The 6.6k-line `server.js` is now a 3-line entry; the original is kept as `server.js.legacy` for diffing. Proof: a characterization harness replays 443 calls against both and the only differences are the 21 deliberate ones in `test/baseline/expected-diffs.json` (each cites a spec §6 item). Full run now 539 calls, 0 5xx. |
| 37 | Prisma + Postgres owns the schema | **DONE** | `prisma/schema.prisma` + migrations `0_init`, `1_leads_rbac_import`, `2_daily_reports`; `prisma migrate deploy` runs on boot; a DB built by the old `initDB` is baselined automatically. `prisma migrate diff` reports no drift. Raw `pg` is still used by the SQL-heavy services ported verbatim (deliberate — rewriting them in Prisma would have risked behaviour changes). |
| 38 | CSV + Excel lead upload (incl. Meta Lead Ads) | **DONE** | Preview → map → assignment → dry-run review → import; per-row SAVEPOINT so one bad row cannot poison the batch; `dd/mm/yyyy` dates; upload batches. Verified with the real 102-row export (`29-09-2026 - Oct3.csv`) and an `.xlsx`. |
| 39 | Assignment: round-robin, rules, manual bulk, file column | **DONE** | Pure planner (`planAssignment`, 16 unit tests) + capacity awareness; already-owned leads are never moved by a re-upload unless the file / rules / "send all to" say so. |
| 40 | Role-based login + RBAC page (choose tabs per role / custom role / person) | **DONE** | Enforced in the API (`requirePage`) and the UI (sidebar, route guard, login landing page). Verified in the browser: hiding Recordings for agents removed the tab, redirected a direct URL and returned 403 from the API. |
| 41 | CRM-style UI (tokens, light/dark, grouped sidebar, tabs with counts, guidance card) | **PARTIAL** | Fully applied to Leads, Roles & Access, Exports; Users and Team got targeted fixes. Calls, Pipeline, Follow-ups, Call Queue, Command Centre, Daily Report, Area Analysis, Performance, Quality, Settings, Dashboard inherit the new tokens, theme and shell and render correctly, but were not individually redesigned. |
| 42 | Existing `e2e-walkthrough.js` / `verify_*.sh` | **TODO** | Not re-run against the new code. The new harness (`npm run characterize`) and unit tests (`npm test`) cover the same ground for the backend; the Playwright walkthrough still needs its selectors updating for the new UI. |
| 43 | Real Google Sheet not opened | **NOTE** | It needs a Google login. The sheet's structure comes from `LEADS_SPEC.md`. If the sheet has columns or rules that spec lacks, the mapping in `utils/tabularFile.js` / `LeadScoringService` is where to add them. |
| 44 | Lead-list tab counts while an upload filter is on | **TODO** | The count chips (All / Unassigned / Hot…) are workspace-wide, not scoped to the upload being viewed. |
| 45 | Real operations workbook imported and checked | **DONE** | The Google Sheet turned out to be readable; its 1,786-lead "Leads (1)" tab is imported (sheet picker in the wizard) and every derived column the sheet calculated (1,556 rows × 7) matches the app: `scripts/sheet-parity.js`. Findings fixed on the way are spec §6.16–6.22: Cool/Won tiers, bonus on due-today, "Duplicate – skip", Excel dates a day early, month/day vs day/month, phone rule (1,351 phones had a trunk 0), phone-only rows, duplicates merged away (1,786 → 1,520 leads), "called" counting `'false'`. |
| 46 | Lead rules editable by admins | **DONE** | Leads → Lead Rules: call-status rules, thresholds/targets, assignment rules (now also by campaign/segment and area), RBAC-gated, with an on-demand *Recalculate*. Verified as admin (edit + recalculate: Hot 22 → 5 → 22), manager (read-only, API 403) and agent (no tab, 403). |
| 47 | Sheet tabs other than Leads | **NOTE** | *Prospects* (onboarded customers), *Call Queue*, *Command Center*, *Daily Report (1)* and *Area Analysis* are views/derived data; the app has its own pages for the derived ones and does not import them. If Prospects should become Won leads or customers, that is a separate decision. |
| 48 | "Calls done" for Social / WhatsApp differs slightly from the sheet | **NOTE** | Cold Call matches (665); Social shows 161 vs the sheet's 142 and WhatsApp 9 vs 7 because the app also counts a lead as called when it has a call date. |
| 49 | Invitations could not be completed from the UI | **DONE** | Admin gets a shareable accept link (no mail transport exists), pending invites can be re-copied, and an invitee opens /accept-invite to create their account. |
| 50 | Settings → change password, Exports → delete | **DONE** | Both called routes that never existed (`PUT /users/me/password`, `DELETE /exports/:id`); the password page now uses `POST /auth/change-password` and the delete endpoint was added. |
| 51 | UI polish found while testing | **DONE** | Dialogs rendered under the top bar; sidebar hover-expand now pushes content instead of covering it; status pills no longer wrap into tall shapes; the Leads table fits from 1280px up and shows cards below it; Kanban no longer overflows a phone. |

## Process failures worth not repeating

**Claimed "everything is finished" after examining ~5 of the 50 reference screenshots.**
The palette came from sampling all 50 programmatically, which felt like thoroughness,
but the FEATURE inventory came from the handful of screens I looked at directly.
Everything else — the other 45 — was assumed to be covered by the reference
conventions plus the existing web dashboard. Two screens sampled at random
immediately showed features that had never been built:

- permission-missing banner with a "FIX NOW" action
- date-range selector with a period dropdown ("Today", explicit start/end timestamps)
- metrics not present anywhere in our app: **Not Pickup by Client**, **Unique Calls**,
  **Working Hours**, **Ideal Time**
- a skip-verification confirmation modal with specific copy
- **Premium plan tiers** with locked metrics and ribbons

Lesson: **programmatic sampling of pixels answers "what colour", never "what
feature".** Counting distinct colours across 50 screenshots is not the same as
reading 50 screenshots. When the reference set is the deliverable's definition of
done, every item in it gets read — not sampled.

## Verification lessons worth keeping

- A green test suite run **on the machine that built the thing** proves nothing about
  users. The dashboard passed 21/21 on localhost while being completely unusable
  from any external browser, because a build-time-inlined API host is trivially
  correct on the build machine and false everywhere else.
- Text-length assertions pass on a page whose table columns have collapsed into
  each other. Read a screenshot before making a visual claim.
- Always re-run a subagent's acceptance criterion yourself before repeating its
  verdict to the user.
