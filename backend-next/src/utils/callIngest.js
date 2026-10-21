'use strict';

const { phoneKey } = require('./phoneKey');

// Rules applied to every call event the server receives, kept pure so they can be tested without a database.

const DUPLICATE_WINDOW_MS = 5000;

function durationOf(e) {
  const n = Math.round(Number(e && (e.duration_seconds ?? e.duration)));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function directionOf(e) {
  return (e && e.direction) || 'outgoing';
}

// "Connected" means someone spoke (the same rule the analytics use: duration above zero). A call the phone reports as
// connected but that lasted 0 seconds was not answered: a missed call if it came in, unanswered if we placed it.
function normalizeCallStatus(status, direction, durationSeconds) {
  const s = status || 'connected';
  if (s === 'connected' && !(durationSeconds > 0)) return direction === 'incoming' ? 'missed' : 'unanswered';
  return s;
}

// Same person, same direction, same length, started within a few seconds of each other: one call, uploaded twice.
function sameCall(a, b) {
  return a.key != null && a.key === b.key && a.direction === b.direction && a.duration === b.duration
    && Math.abs(a.at - b.at) <= DUPLICATE_WINDOW_MS;
}

function shape(e, at) {
  return { key: phoneKey(e.phone_number), direction: directionOf(e), duration: durationOf(e), at };
}

// events: incoming call events ({ phone_number, direction, duration_seconds, timestamp }).
// existing: rows already stored ({ phone_number | phone_key, direction, duration_seconds, timestamp }).
// Returns { kept, duplicates } where kept preserves order and duplicates counts what was dropped (stored already, or repeated in this batch).
function dropDuplicates(events, existing, now = Date.now()) {
  const seen = (existing || []).map(r => ({
    key: r.phone_key || phoneKey(r.phone_number), direction: r.direction, duration: durationOf(r), at: new Date(r.timestamp).getTime(),
  }));
  const kept = [];
  let duplicates = 0;
  for (const e of events) {
    const t = e.timestamp ? new Date(e.timestamp).getTime() : now;
    const c = shape(e, Number.isFinite(t) ? t : now);
    if (seen.some(s => sameCall(c, s))) { duplicates++; continue; }
    seen.push(c);
    kept.push(e);
  }
  return { kept, duplicates };
}

// What a batch of uploaded calls tells us about each lead (keyed by phoneKey): when they were last reached for and what
// the call status should become if nobody has recorded one yet.
//   spoke to them            → "Called"        (we know a conversation happened, not how it went: the agent records the outcome)
//   we rang and nobody spoke → "Not Answered"
//   only an unanswered incoming call → nothing (no one contacted the lead)
function leadsTouchedBy(events, now = Date.now()) {
  const out = new Map();
  for (const e of events) {
    const key = phoneKey(e.phone_number);
    if (!key) continue;
    const spoke = durationOf(e) > 0;
    const rang = directionOf(e) === 'outgoing';
    if (!spoke && !rang) continue;
    const t = e.timestamp ? new Date(e.timestamp).getTime() : now;
    const at = Number.isFinite(t) ? t : now;
    const s = out.get(key) || { latest: 0, spoke: false, rang: false };
    s.latest = Math.max(s.latest, at);
    s.spoke = s.spoke || spoke;
    s.rang = s.rang || rang;
    out.set(key, s);
  }
  return new Map([...out].map(([key, s]) => [key, { latest: s.latest, outcome: s.spoke ? 'Called' : (s.rang ? 'Not Answered' : null) }]));
}

module.exports = { normalizeCallStatus, dropDuplicates, leadsTouchedBy, durationOf, directionOf, DUPLICATE_WINDOW_MS };
