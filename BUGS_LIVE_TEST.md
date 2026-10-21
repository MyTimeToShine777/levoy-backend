# Callio live test – bug log

- **Date:** 2026-10-21
- **Frontend:** https://levoy-frontend.vercel.app (proxies `/api` to https://api-levoy.medivoy.in/api)
- **Method:** Playwright, real emailed-OTP logins
- **Accounts used:** `pugazh1x@gmail.com` (platform owner), `sripugazharasan19@gmail.com` (admin, workspace "Pugazh Crm")

## Fix status (2026-10-21, working tree, NOT committed or deployed)

Verification done: backend unit tests 67/68 pass (the one failure, `metaLeads.test.js`, fails the same way without these changes because `test/fixtures/meta-leads.csv` is missing), ESLint clean on every changed backend file, all changed modules load, frontend `tsc --noEmit` clean, Android debug build succeeds. **Nothing was tested against the live database or the live site**; each fix needs a deploy and a re-test.

| Bug | Status | Where |
|---|---|---|
| B1 Reports connected = 0 | **Fixed** (daily report never returned `connected`) | `backend-next/src/services/ReportService.js` |
| B2/B20 Duplicate calls | **Fixed going forward** (server skips a call already stored, same person + direction + length within 5 s). Existing duplicates need `scripts/fix_call_data.sql` | `CallService.js`, `utils/callIngest.js` (+ tests), `scripts/fix_call_data.sql` |
| B3 Owner shows "User #1" | **Fixed** (API now returns `owner_name`) | `LeadService.js`, `lead-drawer.tsx`, `api.ts` |
| B4 No way to delete a lead | **Fixed** (Delete button + confirm in the lead drawer, for people with `leads.delete`) | `lead-drawer.tsx` |
| B5 Export buttons missing | **Fixed** (Export Center creates all four export types; dashboard export now sends the login header) | `exports/page.tsx`, `page.tsx`, `api.ts` |
| B6, B10 Developer text in UI | **Fixed** (Add user, QA review, Daily Report, Area Analysis, Call Queue, Command Centre) | six pages under `src/app/(app)/` |
| B7 Phone formats / default country | **Fixed** as proposed: admin picks a default country (Settings → Phone numbers); server stores `+<code><number>` for new/edited leads and logged calls; forms show the prefix. Existing numbers: run `scripts/normalize_phones.sql` | `utils/phoneFormat.js` (+ tests), `WorkspaceSettingsService.js`, `LeadService.js`, `CallService.js`, `phone-country-setting.tsx`, forms |
| B8 Delta next to zero | **Fixed** (the % was real but unlabeled; now says "last N days vs N before") | `page.tsx` |
| B9 Overdue count disagrees | **Fixed** (Leads summary and Overdue tab also count open follow-up tasks past due) | `LeadService.js` |
| B11 Call Queue 403 as agent | **Fixed** (agents no longer request the user list; telecaller filter hidden) | `call-queue/page.tsx` |
| B12 Android does not compile | **Fixed** | `AppModel.kt` |
| B13 Sign-in "Signing in…" on resend / no error | **Fixed** (own label for resend; any failure shows a message) | `AppModel.kt`, `OnboardingScreens.kt`, `Root.kt` |
| B14 Lead still "Not called yet" after a call | **Fixed.** An uploaded call to a lead now sets "Last contacted" and, if the lead has no status yet, sets it to **Called** (someone spoke) or **Not Answered** (we rang, nobody spoke). A status the agent already chose is never overwritten. The lead's score, tier and next action are recalculated. A new "Called" status rule is added. Existing leads: `scripts/backfill_lead_call_status.sql` | `CallService.js`, `utils/callIngest.js` (+ tests), `db/seed.js`, `scripts/backfill_lead_call_status.sql` |
| B15 Contacts total 358 vs 336 | **Fixed.** Contacts now defaults to "All time" (matches the dashboard's All-Time Calls) and prints which period the counts cover | `contacts/page.tsx` |
| B16 Lead name on in-call screen | **Fixed** (app keeps assigned leads' names and uses them when the contact is not saved) | `Session.kt`, `Api.kt`, `InCall.kt` |
| B17 NaN in review popup | **Fixed** | `reviews/new/page.tsx`, `api.ts` |
| B18 QA category points wrong | **Fixed** (frontend formula) and coaching target no longer picks arbitrarily on a tie | `quality/page.tsx`, `QualityService.js` |
| B19 0 s calls marked "connected" | **Fixed** on the phone and on the server. Existing rows: `scripts/fix_call_data.sql` | `CallLogReader.kt`, `utils/callIngest.js` |
| B21 Admin has no Download/Delete on recordings | **Was a mistake in my test, but improved anyway.** The buttons always existed for everyone; they were icon-only with just a hover title, so my script missed them. They now also have proper `aria-label`s | `recordings/page.tsx` |

To go live: deploy the API, redeploy the frontend, release the new Android build, then run the three SQL scripts once per customer database, in this order: `fix_call_data.sql`, `normalize_phones.sql`, `backfill_lead_call_status.sql`. Each prints counts and rolls back until you change its last line to `COMMIT`. Then press "Recalculate" on the Lead Rules page.

## Coverage so far

| Area | Result |
|---|---|
| Platform console: Customers, customer detail, Plans | Loads, no console errors |
| All 26 workspace sidebar pages (admin) | Load, no console errors, no failed API calls |
| Add lead | Works (201) |
| Mark contacted | Works (200) |
| Schedule / complete follow-up | Works |
| Lead Activity timeline | Works |
| Call search filter | Works |
| Log Call form validation | Works |
| Upload leads wizard, Add user dialog | Open correctly (not submitted) |

## Bugs

### B1 – Reports shows Connected = 0 / 0% connect rate (High)
- **Where:** `/reports`
- **Seen:** Total calls 336, Connected 0, Connect rate 0%. Daily table "Connected" column is `—` for every day.
- **Expected:** Dashboard and Performance report 92.7% connect rate for the same calls, and Call Logs lists them as "Connected".
- **Likely cause:** Reports aggregates a different status field/value than the dashboard.

### B2 – Duplicate call rows (High)
- **Where:** `/calls`, dashboard "Recent Calls"
- **Seen:** +917845860720, Incoming, Connected, 3m 42s, Oct 20 09:57 PM appears twice.
- **Likely cause:** Android app uploaded the same call twice, or the API does not de-duplicate on (number, started_at, duration).

### B3 – Lead owner shows "User #1" (Medium)
- **Where:** lead drawer → Details → Owner
- **Seen:** `User #1` instead of the user's name.
- **Expected:** Owner's name (Pugazh).

### B4 – No way to delete a lead in the UI (Medium)
- **Where:** `/leads` drawer and bulk-action bar
- **Seen:** Drawer has Mark contacted / Assignment only. Bulk bar has Assign…, Change status, Clear. No delete anywhere.
- **Impact:** Test or wrong leads cannot be removed.

### B5 – Export buttons missing on Calls and Leads (Medium)
- **Where:** `/exports` says "Use the Export buttons on the Calls and Leads pages"
- **Seen:** Neither `/calls` nor `/leads` has an Export button. Only `/call-history` does.
- **Impact:** Export Center stays empty and its instructions are wrong.

### B6 – Developer text in Add user dialog (Low)
- **Where:** `/users` → Add user
- **Seen:** "Endpoint `POST /users`. If the API has not deployed it yet this reports the error rather than failing silently."
- **Fix:** Remove from the production UI.

### B7 – Inconsistent phone formatting (Low)
- **Seen:** new lead `+919000000001`, imported lead `7845860720` (no country code) in the same list.

### B8 – Delta shown next to zero (Low)
- **Where:** dashboard
- **Seen:** "Calls Today 0" with "26.8% vs prev", "Connected 0" with "66.7% vs prev".
- **Expected:** A neutral or hidden delta when the current value is 0, or an explanation of what is compared.

### B9 – Overdue count disagrees between Leads and Follow-ups (Medium)
- **Where:** `/leads` vs `/follow-ups` (seen as admin and as agent)
- **Seen:** Lead "Vinoth" has a follow-up due Oct 18. Follow-up Queue says **Overdue 1**. Leads page says **OVERDUE 0** and "All caught up – Nothing urgent right now".
- **Impact:** The "What should I do next?" card hides an overdue follow-up.

### B10 – Developer text in Daily Report footer (Low)
- **Where:** `/daily-report` (bottom), text starts "source GET /api/an…"
- **Fix:** Remove from the production UI.

### B11 – Call Queue calls an admin-only endpoint as agent (Low)
- **Where:** `/call-queue` as agent
- **Seen:** `GET /api/users` returns 403 (one console error on every load). The "All telecallers" filter is still shown to the agent.
- **Fix:** Skip the call and hide the telecaller filter when the role lacks `users` access.

### B12 – Android app does not compile (Critical)
- **Where:** `android/app/src/main/java/com/levoy/app/AppModel.kt:620-621`
- **Seen:** `./gradlew :app:assembleDebug` fails with `Platform declaration clash: setCallRecording(Z)V`. The delegated `var callRecording by mutableStateOf(...)` and `fun setCallRecording(v: Boolean)` compile to the same JVM method.
- **Cause:** Introduced with the "record assigned-lead calls" commit (0a9cfe4).
- **Fix applied locally:** `@JvmName("applyCallRecording")` on `setCallRecording`. No call sites change. Not committed.

### B13 – Login screen hangs on "Signing in…" with no error when the network is down (Medium)
- **Where:** Android app, OTP screen
- **Seen:** After the emulator lost DNS, tapping **Resend code** changed the main button to "Signing in…" (code field empty). It stayed there for 30 s+ with no error, retry or timeout.
- **Also:** the button label says "Signing in…" for a resend, which is misleading.
- **Fix:** Show a network error and re-enable the buttons on failure; use a "Sending…" label for resend.

### B14 – Lead shows "Not called yet" despite 358 calls to the same number (Medium)
- **Where:** Android Leads tab and lead edit form (also web Call Queue: "Days since call: never")
- **Seen:** Lead "Vinoth" is stored as `7845860720`; calls are stored as `+917845860720`. The lead stays "(Not called yet)", "Make the first call".
- **Likely cause:** Phone numbers are compared without normalising the country code. Extends B7.
- **Impact:** Lead scoring, call queue and "recording only for assigned-lead calls" can all miss matches.
- **Update (later test):** a call placed from the app to the lead's *exact* stored number (`7845860720`) was recorded and uploaded correctly, yet the lead still shows "Not called yet" in the app and the web Call Queue. So even with matching formats, placing a call does not update the lead's call status / last-contacted. The recorder itself did match the lead (the "Recording this lead call" notification appeared).

#### Proposed fix for B7 + B14: workspace default country (requested by product owner)
Nobody should have to type `+91`. Instead:
1. **Admin setting:** Settings (workspace level) gets a **Default country** (India `+91` by default). Stored on the workspace.
2. **Normalise once, on the server:** every phone number that enters the system (add lead, lead import, call log sync, in-app calls, recordings upload) is converted to one canonical E.164 form using the workspace country when the number has no `+`/country code (`7845860720` → `+917845860720`; strip spaces, dashes and a leading `0`). Store the canonical value and keep the raw input for display.
3. **Match on the canonical value:** lead ↔ call matching, contacts grouping, Call Queue "days since call", lead "called" status and "record assigned-lead calls" all compare canonical numbers, so `7845860720` and `+917845860720` are the same person.
4. **Clients:** add-lead form, Log Call and the Android dialler prefill the country code and show a flag/prefix, so users only type the local number. Numbers that already include a country code are left alone.
5. **Back-fill:** run a one-off migration to normalise existing leads and calls (this also lets B2 duplicates be found: same canonical number + start time + duration).
6. **Edge cases:** a number that is too short or too long for the selected country is rejected with a clear message; international numbers still work when typed with `+`.

### B15 – Contacts total differs between web and app (Low)
- **Seen:** Android Contacts and web Dashboard say 358 calls for +917845860720. Web Contacts and Reports say 336 (default date range, not labelled).

### B16 – In-call screen does not show the lead's name (Medium)
- **Where:** Android, in-call screen after tapping Call on a lead (`calls/InCall.kt:167`, also the incoming-call notification at `InCall.kt:115`)
- **Seen:** Calling lead "Vinoth" shows only `7845860720` ("Calling…"), with an avatar showing "7".
- **Cause:** The name comes only from `CallLogReader.nameFor` (device call log / contacts). The assigned lead's name is never used, so a lead who is not in the phone's contacts always shows as a bare number.
- **Expected:** Show the lead name (and status) when the number matches an assigned lead. Fits the "record assigned-lead calls" feature, which already matches the number to a lead.

### B17 – "Review submitted" popup shows NaN for every category (High, fixed locally)
- **Where:** `/reviews/new`, success popup after Submit review (`src/app/(app)/reviews/new/page.tsx` ~line 459)
- **Seen:** Popup lists `0 NaN`, `1 NaN` … `5 NaN` instead of Opening/Discovery/… with scores. The toast and the "Final score 80.0 / 100" are correct.
- **Cause:** `POST /calls/:id/reviews` returns `scores` as a list `[{category, score, weight, weighted}]`. The popup treated it as a `{category: score}` map (`Object.entries` → keys 0-5, values become `Number(object)` = NaN).
- **Fix applied locally (not committed):** popup accepts both shapes; `Review.scores` type in `src/lib/api.ts` widened. Needs a redeploy to https://levoy-frontend.vercel.app.

### B18 – QA drill-down shows wrong points per category (Medium)
- **Where:** `/quality` → click an agent → Category breakdown
- **Seen:** All six categories rated 4/5 show "0.4 of 10 pts", "0.8 of 20", "1.2 of 30", "0.8 of 20", "0.4 of 10", "0.4 of 10" (sums to 4, not 80).
- **Expected:** 8 of 10, 16 of 20, 24 of 30, 16 of 20, 8 of 10, 8 of 10 (the review form and API `weighted` values are right).
- **Likely cause:** points computed as `average × weight / 100` instead of `average / 5 × weight`.
- **Also:** "Coaching target: Closing" is picked arbitrarily when all categories tie at 4.00.

### B19 – Calls with 0 s duration are marked "connected" (Medium)
- **Where:** `/calls`, QA call picker (many rows such as "outgoing · 0s · 2d ago connected")
- **Impact:** Connect rate (92.8%) is inflated; these should be unanswered/missed.

### B20 – Duplicate calls are pervasive, not a one-off (High; extends B2)
- **Seen:** In the QA call picker nearly every call appears twice with the same direction, duration and time (e.g. outgoing 1m 18s ×2, outgoing 4m 41s ×2, incoming 1m 55s ×2). Roughly half of the 358 calls look like duplicates.
- **Not reproduced for new calls:** a call placed from the app on 2026-10-21 was stored once.
- **Fix:** de-duplicate on (canonical number, start time, duration, direction) on upload, and back-fill-clean existing rows once phone numbers are normalised.

### B21 – Recordings page: admin has Play only; agent has Download and Delete (Low)
- **Seen:** For the same recording, `luzf3r7` (agent) sees Play, Download audio and Delete recording; the admin sees Play only.
- **Question for product:** should admins be able to download and delete? Agents deleting their own evidence of calls may also be unwanted.

## Admin dashboard functional test (`sripugazharasan19@gmail.com`, admin, Pugazh Crm)

| Function | Result |
|---|---|
| All 26 pages: no NaN / undefined / [object] in text or markup | Clean (the NaN is only in the review popup, B17) |
| Recordings (admin): list, Play | Works: 44.9 s audio loads and plays |
| Leads: bulk Assign (balance mode, with note) | Works; result panel; lead now "→ Luzf3r" and appears in the agent's Android app |
| Leads: bulk Change status | Works (`bulk-status` 200) |
| Kanban: move card between stages | Works (forecast recalculates). Mouse-drag in automation was unreliable, so the drop was fired as a DOM event |
| New QA Review: pick call, rate 6 categories, notes, Submit | Works (201). Weighted total correct (80.0). **Popup shows NaN (B17)** |
| Quality: leaderboard, agent drill-down | Works. Category points wrong (B18) |
| Contacts: New group | Works (201) |
| Settings: Save profile, Save preferences | Works (200 / 200) |
| Call History: Export → Download Excel | Works (file `c6-call_report_*.xlsx`, 65 calls) |
| Roles & Access: role tab, user tab | Loads; Agent role shows 16 tabs / 17 actions, matching the agent's sidebar. Not changed |
| Users page | Loads; actions are Access and Deactivate. Not changed |
| Not exercised on purpose | Invite/create user, deactivate, role changes, changing role permissions, lead rules edits, uploading a lead file, completing the overdue follow-up on the real lead |

## Test data left behind (Pugazh Crm workspace)
- Lead "ZZ Claude Test Lead" (+919000000001): now Proposal, assigned to Luzf3r, with two follow-ups (one completed). It could not be deleted (see B4).
- Two QA reviews by Pugazh for Luzf3r (calls 358 and 359), score 80 each, notes start "QA test review".
- Contact group "QA Test Group" (empty).
- One call (id 359, outgoing, 45 s) with its recording, from the emulator.
- Emulator state: Callio is the default phone app and Call Recording is ON.
- Local, uncommitted code changes: `android/.../AppModel.kt` (B12) and `levoy-frontend` `src/app/(app)/reviews/new/page.tsx` + `src/lib/api.ts` (B17). `npm ci` and `tsc --noEmit` pass.

## Not tested yet
- Agent role (`luzf3r7@gmail.com`) on the web
- Android app on the emulator
- Skipped on purpose: submitting Log Call, uploading a lead file, creating or inviting a user (cannot be undone, invites send real email)

## Agent web test (`luzf3r7@gmail.com`, role agent, workspace Pugazh Crm)

| Check | Result |
|---|---|
| Real OTP login | Works, lands on `/` |
| Sidebar | 16 tabs; admin-only tabs (Users, Roles, Command Centre, Performance, Lead Rules, Team, QA, Area Analysis, Device Health) hidden |
| Direct URL to 9 admin-only pages | All redirect to `/` (guard works) |
| 16 allowed pages | All load. Only console error is B11 |
| Lead scoping | Agent sees only their assigned lead ("Vinoth"), not the unassigned test lead |
| Reports | Same Connected = 0 problem as admin (B1) |
| Duplicate call rows | Also visible to agent (B2) |

New bugs from this run: B9, B10, B11. Not tested as agent: Call/WhatsApp buttons in Call Queue, drag in Kanban (would change the real lead "Vinoth").

## Android app test (emulator `medivoy_pixel`, API 34, debug build, server https://api-levoy.medivoy.in/api)

Built with Gradle 8.5 after applying the B12 fix. Logged in as `luzf3r7@gmail.com` (agent) with a real OTP.

| Check | Result |
|---|---|
| Build | Fails as committed (B12); passes with the `@JvmName` fix |
| Install | A differently signed `com.levoy.app` was already on the emulator; had to uninstall first |
| Onboarding | Privacy → Default phone app → Contacts access all work; set Callio as default dialer |
| OTP login | Works. Fails to recover when DNS is down (B13) |
| Call History | Loads 358 server calls; duplicates visible (B2) |
| Leads | Shows the one assigned lead; Edit Lead form opens (cancelled, not saved); "Not called yet" wrong (B14) |
| Analytics | Graph, week range, Summary/Analysis tabs render |
| Contacts | Loads (B15) |
| Side menu | Plan, Export Calls Report, Linked Extension, Missed Call Reminder, Troubleshooting, Compare, Settings, Help, Invite, Rate all present |
| Troubleshooting | Call Sync, Note Popup, Missed Call Reminder, Quick Action, WhatsApp Call listed |
| Settings → Call Recording | Screen renders with explanation, toggle OFF by default |

Environment note: the emulator lost DNS after the host clock jumped about 40 minutes; restarting with `-dns-server 8.8.8.8,1.1.1.1` fixed it. This is an emulator issue, not an app bug.

**Not tested:** actual call recording and upload (needs a simulated call, which would create an undeletable call and recording on the live Pugazh Crm workspace), Backup/Restore, Export Calls Report, Quick Call extension linking, missed-call reminder, Invite Friends.
