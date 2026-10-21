# Competitor parity — what is built, what is not

Reference: the 50 screenshots in `reference-screenshots/` (`IMG-20261002-WA0009` … `WA0058`) of the Callio Android app.
All 50 were read. This file replaces the old `ANDROID_GAP.md`.

How it is checked, so the statuses are not just claims:

| Layer | Check | Result |
|---|---|---|
| Backend | `npm test` (54), `scripts/characterize.js` incl. step `93-call-insights.js` (58 assertions), `eslint` | pass / pass / 0 errors |
| Chrome extension | `node --test test/shared.test.mjs` (4) + a live run of its own `shared.js` against the API (402 on Free → linked phone → dial → phone receives the number) | pass |
| Web dashboard | `tsc --noEmit`, `next build`, browser pass of Call History, Call Analytics, Premium | pass. `eslint` reports 10 "setState in an effect" errors in the new pages — the same rule the older pages already trip (177 before this work); not fixed. |
| Android app | `gradle assembleDebug` (APK builds), `testDebugUnitTest` (6 logic tests + 38 screen renders) | pass |
| Android UI | every screen rendered at the reference size (738×1600) by Paparazzi and compared by eye; images in `android/app/src/test/snapshots/images/` | see table |

> **Not verified:** the app has **never been run on a phone or emulator** (none is available here). Layout and logic are
> verified; everything that needs real hardware is written but unexercised: reading the call log, mapping calls to SIM 1/2,
> permission dialogs, the dialler role and call screen, the Quick Call service, the in-call bubble, post-call prompts, the
> WhatsApp notification listener, and Android Auto Backup. **The default-phone-app code replaces the system dialler when switched
> on — try it on a spare phone first.**

## Screens

| Screenshot | Screen | Status |
|---|---|---|
| 0009 | Time Format | BUILT |
| 0010 | Language (English, Russian, Spanish, German, French, Turkish) | BUILT — navigation, tabs, tiles, Settings, Premium, filter, onboarding and Compare are translated; the long help / explanation texts and error messages stay English |
| 0011 | Set Default Screen | BUILT |
| 0012, 0029, 0035, 0027, 0046, 0048 | SIM Number: list, Connect SIM, verify options, call-log picker, "skip", "call now" | BUILT, untested on device. Tapping a SIM with no number asks for it first. *Via Call Log* and *Via Call* check that the chosen / placed call really used that SIM (read from the call log) before marking it verified. |
| 0013, 0025 | More menu (logo, social icons, Export, Blogs, Quick Call, Reminder, Troubleshooting, Compare, Settings, Help, Invite, Rate, About, Privacy) | BUILT. The five social icons and the Blogs link are filled in by the workspace admin (dashboard → Premium → Support & links); an empty link is hidden. The icons are simple drawings, not the brands' logos. *Rate App* opens the Play Store listing, which does not exist yet. |
| 0014, 0032 | Settings (all 13 rows) | BUILT. *Missing Call Details* re-reads the last 90 days of the call log and fills in blank names / SIMs on the server. *Set / Remove as Default Dialer* requests the role / opens Android's default-apps page. |
| 0015, 0051 | Troubleshooting menu + Call Sync status | BUILT, untested on device. *Note Popup* and *Missed Call Reminder* open their own switches. |
| 0016, 0057, 0058 | Analytics | BUILT |
| 0017 | Contacts list | BUILT |
| 0019, 0043, 0045, 0033 | Contact detail: Summary, Analysis, Call History (note icon opens the note editor; ⋮ has Call / WhatsApp / Message / Copy / Compare) | BUILT |
| 0018, 0020, 0023, 0039 | History Filter incl. the tag picker and Premium Plus lock text | BUILT |
| 0021 | Write a reminder after a missed call | **DIFFERENT** — a notification with an inline reply box (needs no overlay permission) instead of the floating overlay; also a Reminders screen. Untested on device. |
| 0022, 0050 | "Set default phone app" | BUILT, untested on device — runs after the privacy screen; *Yes, I agree* asks Android for the dialler role. When held, Callio's call screen handles incoming and outgoing calls (answer, decline, end, mute, speaker, hold, keypad). **Experimental.** |
| 0024 | Compare | BUILT |
| 0026 | Privacy | BUILT |
| 0028, 0030, 0037, 0042, 0044, 0047, 0049, 0052, 0053 | Call History tabs, dial pad, Export Calls Report | BUILT |
| 0031 | Quick Action + in-call bubble | BUILT, untested on device. The bubble now also gets the number of **outgoing** calls (asks for `PROCESS_OUTGOING_CALLS`). Remembers the switch while you grant "display over other apps". |
| 0040 | WhatsApp Call | BUILT, untested on device — reads WhatsApp's notifications; English wording only; needs the number in contacts |
| 0041 | Delete Account | **DIFFERENT** — really deletes the account on the server (password; refused for the only admin or someone who owns leads) |
| 0034, 0036, 0038, 0054 | Premium tabs, features, price, Subscribe, trial | **DIFFERENT — Stripe, not Play Billing.** Subscribe starts the one-time 7-day trial; after that it opens Stripe Checkout in the browser (1 month, admin only) and the app re-reads the plan when you come back (`levoy://premium`). Stripe is in **test mode**; the checkout page carries the Stripe account's name (Medivoy). An admin can still switch a plan on without payment. |
| 0055, 0056 | Call-log and Contacts permission primers | BUILT (illustrations drawn in code, simplified) |

## Premium features

| Feature | Plan | Status |
|---|---|---|
| Ad-free | Premium | There are **no third-party ads**. The Free plan shows a small "Try Premium" strip (dismissable); Premium removes it. The competitor's ad banners were not copied. |
| Backup of call history | Premium | BUILT — daily copy saved on the phone and carried to **Google Drive by Android Auto Backup** (only that file; never the sign-in token), restored from *Settings → Restore*. Also a JSON backup / restore through the share sheet. Untested on device. |
| Quick support on WhatsApp | Premium | BUILT — *Help & Support* shows a "Chat with support" button using the number the admin entered |
| Quick Call (browser → phone) | Premium | BUILT — `chrome-extension/` (click any `tel:` link, or right-click a selected number), the dashboard's *Dial on my phone* button, a phone service that waits for numbers and dials them, and API `/api/quick-call/*`. |
| Note + tags after a call; filters | Premium Plus | BUILT, plus the post-call notification with a note box |
| Exclude saved contacts from an export | Premium Plus | BUILT |
| Unique / connected calls | Premium Plus | BUILT |
| Billing cycle, price of each call | Premium Plus | BUILT |
| Contact report in Excel | Premium Plus | BUILT |
| Contact groups, filter / export by group | Premium Plus | BUILT |
| Working hours, ideal time, timeline sheet | Premium Plus | BUILT |
| Per-telecaller analytics, leaderboard | Callio Biz | BUILT |

## Still not done

1. **Payment.** Stripe Checkout works end to end in test mode (a test-card payment switched Premium on, and reloading the success page did not grant it twice). Still open: live keys, a Stripe webhook endpoint + secret for this API, the account name shown on the Stripe page, and Play Billing if the app is published on Google Play (Play requires it for in-app digital purchases).
2. Everything under "Not verified" above, on real hardware.
3. Translations of long help texts and error messages.
4. The ten `eslint` "setState in an effect" errors in the new web pages.
5. HTTPS: the app allows plain HTTP for development. `READ_CALL_LOG` and the dialler role are Play-restricted and need Google's declaration forms for a public release.
