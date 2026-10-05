# Lead management spec — extracted from the user's live Google Sheet

Source: the user's real operations spreadsheet, 3,127 leads × 27 columns, 7 tabs.
This file is the specification the backend and frontend agents are building against.
It was read directly from the sheet, not inferred.

## Tabs

| Tab | Shape | Purpose |
|---|---|---|
| **Leads (1)** | 3,127r × 27c | The master lead list. Import columns + derived columns. |
| **Prospects** | 1,000r × 10c | Raw prospect list, lighter schema |
| **Call Queue** | 57r × 13c | Ranked per-telecaller worklist with Call / WhatsApp actions |
| **Command Center** | 77r × 13c | Live KPIs, sales funnel, call-status mix, weighted pipeline |
| **Daily Report (1)** | 64r × 8c | Today's snapshot, segment bifurcation, status×segment matrix |
| **Area Analysis** | 127r × 9c | Per-locality performance and coverage |
| **Settings** | 31r × 8c | The scoring rules and assumptions (blue = editable) |

## Leads schema — 15 imported, 12 derived

**Imported (1–15):** Segment · Lead Assigned Date · Call Attempted Date ·
Tellecaller Name · Customer Name · Pharmacy Name · Locality / Area · Address ·
Phone Number · Email Id · Lead Source · Followup Date · Call Done · Call Status · Remarks

**Derived (16–27) — the app computes these, never imports them:**
Phone (Clean 10-digit) · Duplicate? · Follow-up (Clean Date) · Active Lead? (1/0) ·
Follow-up Window · Days Since Last Call · Priority Score · Tier · Next Best Action ·
Data Check · Queue Key · Queue Rank

## The scoring engine

Read from the Settings tab. These are configurable values, not application constants.

| Call Status | Base Priority | Active Pipeline | Win Prob | Next Action | Reached | Interested+ | Demo+ |
|---|---|---|---|---|---|---|---|
| Not Answered | 25 | 1 | 0.03 | Retry call at a different time of day | 0 | 0 | 0 |
| Under Consideration | 60 | 1 | 0.15 | Follow up on WhatsApp and confirm a demo slot | 1 | 0 | 0 |
| Interested | 80 | 1 | 0.30 | Book the demo | 1 | 1 | 0 |
| Not Interested | 0 | 0 | 0 | Closed – no action | 1 | 0 | 0 |
| Call Back Later | 40 | 1 | 0.08 | Call back at the promised time | 1 | 0 | 0 |
| Demo Done | 90 | 1 | 0.50 | Close the deal – share payment link / onboard | 1 | 1 | 1 |
| Converted | 100 | 0 | 1.00 | Won – support & onboarding | 1 | 1 | 1 |
| Switched Off / Invalid Number | 0 | 0 | 0 | Verify the number or drop the lead | 0 | 0 | 0 |
| (Not called yet) | 10 | 1 | 0.01 | Make the first call | 0 | 0 | 0 |

**Assumptions:** plan price per conversion ₹499 · daily call target per telecaller 60
(the sheet uses 180 for the whole team) · **Hot ≥ 80** · **Warm ≥ 50** ·
**follow-up urgency bonus +30**.

**Tier** (read from the live sheet, 1,556 computed rows): a live lead is **Hot** at ≥ 80, **Warm** at ≥ 50, otherwise **Cool** (a lead nobody has called yet is Cool, score 10); a lead out of the pipeline is **Closed**, or **Won** when its win probability is 100%.

**Urgency bonus (+30)** applies when the follow-up is **overdue or due today**. A **duplicate** lead keeps its score but its Next Best Action becomes "Duplicate – skip". Follow-up windows: Overdue · Due Today · This Week · Later (the app calls the last one "Upcoming").
Observed real scores include 60, 90 and **110** — the 110 is above every base
priority, which is what the +30 follow-up urgency bonus does to an Interested
(base 80) lead whose follow-up is overdue.

**Follow-up Window values observed:** `This Week`, `Due Today`. By implication also
`Overdue`, `Upcoming`, `Closed`.

## The maths that has to be right

**Funnel** (`% of previous` and `% of total` at every stage):

```
Total leads      → Called → Reached a person → Interested or better
                  → Demo done or better → Converted
```

Verified against the user's own numbers:
1,555 total · 758 called (48.7% of total) · 475 reached (63% of called,
30.5% of total) · 23 interested (4.8% of reached) · 6 demo (26% of interested)
· 2 converted (33% of demo, 0.13% of total).

**Weighted pipeline** = Σ(active-pipeline leads × win probability × ₹499).
User's figure: ₹16,352.23 from 802 queue items.

## Phone hygiene and duplicates

The sheet keeps `Phone (Clean 10-digit)` alongside the raw number, and reports
**1,539 valid phones / 250 duplicates** out of 1,618 rows. So:

- strip non-digits, drop a leading `91` when the result is exactly 10 digits
- flag unfixable numbers rather than silently dropping the row
- detect duplicates on **cleaned phone** AND on **normalized pharmacy + locality**
- keep the row, flag it — their sheet shows `Duplicate?` as a column, so duplicates
  are visible rather than removed

## Segments (their real distribution)

Cold Call 1,375 · Social Media Campaign 226 · WhatsApp Campaign 17 — total 1,618
(with 1,555 passing phone validation).

## Assignment semantics that differ from a generic CRM

`Tellecaller Name` is a column in the Leads sheet, so **assignment is per-segment**:
each segment routes to its own telecallers, and the Call Queue is filtered by
telecaller. Unmatched telecaller names must land in an UNASSIGNED bucket and be
listed — never silently handed to a random agent.

## Why this spec exists

This app is replacing a spreadsheet the user actually runs their business on. The
sheet is the operational truth, so it — not the generic CRM feature list — defines
what "done" means for lead management. Where the two conflict, the sheet wins.