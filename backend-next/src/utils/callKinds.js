'use strict';

// How the competitor-style call analytics classify a call, in one place so the list, the
// analytics tiles, the contact view and the exports always agree.
//
//   incoming   an incoming call that was answered
//   outgoing   any call the telecaller placed (answered or not)
//   missed     an incoming call nobody answered
//   rejected   an incoming call the telecaller declined
//   never_attended   a missed/rejected call that was never returned or spoken about afterwards
//   not_pickup       an outgoing call the client did not answer, and no later call connected
//
// `c` is the alias of call_events in the query.

const KIND_SQL = `CASE
  WHEN c.direction = 'outgoing' THEN 'outgoing'
  WHEN c.status = 'rejected' THEN 'rejected'
  WHEN c.status = 'missed' THEN 'missed'
  WHEN c.direction = 'incoming' THEN 'incoming'
  ELSE COALESCE(c.direction, 'outgoing')
END`;

// A later call to the same person (by this telecaller) that was placed by us or actually connected.
const NEVER_ATTENDED_SQL = `(${KIND_SQL} IN ('missed', 'rejected') AND NOT EXISTS (
  SELECT 1 FROM call_events o
   WHERE o.user_id = c.user_id AND o.phone_key = c.phone_key AND o.timestamp > c.timestamp
     AND (o.direction = 'outgoing' OR o.duration_seconds > 0)))`;

const NOT_PICKUP_SQL = `(c.direction = 'outgoing' AND COALESCE(c.duration_seconds, 0) = 0 AND NOT EXISTS (
  SELECT 1 FROM call_events o
   WHERE o.user_id = c.user_id AND o.phone_key = c.phone_key AND o.timestamp > c.timestamp
     AND o.duration_seconds > 0))`;

const CONNECTED_SQL = 'COALESCE(c.duration_seconds, 0) > 0';

const SAVED_CONTACT_SQL = "(c.caller_id IS NOT NULL AND btrim(c.caller_id) <> '')";

const TABS = ['all', 'incoming', 'outgoing', 'missed', 'rejected', 'never_attended', 'not_pickup'];

const TAB_WHERE = {
  all: 'TRUE',
  incoming: `(${KIND_SQL}) = 'incoming'`,
  outgoing: `(${KIND_SQL}) = 'outgoing'`,
  missed: `(${KIND_SQL}) = 'missed'`,
  rejected: `(${KIND_SQL}) = 'rejected'`,
  never_attended: NEVER_ATTENDED_SQL,
  not_pickup: NOT_PICKUP_SQL,
};

// Timestamps are stored as UTC wall-clock in a timestamp-without-time-zone column; node-postgres
// would parse that as LOCAL time. Selecting text with an explicit Z keeps the instant exact.
const TS_ISO_SQL = `to_char(c.timestamp, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

// The last 10 digits identify a person across "+91 98765 43210", "09876543210" and "9876543210".
function phoneKeyOf(raw) {
  const d = String(raw === null || raw === undefined ? '' : raw).replace(/\D/g, '');
  return d.slice(-10);
}

module.exports = { KIND_SQL, NEVER_ATTENDED_SQL, NOT_PICKUP_SQL, CONNECTED_SQL, SAVED_CONTACT_SQL, TABS, TAB_WHERE, TS_ISO_SQL, phoneKeyOf };
