'use strict';

// Dev tool: runs every row of an operations workbook through the app's lead engine and
// compares the result with the workbook's OWN derived columns (Priority Score, Tier,
// Active Lead?, Follow-up Window, Days Since Last Call, Next Best Action, Follow-up date).
//
//   node --env-file=.env.test scripts/sheet-parity.js <file.xlsx> [today=YYYY-MM-DD] [sheet]
//
// `today` must be the day the sheet was last recalculated (its Daily Report says "as of …").
// Prints counts and a few anonymised mismatches (row number + values, never names/phones).

const fs = require('fs');
const T = require('../src/utils/tabularFile');
const Scoring = require('../src/services/LeadScoringService');
const { detectDateOrder, normaliseDateCell, toDateStr, parseLeadDate } = require('../src/utils/dates');

const file = process.argv[2];
const todayArg = process.argv[3] || '2026-10-03';
const sheet = process.argv[4] || 'Leads (1)';
if (!file) { console.error('usage: node --env-file=.env.test scripts/sheet-parity.js <file.xlsx> [today] [sheet]'); process.exit(1); }


(async () => {
  const rows = T.readImportFile(fs.readFileSync(file), file, sheet).matrix;
  const head = rows[0].map(T.cellToString);
  const col = n => head.indexOf(n);
  const get = (r, n) => T.cellToString(r[col(n)]);

  const cfg = await Scoring.loadConfig();
  const [y, m, d] = todayArg.split('-').map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));

  const dateCols = ['Lead Assigned Date', 'Call Attempted Date', 'Followup Date'];
  const order = (detectDateOrder(rows.slice(1).flatMap(r => dateCols.map(c => get(r, c)))).order) || 'mdy';

  const fields = {
    score: (r, o) => [get(r, 'Priority Score'), String(o.priority_score)],
    tier: (r, o) => [get(r, 'Tier'), o.tier],
    active: (r, o) => [get(r, 'Active Lead? (1/0)'), o.is_active_lead ? '1' : '0'],
    window: (r, o) => [get(r, 'Follow-up Window') === 'Later' ? 'Upcoming' : get(r, 'Follow-up Window'), o.followup_window === 'Closed' ? '' : o.followup_window],
    daysSince: (r, o) => [get(r, 'Days Since Last Call'), o.days_since_last_call === null ? '' : String(o.days_since_last_call)],
    nextAction: (r, o) => [get(r, 'Next Best Action'), o.next_best_action],
    followupDate: (r, o) => [toDateStr(parseLeadDate(get(r, 'Follow-up (Clean Date)'))) || '', o.followup_clean || ''],
  };

  const stats = Object.fromEntries(Object.keys(fields).map(k => [k, { same: 0, diff: 0, samples: [] }]));
  let n = 0, notComputed = 0;
  rows.slice(1).forEach((r, i) => {
    if (!get(r, 'Segment') && !get(r, 'Phone Number')) return;
    if (get(r, 'Priority Score') === '' && get(r, 'Tier') === '') { notComputed++; return; }
    n++;
    const input = {
      call_status: get(r, 'Call Status') || null,
      phone_number: r[col('Phone Number')] ?? null,
      followup_date: normaliseDateCell(get(r, 'Followup Date') || null, order),
      call_attempted_date: normaliseDateCell(get(r, 'Call Attempted Date') || null, order),
      customer_name: get(r, 'Customer Name') || null,
      pharmacy_name: get(r, 'Pharmacy Name') || null,
    };
    input.is_duplicate = get(r, 'Duplicate?') === 'Duplicate';
    const out = Scoring.computeDerived(input, cfg, { today });
    for (const [k, fn] of Object.entries(fields)) {
      const [want, got] = fn(r, out);
      // The sheet leaves Next Best Action / window blank for rows it considers closed.
      if (String(want).trim() === String(got).trim()) stats[k].same++;
      else { stats[k].diff++; if (stats[k].samples.length < 4) stats[k].samples.push({ row: i + 2, status: input.call_status, sheet: want, app: got }); }
    }
  });

  console.log(`rows compared: ${n} (+${notComputed} the sheet never calculated)   today=${todayArg}   slash-date order=${order}`);
  for (const [k, v] of Object.entries(stats)) {
    console.log(`${k.padEnd(13)} match ${String(v.same).padStart(5)}  differ ${String(v.diff).padStart(4)}`);
    if (v.diff) console.log('   e.g.', JSON.stringify(v.samples));
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
