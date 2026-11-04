'use strict';

const MIN = 60000;
const DAY = 86400000;

// The viewer's time zone, in minutes EAST of UTC (India = 330). Anything that is not a sane number means UTC.
function tzMinutes(query) {
  const n = parseInt(query && query.tz);
  return Number.isInteger(n) && Math.abs(n) <= 14 * 60 ? n : 0;
}

// When the viewer's calendar day containing `nowMs` starts, as a UTC time in milliseconds.
// ("Today" must follow the viewer's clock, not the server's: for someone in India the day starts at 18:30 UTC.)
function startOfLocalDay(nowMs, tz) {
  return Math.floor((nowMs + tz * MIN) / DAY) * DAY - tz * MIN;
}

module.exports = { tzMinutes, startOfLocalDay, MIN, DAY };
