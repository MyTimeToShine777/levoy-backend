# Levoy Android — reference design tokens

Extracted from 50 reference screenshots (`/root/drive-shots/IMG-20261002-WA00xx.jpg`,
738x1600 each) of the real Levoy Android app.

## Palette (sampled, not guessed)

Sampled by quantising pixels across 25 screens and taking the most frequent buckets.

| Role | Hex | Notes |
|---|---|---|
| App background | `#101010` | Dominant by a wide margin (316k samples) |
| Surface / card | `#1F1F1F` | Elevated panels; the `#202030` bucket is the same at ~B+8 |
| Surface variant | `#2A2A2A` | Inputs, chips, dividers region |
| Divider / outline | `#3A3A3A` | Hairlines between list rows |
| Text primary | `#F2F2F2` | Titles, values |
| Text secondary | `#A0A0A0` | Labels, subtitles, timestamps |
| Text tertiary | `#707070` | Disabled, hints |
| **Accent / selection** | `#F0B000` | Amber. Used for the selected radio checkmark, active tab, primary CTA |
| Danger | `#E5484D` | Hang-up button, destructive |

The app is **dark-first**. There is no light theme in the reference.

## Typography

System sans (Roboto). Hierarchy observed:
- Screen title in the app bar: ~20sp, bold, `#F2F2F2`
- Section / card heading: ~15–16sp, semibold
- List row primary: ~15sp
- List row secondary / timestamp: ~12–13sp, `#A0A0A0`
- Stat value: ~24–28sp, bold, tabular
- Section eyebrow (e.g. "DEMO LOGINS"): ~11sp, bold, letterspaced, uppercase

## Layout conventions

- **App bar**: back arrow left, screen title, optional action icon right. Height ~56dp.
  Background matches the surface colour, not a saturated brand bar.
- **Content**: 16dp horizontal padding, cards are `16dp` radius, separated by
  `12dp` vertical gaps.
- **Lists**: full-bleed rows with hairline dividers, 56–72dp tall, trailing
  chevron or trailing text.
- **Selection**: amber filled circle with a black checkmark, trailing.
- **Toggle**: standard Material switch, right-aligned in a setting row.
- **Settings rows**: icon + title + description, with a control (switch /
  chevron) trailing.
- **Empty state**: illustrative icon + title + supporting line, centred,
  generous negative space below. Never a bare "0" with no explanation.
- **Buttons**: full-width rounded-rect (`12dp` radius), amber fill with dark
  text for primary; outlined for secondary.

## Feature inventory observed in the reference

Beyond the current app's Dashboard / Calls / Leads / Reports / Team / Login:

**Settings & onboarding**
- Time Format (12 hr / 24 hr) — amber radio check
- SIM Number verification — three option cards (Verify via Call Log / Verify via
  Call / Skip), the skip path explicitly labelled "(Not Recommended)"
- Quick Action — in-call overlay with Save Contact + View Details, toggle
- Dark theme throughout

**Filtering (Call History)**
- Source / app selector (e.g. "WhatsApp Call")
- Duration range with presets (All Time) and a custom from/to date range
- Contact Type: All / Saved / Unsaved
- Notes filter
- Tags selector
- Reset + Done actions

These map onto backend capabilities that already exist or are easy to add:
`?direction=`, `?status=`, `?phone=`, `?date_from=`, `?date_to=`, `?pinned=`
on `GET /api/calls`, plus `GET /api/tags`, `GET /api/pipeline/stages`,
`GET /api/whatsapp-templates`, and lead assignment/follow-ups.

## What the current app is missing versus this list

| Feature | Backend ready? | App has it? |
|---|---|---|
| Time format preference | n/a (local) | No |
| SIM verification flow | No | No |
| Quick Action in-call overlay | No | No |
| Source/app filter | Partial (`whatsapp_templates` only) | No |
| Date-range filter | Yes (`date_from`/`date_to`) | No |
| Contact type filter | No | No |
| Tags filter | Yes (`GET /api/tags`) | No |
| Notes filter | Yes (`notes` on calls) | No |
| Pull-to-refresh | n/a | No |
| Swipe row actions | n/a | No |
| Dark theme | n/a | No — app is light with a red header |
