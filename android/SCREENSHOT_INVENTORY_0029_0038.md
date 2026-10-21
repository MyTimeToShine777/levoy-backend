# Callio Android — Screenshot Feature Inventory (WA0029–WA0038)

Source: `/root/drive-shots/IMG-20261002-WA00{29..38}.jpg` (all 738x1600)
Theme observed: near-black bg (#101010-ish), dark charcoal surfaces, white/grey text, amber/yellow (#F0B000-ish) accent.

---

## S1 — WA0029 · "Connect Sim"
Screen type: pre-onboarding SIM phone-number verification form.

**Header**
- Back arrow (icon only, left). Title: `Connect Sim`. No right-side icons.

**Info banner (inline, not modal)**
- Circled `i` icon + copy, exact wrap:
  - `Due to Latest Google Policy & Android Version we have to`
  - `collect required information by verifying your phone number.`

**SIM selector**
- SIM-card outline icon containing the number `1`
- Label (bold, white): `Jio True5G | Jio`
- No dropdown arrow / no visible SIM switcher control

**Form fields (2)**
- Field 1: pre-filled value `91` (country code — NO visible label, flag, or dropdown chevron)
- Field 2: placeholder `Phone Number` (empty)

**Actions**
- Primary CTA, full width, amber, uppercase: `SUBMIT`
- Footer link: `Privacy Policy`

**Absent**: no stat cards, no tabs, no bottom nav, no toggles, no dialogs.
**Premium gate**: none.

---

## S2 — WA0030 · Call-history category tab list ("Not Pickup by Client")
Screen type: scrollable list of contacts for a call category + dialpad drawer overlaying lower half.

**Warning banner (pale cream/peach rounded rect)**
- Pale-orange circled `i`
- Exact copy / wrap:
  - `Some required permissions are missing.`
  - `Please fix this for smooth functionality. FIX` / `NOW`
- `FIX NOW` is a single blue underlined action link that wraps. **No dismiss/close button.**
- Does NOT enumerate which permissions are missing.

**Category tab row (horizontally scrollable — left tab is clipped)**
1. Clipped tab, visible text `jected` (leading characters off-screen; likely "...jected"), red call icon, grey = inactive
2. `Never Attended Calls` — red phone icon, grey = inactive
3. `Not Pickup by Client` — red/magenta phone icon, BOLD WHITE = active, white dot indicator beneath
- No Premium badges/locks on tabs.

**Contact cards (rounded charcoal), 2 visible**
Card 1
- Name: `Sakthi Bro Nx`; Number: `+916374949577`
- Left: orange circle w/ black phone handset + curved arrow (call-status)
- Rows (4 unlabelled columns: index / relative time / date / time):
  - `1` | `7 hours ago` | `02 Oct 2026` | `11:43 AM`
Card 2
- Name: `Kona Manda Frd`; Number: `+918903219715`
- Two rows that are EXACT DUPLICATES of each other:
  - `1` | `2 days ago` | `30 Sep 2026` | `07:55 PM`
  - `2` | `2 days ago` | `30 Sep 2026` | `07:55 PM`

**Per-card right action cluster (4 icon-only controls, identical on both cards)**
1. Two overlapping outlined rectangles (copy/number)
2. Blue outlined SMS/message bubble with 3 dots
3. Green WhatsApp bubble+handset
4. Blue outlined phone handset (call)

**Dialpad drawer (covers lower ~half, deep navy, rounded top corners)**
- Top-left: two overlapping white outlined rounded rectangles (copy/paste/contacts) — icon only
- Top-right: backspace/delete icon containing an `X` — icon only
- Keypad: `1 2 3 / 4 5 6 / 7 8 9 / * 0 #`, with small `+` beneath `0`. No backspace key in grid.
- Bottom row: green WhatsApp icon | large green circular call button (white handset) | grey 3x3 nine-dot keypad icon
- NO entered number, NO caller name, NO empty-state copy.

**Navigation**: no in-app bottom nav (the 3-icon row belongs to the dialpad). Android gesture pill only.
**Premium gate**: none.

---

## S3 — WA0031 · "Quick Action" (settings sub-screen, explanatory/help page)
Screen type: settings detail page describing a feature.

**Header**: back arrow; title `Quick Action`. No right icons.

**Settings toggle card**
- Dark rounded card; left icon = stacked layers/papers
- Label: `Quick Action`
- Right: toggle switch in **OFF** position, with literal text `OFF`

**Body copy (exact)**
- Heading: `Quick Action Feature :`
- Bullet: `Callio's quick action is designed to give you instant access to essential call actions and insights — right when you need them most.`
- Bullet: `Once a call begins, the quick action appears on your screen. Tapping it opens up two smart options:`

**Embedded marketing screenshot (image inside the page)**
- Mock in-call UI: `U` icon, purple profile circle with `P`, green status dot
- Number `909865253`, timer `0003` beneath
- Action icons: Keypad, Mute, Speaker, More (info)
- Red circular end-call button with handset

**Feature bullets (the "two smart options")**
- `Save Contact – If the number isn't saved on your device, you can add it to your contacts with a single tap.`
- `View Details – Instantly access Callio's in-depth call history and analytics for the on-going call.`
- Third bullet is TRUNCATED at bottom: `This feature helps you stay informed, take action faster, and manage calls more efficiently — all`

**Bottom ad banner**
- Headline: `Get winning sales scripts, objection handling tactics & pro tips — free!` ("Get winning" and "free!" in amber; rest grey)
- CTA button (coral/red): `Claim your free scripts`
- Art: trophy, confetti, people figures, `Callio` logo at right

**Navigation**: no bottom nav. No dialogs, no stat cards, no empty state.
**Premium gate**: none (no lock on the toggle).

---

## S4 — WA0032 · "Settings" (main settings list)
Screen type: single scrollable settings list, 12 rows, thin grey divider under every row (incl. last), grey scrollbar thumb at right edge.

**Header**: back arrow; title `Settings`. No search/overflow/profile icon.

**Rows** — pattern = white icon LEFT + exact label + white right chevron. **No subtitles, no current values, no inline switches, no checkmarks, no badges.**
| # | Exact label | Left icon |
|---|---|---|
| 1 | `SIM Number` | SIM card outline w/ clipped corner + contact square |
| 2 | `WhatsApp Call` | chat bubble containing phone handset |
| 3 | `Quick Action` | vertical phone outline w/ small circular controls |
| 4 | `Language` | globe (circle w/ lat-long grid) |
| 5 | `Theme` | two-tone circular light/dark symbol |
| 6 | `Time Format` | stopwatch w/ top button, ticks, hands, motion lines |
| 7 | `Set Default Screen` | three stacked layers/sheets |
| 8 | `Missing Call Details` | phone receiver + question mark + detail circles |
| 9 | `Remove as Default Dialer` | grid of round dots (keypad) |
| 10 | `Backup / Export Call History` | thick down arrow over a line |
| 11 | `Restore / Import Call History` | thick up arrow over a line |
| 12 | `Delete Account` | trash can w/ lid + slots — WHITE, not red |

**Notes**: `Theme` is a navigation row, NOT an inline switch. Spaces around `/` are present in rows 10 and 11.
**Absent**: no section headers, no column headers, no bottom nav, no dialogs/banners/empty states.
**Premium gate**: none.

---

## S5 — WA0033 · Contact detail · "Sakthi Bro Nx" → `Call History` tab
Screen type: per-contact detail screen, 3 tabs, summary strip + chronological call list with 2 injected ad banners.

**Header**
- Back arrow
- Title: `Sakthi Bro Nx`
- Number beneath: `+916374949577`
- Orange action: `+ Add to Group`
- Right side: white filter/funnel icon; white vertical three-dot overflow icon

**Summary metric strip (2 metrics, no icons, no borders)**
| Label | Value |
|---|---|
| `Duration` | `27 Jul - 02 oct` (lowercase "oct" as shown) |
| `Total days` | `68 Days` |

**Tabs**: `Summary` (grey) | `Analysis` (grey) | `Call History` (bold white, ACTIVE, white dot beneath)

**Call history list — no text column headers; 4 visual columns = call type+icon / date (+time beneath) / duration / document icon. Thin grey dividers between records.**
| # | Type | Date | Time | Duration | Right icon |
|---|---|---|---|---|---|
| 1 | `Outgoing` (orange phone) | `Today` | `11:43 AM` | `0s` | doc/details |
| 2 | `Outgoing` (orange phone) | `Yesterday` | `05:55 PM` | `5m 12s` | doc/details |
| 3 | `Outgoing` (orange phone) | `30 September 2026` | `07:52 PM` | `20s` | doc/details |
| 4 | `Outgoing` (orange phone) | `27 September 2026` | `11:48 AM` | `32s` | doc/details |
| 5 | `Outgoing` (orange phone) | `26 September 2026` | `01:34 PM` | `1m 0s` | doc/details |
| 6 | `Missed` (RED phone) | `26 September 2026` | `12:19 PM` | `0s` | doc/details |
| 7 | `Outgoing` (orange phone) | `26 September 2026` | `12:18 PM` | `8s` | doc/details |
- Ordering newest→oldest. Within 26 Sep: 01:34 PM → 12:19 PM → 12:18 PM.

**Ad banners — SAME creative, appears TWICE (in-list after record 2, and pinned at bottom, bottom one clipped)**
- Headline: `Get winning sales scripts, objection` / `handling tactics & pro tips — free!` (amber on `Get winning` + `free!`)
- CTA: `Claim your free scripts`
- Art: gold trophy, confetti, celebratory figures; logo `Caliper` — **NOTE: reads "Caliper", not "Callio"**
- No `Ad` disclosure label visible.

**Premium gate**: none on any record.

---

## S6 — WA0034 · "Premium" (paywall — Premium Plus tier selected)
Screen type: plan-selection paywall.

**Header**: back arrow; title `Premium`. No right icons.

**Page heading**: `Upgrade To Premium` (large bold, left)

**Tier tabs (3)**
| Tier | Icon | State |
|---|---|---|
| `Premium` | large muted-grey 5-point star | inactive, grey label |
| `Premium Plus` | bright yellow award/medal w/ ribbon tails + dark star | **SELECTED** — bold off-white label + white dot beneath |
| `Callio Biz` | muted-grey trophy | inactive, grey label |
- No lock icon / no "Locked" ribbon on tiers.

**Premium Plus feature list — 3 items, each preceded by a small orange outlined rosette/circular icon**
1. `Easily organize contacts into customized` / `groups.`
2. `Filter and export reports based on groups.`
3. `Track your ideal time (break hours) and` / `working hours, view a timeline sheet for` / `both, and download it.`

**Plan section**
- Heading: `Choose a Plan`
- ONE plan card (rounded, lighter charcoal top / darker bottom split)
- Small dark EMPTY selection square, NO checkmark
- Duration: `1 Month`
- Price: `₹125` (large bold, muted blue-grey)
- No renewal amount, billing date, strike-through, discount or savings label. No ribbon on card.

**Actions**
- Primary CTA (full width, amber, dark text): `Subscribe`
- Muted line: `7 days free trial for new subscribers only`
- Muted line + amber link: `Already have an account?` + `Sign In`

**Inline notice card (bottom, rounded, thin grey outline, circled `i`)** — partially cropped by bottom edge:
- `You can cancel your subscription anytime through`
- `the Play Store`

**Navigation**: NO bottom nav bar on this instance.
**Premium gate**: this screen IS the gate (3 tiers / ₹125 / Subscribe / trial / Sign In).

---

## S7 — WA0035 · "SIM Number" (verification method chooser)
Screen type: onboarding — pick how to verify phone number.

**Header**: back chevron; title `SIM Number`

**Main heading**: `Choose one of the option to verify your number` (singular "option" — verbatim)

**3 tappable option cards (rounded charcoal, each with right chevron)**
1. `Verify via Call Log` — icon: phone handset w/ clockwise clock/arrow overlay
   - Body: `App will show few call logs and you need to simply select which call you have dialed using +919344281783.`
2. `Verify via Call` — icon: phone handset
   - Body: `App will make a dummy call to your number itself.`
3. `Skip Verification` — icon: prohibited / circle-with-diagonal-line
   - Subtext: `(Not Recommended)`
   - Body: `Verification process will be skipped and you would be able to use app. However, you may face issue with reports and upcoming versions.`

**Absent**: no stat cards, tabs, toggles, chips, dropdowns, banners, dialogs, bottom nav, paywall.

---

## S8 — WA0036 · "Upgrade To Premium" (paywall — PREMIUM tier selected)
Screen type: plan-selection paywall, different tier + different price from S6.

**Heading**: `Upgrade To Premium` (large bold). *(No separate header title bar visible.)*
**Status bar**: time `6:26` + cast/camera icon; Wi-Fi w/ `5G`, signal, battery `85`.

**Tier tabs (3) — selection is OPPOSITE to S6**
| Tier | Icon | State |
|---|---|---|
| `Premium` | gold star | **SELECTED** — white dot beneath |
| `Premium Plus` | grey ribbon/medal | inactive |
| `Callio Biz` | grey trophy | inactive |

**Section heading**: `Here is what you will unlock`
**Feature list — 4 items, each preceded by a yellow/gold checkmark in a circle:**
1. `Ad-Free Experience.`
2. `Auto Back Up your Call Logs in Google Drive.`
3. `You can now receive quick technical support through Whatsapp.`
4. `Link your device with Chrome via the Quick Call Extension to place calls directly from the browser.`

**Plan section**
- Heading: `Choose a Plan`
- ONE plan card: small dark radio square (no checkmark visible) + `1 Month`; price `₹75`

**Actions**
- Primary CTA full width, amber, bold black text: `Subscribe`
- Muted small text: `7 days free trial for new subscribers only`

**Bottom nav bar — 5 items (THIS instance shows one; the other Premium screen S6 does not)**
1. `Call History` — phone handset icon
2. `Analytics` — bar chart icon
3. `Premium` — yellow fist/logo — **ACTIVE (yellow)**
4. `Contacts` — person silhouette
5. `More` — three horizontal lines (hamburger)

**Not present on this instance**: no `Already have an account? Sign In` line, no "You can cancel your subscription..." notice card.
**Premium gate**: this screen IS the gate.

---

## S9 — WA0037 · `Call History` (main call log, `Today` range)
Screen type: primary call-log list with date-range header + dropdown + 2 injected ad banners.

**Header (no app-bar title / no back arrow / no hamburger / no bell / no profile)**
- Left, large bold white range label, wraps 2 lines exactly:
  - `02-Oct 12:00 AM - 02-Oct 11:59` / `PM`
- Right: dark-grey rounded dropdown, text `Today`, with downward chevron. No menu open.

**Tabs**: `Summary` (dim grey, unselected) | `Call History` (bold white, SELECTED, light-grey dot beneath) — only two tabs here (vs. three on the contact-detail screen S5).

**List — NO printed column headers.** Four visual areas per row: grey circular avatar w/ white person silhouette → contact/name block → date+time → direction + duration. Plus a white page/document icon at far right on every row (page w/ folded corner + 2 dark lines). Thin grey dividers between rows.

| # | Contact block | Date | Time | Direction | Duration |
|---|---|---|---|---|---|
| 1 | `Medivoy` / `+919486613245` (row clipped by sticky tab bar) | — | `01:59 PM` | — | `12s` |
| 2 | `Unknown` / `+918031463704` | `02 Oct 2026` | `01:44 PM` | `Incoming` (GREEN) | `5s` |
| 3 | `Mythreyi Hr` / `Medivoy` / `+917010194778` | `02 Oct 2026` | `01:40 PM` | `Incoming` (GREEN) | `54s` |
| 4 | `Mythreyi Hr` / `Medivoy` / `+917010194778` | `02 Oct 2026` | `01:38 PM` | `Outgoing` (AMBER) | `43s` |
| 5 | `Vinoth` / `Developer` / `Buff` / `+917845860720` | `02 Oct 2026` | `12:35 PM` | `Outgoing` (AMBER) | `57s` |
| 6 | `Pugazharasan` / `Medivoy` / `+919486613245` | `02 Oct 2026` | `11:43 AM` | `Outgoing` (AMBER) | `15s` |
| 7 | `Sakthi Bro Nx` / `+916374949577` | `02 Oct 2026` | `11:43 AM` | `Outgoing` (AMBER) | `0s` |
| 8 | `Vinoth` / `Developer` / `Buff` / `+917845860720` | `02 Oct 2026` | `11:41 AM` | `Outgoing` (AMBER) | `1m 0s` |

- Colour rule: `Incoming` = green + green direction icon; `Outgoing` = amber/orange + orange direction icon.
- Contact block supports 1–3 stacked lines (name / business-or-tag / number) — e.g. `Medivoy` and `Buff`/`Developer` are secondary lines.
- Row 1's date + direction are obscured by the sticky tab bar → header tabs OVERLAY list content.

**Ad banners — SAME creative, appears TWICE (after row 2 and after row 7), injected between rows**
- Headline: `Get winning sales scripts, objection` / `handling tactics & pro tips — free!` (`Get winning` + `free!` in yellow/orange)
- CTA: `Claim your free scripts` (coral-red pill, bold white text)
- Art: gold trophy, confetti, celebratory figures; small phone-style logo at right reading **`Callio`** — **note: THIS instance spells it `Callio`, unlike WA0031/0033 which read `Caliper`**

**Absent**: no stat/metric cards, no Premium/lock ribbons, no dialogs/sheets/snackbars, no empty state, no FAB, no sort/filter button, no pagination, no bottom nav (Android gesture bar only).
**Premium gate**: none (the `free!` copy is the external ad, not a paywall).

---

## Cross-screen observations for the rebuild

**Premium / paid gates (complete list)**
1. **WA0034** — paywall, **Premium Plus** selected, `1 Month` `₹125`, Subscribe + `7 days free trial for new subscribers only` + `Already have an account? Sign In` + cancel-via-Play-Store notice. No bottom nav.
2. **WA0036** — paywall, **Premium** selected, `1 Month` `₹75`, Subscribe + trial line. Bottom nav present.
- Shared: 3 tiers `Premium` / `Premium Plus` / `Callio Biz`; both show only a single `1 Month` plan card; both show the trial line; **neither screenshot shows any lock/crown ribbon on any individual feature** — gating is expressed only by tier selection.
- Tier → icon mapping (consistent across both): `Premium`=star, `Premium Plus`=medal/ribbon, `Callio Biz`=trophy. In each screenshot the SELECTED tier's icon is gold and the other two are grey.
- Premium Plus feature set (WA0034) vs Premium feature set (WA0036) are DIFFERENT lists — tier switch must swap the bullet list.

**Recurring ad creative (appears on WA0031 once, WA0033 twice, WA0037 twice — 5 impressions across 3 screens)** — reproduce as one reusable banner:
- `Get winning sales scripts, objection handling tactics & pro tips — free!`
- Button `Claim your free scripts` (coral/red)
- Logo text reads **`Caliper`** on WA0031/WA0033 but **`Callio`** on WA0037 — inconsistent in the reference app
- Injects INTO scrollable lists at row boundaries (WA0033 after record 2 + pinned bottom; WA0037 after row 2 and row 7), not only pinned. WA0031 has it pinned at the bottom only.

**Screens appearing more than once**: none of the 10 are duplicates of each other; WA0031/0033/0036 share the ad banner, and WA0034/0036 are the two paywall variants.

**Unimplemented / placeholder-looking values (present in reference app)**
- WA0031 quick-action copy truncated mid-sentence at the fold: `...manage calls more efficiently — all`
- WA0033 `Duration` value uses lowercase month `27 Jul - 02 oct`
- WA0033 ad banner logo misspells brand as `Caliper`
- WA0035 heading grammar: `Choose one of the option...` (singular)
- WA0030 `Kona Manda Frd` renders the SAME call twice as rows `1` and `2` (duplicate-row defect in reference)
- WA0030 leftmost category tab renders as truncated `jected` (clipped by scroll position, not a real label)
- Plan radio squares on both paywalls show NO checkmark despite a plan being offered

**Navigation summary**
- Bottom nav bar (5 tabs: Call History, Analytics, Premium, Contacts, More) — observed ONLY on WA0036.
- Every other screen: no bottom nav, header back arrow only, Android gesture pill at bottom.
- Contact detail uses in-page tabs `Summary` / `Analysis` / `Call History`.
- Call category list uses horizontally scrollable tabs ending in `Not Pickup by Client`.
- Dialpad is an overlay drawer, not a screen.