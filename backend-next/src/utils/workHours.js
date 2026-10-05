'use strict';

// Working time vs idle (break) time for one telecaller, from their call log alone.
//
// A day's calls are laid end to end. When the gap between one call ending and the next starting is
// no longer than `idleGapMinutes`, the person was still working (dialling, writing a note); a longer
// gap is a break. So for a day:
//
//   idle    = the sum of the gaps longer than the threshold (listed as breaks)
//   working = (end of the last call − start of the first) − idle
//
// Calls are given as { start: ms-since-epoch, seconds }. Days are cut at LOCAL midnight, which the
// caller expresses as `tzOffsetMinutes` (minutes EAST of UTC, e.g. India = 330).

const MIN = 60000;

function dayKey(ms, tzOffsetMinutes) {
  const d = new Date(ms + tzOffsetMinutes * MIN);
  return d.toISOString().slice(0, 10);
}

function computeDay(calls, idleGapMinutes) {
  const sorted = calls.slice().sort((a, b) => a.start - b.start);
  const threshold = idleGapMinutes * MIN;
  let first = Infinity, lastEnd = -Infinity, idle = 0, talk = 0;
  const breaks = [];
  let prevEnd = null;
  for (const c of sorted) {
    const end = c.start + Math.max(0, c.seconds) * 1000;
    talk += Math.max(0, c.seconds);
    if (c.start < first) first = c.start;
    if (prevEnd !== null) {
      const gap = c.start - prevEnd;
      if (gap > threshold) { idle += gap; breaks.push({ from: prevEnd, to: c.start, seconds: Math.round(gap / 1000) }); }
    }
    if (end > lastEnd) lastEnd = end;
    prevEnd = prevEnd === null ? end : Math.max(prevEnd, end);
  }
  const span = Math.max(0, lastEnd - first);
  return {
    calls: sorted.length,
    first_call_at: new Date(first).toISOString(),
    last_call_at: new Date(lastEnd).toISOString(),
    talk_seconds: talk,
    working_seconds: Math.max(0, Math.round((span - idle) / 1000)),
    idle_seconds: Math.round(idle / 1000),
    breaks: breaks.map(b => ({ from: new Date(b.from).toISOString(), to: new Date(b.to).toISOString(), seconds: b.seconds })),
  };
}

function workingHours(calls, { idleGapMinutes = 15, tzOffsetMinutes = 0 } = {}) {
  const byDay = new Map();
  for (const c of calls) {
    const k = dayKey(c.start, tzOffsetMinutes);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(c);
  }
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, list]) => ({ date, ...computeDay(list, idleGapMinutes) }));
  const sum = k => days.reduce((n, d) => n + d[k], 0);
  return {
    idle_gap_minutes: idleGapMinutes,
    days,
    totals: { days: days.length, calls: sum('calls'), talk_seconds: sum('talk_seconds'), working_seconds: sum('working_seconds'), idle_seconds: sum('idle_seconds') },
  };
}

module.exports = { workingHours, computeDay, dayKey };
