'use strict';

// A phone number reduced to its last 10 digits, so "+91 98408 48003", "098408 48003" and "9840848003" are the same number.
// Fewer than 7 digits is not a usable number (short codes, hidden numbers), so it has no key.
function phoneKey(number) {
  const digits = String(number == null ? '' : number).replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
}

// Splits uploaded call events into those to one of the given lead numbers (kept) and the rest (ignored).
// `keys` is a Set of phoneKey()s.
function splitByLeadNumbers(events, keys) {
  const kept = [];
  let ignored = 0;
  for (const e of events) {
    const k = phoneKey(e && e.phone_number);
    if (k && keys.has(k)) kept.push(e); else ignored++;
  }
  return { kept, ignored };
}

module.exports = { phoneKey, splitByLeadNumbers };
