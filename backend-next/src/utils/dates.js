'use strict';

const XLSX = require('xlsx');

const MS_PER_DAY = 86400000;

function utcMidnight(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function mkDate(y, mo, d) {
  if (!(y >= 1900 && y <= 2200) || !(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // Rejects 31 Feb and friends, which Date.UTC would happily roll over.
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

// Parse whatever the sheet put in a date cell into a UTC-midnight Date.
// Accepts real Dates (xlsx with cellDates), Excel serial numbers, ISO dates,
// and dd/mm/yyyy. dd/mm is the primary reading because that is the format the
// source spreadsheet uses.
function parseLeadDate(v, order = 'dmy') {
  if (v === null || v === undefined || v === '') return null;

  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return utcMidnight(v);
  }

  if (typeof v === 'number' && isFinite(v)) {
    // Excel serial day. 20000 ≈ 1954, 60000 ≈ 2064 — anything outside is not a
    // date, and treating it as one would invent a follow-up 200 years out.
    if (v > 20000 && v < 60000) {
      const p = XLSX.SSF.parse_date_code(v);
      if (p && p.y) return new Date(Date.UTC(p.y, p.m - 1, p.d));
    }
    return null;
  }

  const s = String(v).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return mkDate(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const a = +m[1], b = +m[2];
    let y = +m[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    return order === 'mdy' ? mkDate(y, a, b) : mkDate(y, b, a);   // dd/mm/yyyy by default
  }

  // Free text such as "06-Oct-2026". Date.parse reads it as LOCAL midnight, so the calendar
  // day must be taken from the LOCAL getters — the UTC ones are a day early east of Greenwich.
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return mkDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

function toDateStr(dt) {
  return dt ? new Date(dt.getTime()).toISOString().slice(0, 10) : null;
}

// ISO yyyy-mm-dd for a DATE column, or null when the cell is blank/unparseable.
// Imports use this instead of handing the raw cell text to Postgres, which would
// reject dd/mm/yyyy with a day above 12 (and abort the transaction).
function toIsoDate(v) {
  return toDateStr(parseLeadDate(v));
}

// Slash dates are ambiguous: 10/6/2026 is 10 June in India and 6 October in the US. The
// operations sheet is month-first (its own clean column turns 10/6/2026 into 06-Oct-2026,
// and the Prospects tab holds 09/28/2026), but Indian CSV exports are usually day-first.
// A file settles it itself when ANY value has a part above 12; otherwise the operator
// chooses (default day-first).
const SLASH = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/;

function detectDateOrder(values) {
  let dmy = 0, mdy = 0, ambiguous = 0, example = null;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const m = v.trim().match(SLASH);
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
    else if (a <= 12 && b <= 12 && a !== b) { ambiguous++; if (!example) example = v.trim().slice(0, 24); }
  }
  const order = dmy && !mdy ? 'dmy' : mdy && !dmy ? 'mdy' : null;
  return { order, decisive: { dmy, mdy }, ambiguous, example };
}

// Rewrites a slash date as ISO using the chosen order, so everything downstream
// (scoring, DATE columns) sees one unambiguous format. Anything else is left alone.
function normaliseDateCell(v, order) {
  if (typeof v !== 'string' || !SLASH.test(v.trim())) return v;
  const iso = toDateStr(parseLeadDate(v, order));
  return iso || v;
}

module.exports = { MS_PER_DAY, utcMidnight, mkDate, parseLeadDate, toDateStr, toIsoDate, detectDateOrder, normaliseDateCell };
