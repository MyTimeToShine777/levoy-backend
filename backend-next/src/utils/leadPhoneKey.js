'use strict';

// The number a lead is matched on when linking it to calls (call_events.phone_key is the last 10 digits of the call's number).
//
// leads.phone_clean is the "clean" number a spreadsheet import fills in, but a lead typed in by hand, or created through the app or
// the API, may not have it. Matching on phone_clean alone made those leads invisible: their calls showed as "Unknown" and their
// recordings and contact pages had no lead. So use phone_clean when it is there, and otherwise the last 10 digits of the lead's phone.
function leadPhoneKeySql(alias = 'l') {
  return `COALESCE(NULLIF(${alias}.phone_clean, ''), right(regexp_replace(COALESCE(${alias}.phone, ''), '\\D', '', 'g'), 10))`;
}

module.exports = { leadPhoneKeySql };
