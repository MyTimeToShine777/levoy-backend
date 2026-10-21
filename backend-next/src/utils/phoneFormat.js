'use strict';

// Turns what a person typed into one canonical number, "+<country code><number>", so the same person is never stored two
// ways ("7845860720" and "+917845860720"). The workspace's default country supplies the code when none was typed.
//
//   "+91 78458 60720"  → +917845860720   (a "+" means the code is already there)
//   "0091 78458 60720" → +917845860720   ("00" is the international prefix)
//   "917845860720"     → +917845860720   (longer than a national number and starts with the code)
//   "078458 60720"     → +917845860720   (the national trunk "0" is dropped)
//   "7845860720"       → +917845860720   (just the number: the default country is added)
//
// Returns null when it cannot be a phone number (too few or too many digits).

const MIN_DIGITS = 7;            // shortest number worth keeping (same floor as phoneKey)
const MAX_DIGITS = 15;           // E.164 limit
const NATIONAL_MAX = 10;         // a number with more digits than this, starting with the code, already carries it

function normalizeCountryCode(code, fallback = '91') {
  const d = String(code == null ? '' : code).replace(/\D/g, '');
  return d.length >= 1 && d.length <= 4 && d[0] !== '0' ? d : fallback;
}

function toE164(raw, defaultCountryCode = '91') {
  if (raw === null || raw === undefined) return null;
  const text = typeof raw === 'number' ? String(Math.round(raw)) : String(raw).trim();
  if (!text) return null;
  const cc = normalizeCountryCode(defaultCountryCode);
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;

  let international = text.startsWith('+');
  if (!international && digits.startsWith('00')) { digits = digits.slice(2); international = true; }

  if (!international) {
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');                       // national trunk prefix
    if (digits.length < MIN_DIGITS) return null;           // judge what was typed, not what we add to it
    if (digits.length > NATIONAL_MAX && digits.startsWith(cc)) international = true;       // "917845860720"
    else digits = cc + digits;
  }
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return '+' + digits;
}

module.exports = { toE164, normalizeCountryCode };
