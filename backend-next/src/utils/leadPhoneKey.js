'use strict';

// The number a lead is matched on when linking it to calls (call_events.phone_key is the last 10 digits of the call's number).
//
// leads.phone_clean is the "clean" number a spreadsheet import fills in, but a lead typed in by hand, or created through the app or
// the API, may not have it. Matching on phone_clean alone made those leads invisible: their calls showed as "Unknown" and their
// recordings and contact pages had no lead.
//
// phone_clean can also be wrong: an import took the SECOND number out of a cell like "9715715393. +918098090500", so the lead
// was linked to a number nobody called and the real calls showed as "Unknown". The lead's own phone is the number the telecaller
// dials and the one the server uses to accept a call, so use it whenever it has 10 digits. Only a phone too short to match
// (which an import may have repaired into phone_clean) falls back to phone_clean.
function leadPhoneKeySql(alias = 'l') {
  const phoneKey = `right(regexp_replace(COALESCE(${alias}.phone, ''), '\\D', '', 'g'), 10)`;
  return `CASE WHEN length(${phoneKey}) = 10 THEN ${phoneKey} ELSE COALESCE(NULLIF(${alias}.phone_clean, ''), ${phoneKey}) END`;
}

module.exports = { leadPhoneKeySql };
