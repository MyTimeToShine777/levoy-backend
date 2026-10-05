'use strict';

const jobs = require('./index');

// In-process timers, for a single always-on server (ENABLE_SCHEDULER=true). When the jobs are driven from outside
// instead (POST /api/internal/jobs/:name from the shared Trigger.dev project), leave this off so nothing runs twice.
let started = false;

function every(ms, name, fn) {
  const run = () => fn().catch(e => console.error(`Scheduled ${name} failed:`, e.message));
  const t = setInterval(run, ms);
  t.unref();
  return t;
}

function start() {
  if (started) return;
  started = true;
  every(60 * 1000, 'reminders', jobs.dueReminders);          // reminders should land within a minute
  every(60 * 60 * 1000, 'hourly', jobs.hourly);
  every(24 * 60 * 60 * 1000, 'daily', jobs.daily);
  console.log('Scheduler on: reminders every minute, hourly and daily jobs');
}

module.exports = { start };
