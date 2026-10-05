'use strict';

// CSV + Excel reading for lead uploads. Both formats are normalised into the same
// shape — an array of string arrays (header row first, blank rows dropped) — so
// everything downstream has one path.

const XLSX = require('xlsx');

// A cell is a string for header/cell purposes; Dates from the xlsx reader are
// rendered as plain YYYY-MM-DD so downstream parsing has one shape to handle.
function cellToString(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    // SheetJS hands back a date cell as LOCAL time ~10 seconds BEFORE midnight of the previous
    // day (cell 06-Oct reads as 05-Oct 23:59:50). Nudging by a minute lands on the right day, and
    // the calendar day is then read from the local parts, so it holds in every timezone.
    const d = new Date(v.getTime() + 60000);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return String(v).trim();
}

// Minimal RFC 4180 parser (no dependency): handles quoted fields, embedded
// commas/newlines and "" escapes. Returns an array of string arrays.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip UTF-8 BOM
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // Drop trailing blank lines but keep genuinely empty fields elsewhere.
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

// Magic bytes beat the extension: a workbook renamed to .csv must still be read
// as a workbook, and feeding a zip to the CSV parser yields one garbage column.
function detectImportFormat(buffer, originalname) {
  const m = String(originalname || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m ? m[1] : '';
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return 'xlsx';
  if (buffer.length >= 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf &&
      buffer[2] === 0x11 && buffer[3] === 0xe0) return 'xlsx';   // legacy OLE2 .xls
  if (['xlsx', 'xlsm', 'xlsb', 'xltx', 'xls', 'ods'].includes(ext)) return 'xlsx';
  return 'csv';
}

function matrixFromRows(rows) {
  const out = [];
  for (const r of rows) {
    const cells = (r || []).map(cellToString);
    if (cells.some(c => c !== '')) out.push(cells);
  }
  return out;
}

// Read a workbook sheet. `sheetName` picks a named sheet; omitting it reads the
// FIRST sheet, and every other sheet is reported but never imported.
function readWorkbook(buffer, sheetName) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets = wb.SheetNames.slice();
  if (!sheets.length) throw new Error('workbook has no sheets');

  const wanted = sheetName ? String(sheetName).trim() : sheets[0];
  if (sheetName && !sheets.includes(wanted)) {
    const err = new Error(`sheet '${wanted}' not found`);
    err.available_sheets = sheets;
    throw err;
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wanted], { header: 1, raw: true, defval: '', blankrows: false });
  return { sheets, used: wanted, matrix: matrixFromRows(rows) };
}

function readImportFile(buffer, originalname, sheetName) {
  const format = detectImportFormat(buffer, originalname);
  if (format === 'xlsx') {
    const wb = readWorkbook(buffer, sheetName);
    return { format, sheets: wb.sheets, sheet: wb.used, matrix: wb.matrix };
  }
  return { format, sheets: null, sheet: null, matrix: matrixFromRows(parseCsv(buffer.toString('utf8'))) };
}

// Header keys are normalised loosely, so "Tellecaller Name", "tellecaller_name"
// and "Tellecaller-Name" all land on the same field.
function headerKey(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Header names, with a positional fallback for a blank header cell. Preview and
// commit MUST agree on these strings: the mapping the operator edits names
// columns, so a name that differs between the two phases resolves to nothing.
function headerColumns(matrix) {
  return matrix[0].map((h, i) => cellToString(h) || `Column ${i + 1}`);
}

module.exports = {
  cellToString, parseCsv, detectImportFormat, matrixFromRows, readWorkbook,
  readImportFile, headerKey, headerColumns,
};
