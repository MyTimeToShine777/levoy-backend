'use strict';

// ─── Phone hygiene ───
// Mirrors the operations sheet's "Phone (Clean 10-digit)" column, checked against its
// 1,786 real rows (scripts/sheet-phone-check.js):
//   • strip everything that is not a digit;
//   • keep the LAST 10 digits — this drops "+91", "91" and the trunk "0" (081482 40010),
//     and when a cell holds two numbers ("08925 46133/ 98840 83922") the last one wins;
//   • an Indian mobile starts with 6–9, so anything else is flagged, never guessed at.
// Excel numbers arrive as JS numbers (the file reader keeps raw values), so 919876543210
// works. A cell that was saved as scientific text ("9.19E+11") has already lost its digits
// and cannot be recovered — it is flagged.
function cleanPhone(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  let s;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    s = String(Math.round(raw));
  } else {
    s = String(raw).trim();
    if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(s)) return null;   // digits already lost
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const last10 = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(last10) ? last10 : null;
}

const digitsOf = v => String(v === null || v === undefined ? '' : v).replace(/\D/g, '');

// Last 9 digits, used to match "+919876543210" against "9876543210".
function last9(v) {
  const d = digitsOf(v);
  return d.length >= 9 ? d.slice(-9) : null;
}

module.exports = { cleanPhone, digitsOf, last9 };
