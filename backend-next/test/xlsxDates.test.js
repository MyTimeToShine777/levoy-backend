'use strict';

// Excel date cells must come out as the calendar day the sheet SHOWS — in every timezone.
// (SheetJS returns them ~10 seconds before local midnight of the previous day; a naive
// reader is a day early, which silently shifts every follow-up and "days since last call".)

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { readImportFile, cellToString } = require('../src/utils/tabularFile');

function workbookWithDates(serials) {
  // Real Excel date cells: numeric serials with a date number format.
  const ws = XLSX.utils.aoa_to_sheet([['Name', 'Followup Date']]);
  serials.forEach((s, i) => {
    ws[`A${i + 2}`] = { t: 's', v: `row${i}` };
    ws[`B${i + 2}`] = { t: 'n', v: s, z: 'dd-mmm-yyyy' };
  });
  ws['!ref'] = `A1:B${serials.length + 1}`;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('xlsx date cells read as the day the sheet shows', () => {
  // 46301 = 06-Oct-2026, 46296 = 01-Oct-2026, 46022 = 31-Dec-2025, 46023 = 01-Jan-2026
  const buf = workbookWithDates([46301, 46296, 46022, 46023]);
  const { matrix } = readImportFile(buf, 'x.xlsx', 'Leads');
  assert.deepEqual(matrix.slice(1).map(r => r[1]), ['2026-10-06', '2026-10-01', '2025-12-31', '2026-01-01']);
});

test('cellToString turns a drifted Date into the intended calendar day', () => {
  const drifted = new Date(2026, 9, 5, 23, 59, 50);        // local 05-Oct 23:59:50  == cell 06-Oct
  assert.equal(cellToString(drifted), '2026-10-06');
  const exact = new Date(2026, 9, 6, 0, 0, 0);              // a clean local midnight stays put
  assert.equal(cellToString(exact), '2026-10-06');
});
