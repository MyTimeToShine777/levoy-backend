// What the user's real operations workbook taught us (see spec §6.16–§6.22): duplicates are kept and
// flagged (and a re-import never grows the book), a phone-only row is a lead, phones clean the
// sheet's way, and the engine's tiers / urgency bonus match the sheet. Skipped by --only-legacy.

module.exports = async ({ call, expect }) => {
  const file = (name, content) => ({ file: { name, content, type: 'text/csv' } });
  const head = 'Segment,Tellecaller Name,Customer Name,Pharmacy Name,Locality / Area,Phone Number,Call Status,Followup Date,Call Done\n';
  const rowsKeep = [
    'Cold Call,,Ann,Alpha Pharmacy,Adyar,096770 55001,Interested,,TRUE',        // trunk-0 phone
    'Cold Call,,Ben,Beta Pharmacy,Adyar,096770 55001,Not Answered,,TRUE',       // same phone again -> Duplicate
    'Cold Call,,,,Adyar,096770 55002,,,FALSE',                                   // phone only, no name
    'Cold Call,,Cy,Cee Pharmacy,Adyar,5123456789,,,FALSE',                       // 10 digits, not a mobile prefix
  ].join('\n');
  const csv = head + rowsKeep + '\n';

  // 1. keep both, flag the later one
  const c1 = await call('sheet-keep-1', 'POST', '/api/leads/import/commit', { form: { fields: { duplicates: 'keep' }, ...file('sheet.csv', csv) } });
  expect(c1.status === 200, 'commit (keep) succeeds');
  expect(c1.data.inserted === 4 && c1.data.skipped === 0, `all four rows become leads, none skipped (inserted ${c1.data.inserted}, skipped ${c1.data.skipped})`);
  expect(c1.data.duplicates_flagged === 1, `the repeated phone is flagged once (got ${c1.data.duplicates_flagged})`);

  // 2. re-importing the same file adds nothing
  const c2 = await call('sheet-keep-2', 'POST', '/api/leads/import/commit', { form: { fields: { duplicates: 'keep' }, ...file('sheet.csv', csv) } });
  expect(c2.data.inserted === 0 && c2.data.updated === 4, `re-import updates, never grows the book (inserted ${c2.data.inserted}, updated ${c2.data.updated})`);

  // 3. what the rows turned into
  const list = await call('sheet-keep-list', 'GET', '/api/leads?search=096770&limit=50');
  const byName = n => (list.data || []).find(l => l.name === n);
  const ann = byName('Ann'), ben = byName('Ben');
  expect(ann && ben && ann.id !== ben.id, 'both rows are separate leads');
  expect(ann && ann.is_duplicate === false && ben && ben.is_duplicate === true, 'only the later one is flagged Duplicate');
  expect(ben && ben.next_best_action === 'Duplicate – skip', `a duplicate’s action is "Duplicate – skip" (got ${ben && ben.next_best_action})`);
  expect(ann && ann.tier === 'Hot' && ann.priority_score === 80, `Interested scores 80 = Hot (got ${ann && ann.priority_score} ${ann && ann.tier})`);
  expect(ben && ben.tier === 'Cool' && ben.priority_score === 25, `Not Answered scores 25 = Cool, not Closed (got ${ben && ben.priority_score} ${ben && ben.tier})`);
  const phoneOnly = (list.data || []).find(l => /^Lead /.test(l.name) || l.locality === 'Adyar' && !l.customer_name && !l.pharmacy_name);
  expect(phoneOnly, 'a row with a phone but no name is imported');
  expect(phoneOnly && phoneOnly.tier === 'Cool' && phoneOnly.priority_score === 10, `an uncalled lead is Cool, score 10 (got ${phoneOnly && phoneOnly.priority_score} ${phoneOnly && phoneOnly.tier})`);

  // 4. merge mode (the old behaviour) still merges a repeated phone into one lead
  const csvMerge = head + ['Cold Call,,Dee,Delta Pharmacy,Adyar,096770 55009,Interested,,TRUE', 'Cold Call,,Dee2,Delta Pharmacy,Adyar,096770 55009,Demo Done,,TRUE'].join('\n') + '\n';
  const m1 = await call('sheet-merge', 'POST', '/api/leads/import/commit', { form: { fields: { duplicates: 'merge' }, ...file('merge.csv', csvMerge) } });
  expect(m1.data.inserted === 1 && m1.data.updated === 1, `merge mode folds the repeat into one lead (inserted ${m1.data.inserted}, updated ${m1.data.updated})`);

  // 5. the urgency bonus applies to a follow-up that is due today, not only overdue
  const today = new Date().toISOString().slice(0, 10);
  const csvDue = head + `Cold Call,,Eve,Echo Pharmacy,Adyar,096770 55010,Call Back Later,${today},TRUE\n`;
  const d1 = await call('sheet-due-today', 'POST', '/api/leads/import/commit', { form: { fields: { duplicates: 'keep' }, ...file('due.csv', csvDue) } });
  expect(d1.data.inserted === 1, 'due-today row imported');
  const due = await call('sheet-due-list', 'GET', '/api/leads?search=Eve&limit=5');
  const eve = (due.data || []).find(l => l.name === 'Eve');
  expect(eve && eve.followup_window === 'Due Today' && eve.priority_score === 70, `Call Back Later (40) due today gets +30 = 70 (got ${eve && eve.priority_score}, ${eve && eve.followup_window})`);
  expect(eve && eve.tier === 'Warm', `70 is Warm (got ${eve && eve.tier})`);
};
