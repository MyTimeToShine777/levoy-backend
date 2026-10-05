// Call history / analytics / contacts / plans (the Levoy-app parity work): how a call is classified,
// who sees whose calls, what each plan unlocks (402 with upgrade info), SIM + WhatsApp attribution,
// reminders, device health and the Excel export. Skipped by --only-legacy.

module.exports = async ({ call, expect }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });
  const iso = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();
  const day = new Date(Date.now() - 86400000).toISOString();

  // ── ingest: SIM 1, SIM 2 and a WhatsApp call, all as agent3 (a telecaller with no calls from the earlier steps) ──
  const ev = [
    { phone_number: '+91 90000 11111', direction: 'outgoing', status: 'connected', duration_seconds: 120, timestamp: iso(50), caller_id: 'Aanya', sim_slot: 1, sim_label: 'Jio' },
    { phone_number: '+91 90000 22222', direction: 'incoming', status: 'missed', duration_seconds: 0, timestamp: iso(40), sim_slot: 2, sim_label: 'Airtel' },
    { phone_number: '+91 90000 33333', direction: 'incoming', status: 'rejected', duration_seconds: 0, timestamp: iso(30), sim_slot: 1 },
    { phone_number: '+91 90000 44444', direction: 'outgoing', status: 'unanswered', duration_seconds: 0, timestamp: iso(20), sim_slot: 1 },
    { phone_number: '09000011111', direction: 'incoming', status: 'connected', duration_seconds: 30, timestamp: iso(10), source: 'whatsapp' },
  ];
  const b = await J('ci-batch', 'POST', '/api/calls/batch', { events: ev }, { as: 'agent3' });
  expect(b.status === 200 && b.data.received === 5, `five calls ingested (got ${b.data && b.data.received})`);
  const bad = await J('ci-batch-bad-slot', 'POST', '/api/calls', { phone_number: '9000055555', sim_slot: 9 }, { as: 'agent3' });
  expect(bad.status === 400, `an impossible SIM slot is refused (got ${bad.status})`);
  const badSrc = await J('ci-batch-bad-source', 'POST', '/api/calls', { phone_number: '9000055555', source: 'telegram' }, { as: 'agent3' });
  expect(badSrc.status === 400, `an unknown call source is refused (got ${badSrc.status})`);

  // ── classification + tab counts ──
  const h = await call('ci-history', 'GET', '/api/call-history?limit=50', { as: 'agent3' });
  expect(h.status === 200, 'agent can open call history');
  const c = h.data.counts;
  expect(c.missed === 1 && c.rejected === 1, `one missed, one rejected (got ${c.missed}/${c.rejected})`);
  expect(c.never_attended === 2, `missed + rejected with no later call back are never attended (got ${c.never_attended})`);
  expect(c.not_pickup === 1, `the unanswered outgoing call is "not pickup by client" (got ${c.not_pickup})`);
  // 09000011111 (WhatsApp, later) shares its last 10 digits with +91 90000 11111, so they are the same person
  const people = await call('ci-contacts', 'GET', '/api/contacts', { as: 'agent3' });
  const aanya = (people.data.rows || []).find(r => r.phone_key === '9000011111');
  expect(aanya && aanya.total_calls === 2, `+91 and 0-prefixed forms of one number are one contact (got ${aanya && aanya.total_calls})`);

  // ── SIM / WhatsApp filters ──
  const s2 = await call('ci-sim2', 'GET', '/api/call-history?sim=2', { as: 'agent3' });
  expect(s2.data.total === 1, `SIM 2 filter shows its one call (got ${s2.data.total})`);
  const wa = await call('ci-wa', 'GET', '/api/call-history?sim=whatsapp', { as: 'agent3' });
  expect(wa.data.total === 1, `WhatsApp filter shows its one call (got ${wa.data.total})`);
  const badSim = await call('ci-sim-bad', 'GET', '/api/call-history?sim=banana', { as: 'agent3' });
  expect(badSim.status === 400, 'a nonsense SIM filter is a 400');

  // ── scoping: an agent only ever sees their own calls ──
  const mine = await call('ci-agent2-scope', 'GET', '/api/call-history?search=90000', { as: 'agent2' });
  expect(mine.status === 200 && mine.data.counts.all === 0, `another agent sees none of those calls (got ${mine.data && mine.data.counts.all})`);
  const team = await call('ci-manager-scope', 'GET', '/api/call-history?search=90000&limit=1', { as: 'manager' });
  expect(team.data.counts.all >= 5, `a manager sees the team's calls (got ${team.data.counts.all})`);

  // ── analytics ──
  const an = await call('ci-summary', 'GET', `/api/call-analytics/summary?date_from=${encodeURIComponent(day)}&tz=330`, { as: 'agent3' });
  expect(an.status === 200 && an.data.totals.calls === 5, `summary counts the five calls (got ${an.data.totals && an.data.totals.calls})`);
  expect(an.data.unique_calls === null && an.data.locked.includes('unique_calls'), 'unique calls are locked on the Free plan');
  expect(an.data.series.unit === 'hour' || an.data.series.unit === 'day', 'summary carries a graph series');

  // ── plan gating (402 carries the plan to upgrade to) ──
  const plan0 = await call('ci-plan-free', 'GET', '/api/plan', { as: 'agent3' });
  expect(plan0.data.effective_plan === 'free' && typeof plan0.data.payments_connected === 'boolean', 'workspace starts on Free, and says whether online payment is set up');
  const note = await J('ci-note-402', 'PUT', `/api/call-history/${h.data.rows[0].id}/annotate`, { notes: 'x' }, { as: 'agent3' });
  expect(note.status === 402 && note.data.required_plan === 'premium_plus', `notes need Premium Plus (got ${note.status} ${note.data && note.data.required_plan})`);
  const grp = await call('ci-groups-402', 'GET', '/api/contact-groups', { as: 'agent3' });
  expect(grp.status === 402, `groups need Premium Plus (got ${grp.status})`);
  const agentActivate = await J('ci-activate-agent', 'POST', '/api/plan/activate', { plan: 'biz' }, { as: 'agent3' });
  expect(agentActivate.status === 403, `an agent cannot switch the plan (got ${agentActivate.status})`);

  const qc402 = await J('ci-quickcall-402', 'POST', '/api/quick-call/dial', { number: '9000011111' }, { as: 'agent3' });
  expect(qc402.status === 402 && qc402.data.required_plan === 'premium', `Quick Call needs Premium (got ${qc402.status} ${qc402.data && qc402.data.required_plan})`);

  // ── trial unlocks everything once, then Free again when it ends ──
  const trial = await J('ci-trial', 'POST', '/api/plan/trial', { plan: 'biz' });
  expect(trial.status === 200 && trial.data.status === 'trial' && trial.data.effective_plan === 'biz', 'admin starts a Biz trial');
  const trial2 = await J('ci-trial-again', 'POST', '/api/plan/trial', { plan: 'premium' });
  expect(trial2.status === 409, `the trial can only be used once (got ${trial2.status})`);
  const ann = await J('ci-note', 'PUT', `/api/call-history/${h.data.rows[0].id}/annotate`, { notes: 'asked for the price list', tags: ['Interested', 'Price query'] }, { as: 'agent3' });
  expect(ann.status === 200 && ann.data.tags.length === 2, `with the plan on, a note and two tags save (got ${ann.status})`);
  const other = await J('ci-note-other', 'PUT', `/api/call-history/${h.data.rows[0].id}/annotate`, { notes: 'mine now' }, { as: 'agent2' });
  expect(other.status === 403, `an agent cannot annotate someone else's call (got ${other.status})`);
  const withNotes = await call('ci-notes-filter', 'GET', '/api/call-history?notes=with', { as: 'agent3' });
  expect(withNotes.data.total === 1, `the "with notes" filter finds it (got ${withNotes.data.total})`);

  // ── contacts: detail, compare, groups ──
  const det = await call('ci-contact-detail', 'GET', '/api/contacts/9000011111?tz=330', { as: 'agent3' });
  expect(det.status === 200 && det.data.summary.total.calls === 2 && det.data.history.length === 2, 'contact detail has summary + history');
  const cmp = await call('ci-compare', 'GET', '/api/contacts/compare?phones=9000011111,9000022222', { as: 'agent3' });
  expect(cmp.status === 200 && cmp.data.length === 2, 'compare returns both people');
  const cmp6 = await call('ci-compare-6', 'GET', '/api/contacts/compare?phones=1000000001,1000000002,1000000003,1000000004,1000000005,1000000006', { as: 'agent3' });
  expect(cmp6.status === 400, `compare is capped at five (got ${cmp6.status})`);
  const g = await J('ci-group-create', 'POST', '/api/contact-groups', { name: 'VIP' }, { as: 'agent3' });
  expect(g.status === 201, `a group can be made while the plan allows it (got ${g.status})`);
  const gm = await J('ci-group-add', 'POST', `/api/contact-groups/${g.data.id}/members`, { phones: ['09000011111'] }, { as: 'agent3' });
  expect(gm.status === 200 && gm.data.added === 1, 'a member is added by phone');
  const inGroup = await call('ci-group-filter', 'GET', `/api/call-history?group_id=${g.data.id}`, { as: 'agent3' });
  expect(inGroup.data.total === 2, `filtering by group finds both calls of that person (got ${inGroup.data.total})`);

  // ── working hours + billing (Premium Plus) ──
  const wh = await call('ci-working', 'GET', `/api/call-analytics/summary?date_from=${encodeURIComponent(day)}&tz=330`, { as: 'agent3' });
  expect(wh.data.working && wh.data.working.totals.days >= 1, 'working hours are computed for the person');
  const set = await J('ci-billing-on', 'PUT', '/api/workspace-settings', { billing_enabled: 1, billing_rate_per_minute: 2 });
  expect(set.status === 200 && set.data.billing_rate_per_minute === 2, 'admin sets a billing rate');
  const setAgent = await J('ci-billing-agent', 'PUT', '/api/workspace-settings', { billing_enabled: 0 }, { as: 'agent3' });
  expect(setAgent.status === 403, `an agent cannot change billing (got ${setAgent.status})`);
  const billed = await call('ci-billing', 'GET', '/api/call-analytics/summary', { as: 'agent3' });
  expect(billed.data.billing.enabled === true && billed.data.billing.range_cost === 4, `120 s at 2/min = 4 (got ${billed.data.billing.range_cost})`);
  await J('ci-billing-off', 'PUT', '/api/workspace-settings', { billing_enabled: 0 });

  // ── SIM verification, reminders, device health ──
  const sim = await J('ci-sim', 'PUT', '/api/sims/1', { label: 'Jio', number: '9344281783', verify_method: 'call_log' }, { as: 'agent3' });
  expect(sim.status === 200 && sim.data.verified === true, 'verifying via call log marks the SIM verified');
  const sim2 = await J('ci-sim-change', 'PUT', '/api/sims/1', { number: '9344281799' }, { as: 'agent3' });
  expect(sim2.data.verified === false, 'changing the number clears the verification');
  const skip = await J('ci-sim-skip', 'PUT', '/api/sims/2', { verify_method: 'skip' }, { as: 'agent3' });
  expect(skip.status === 200 && skip.data.verified === false && skip.data.verify_method === 'skip', 'skipping leaves the SIM unverified');
  const rem = await J('ci-reminder', 'POST', '/api/call-reminders', { phone_number: '9000022222', note: 'call back', remind_at: new Date(Date.now() - 60000).toISOString() }, { as: 'agent3' });
  expect(rem.status === 201, 'a reminder can be set');
  const notif = await call('ci-reminder-due', 'GET', '/api/notifications', { as: 'agent3' });
  expect(notif.data.notifications.some(n => n.type === 'call_reminder'), 'a due reminder turns into a notification');
  await J('ci-device', 'POST', '/api/device/status', { device_name: 'Pixel 7', permissions: { call_log: false }, battery_optimized: true }, { as: 'agent3' });
  const dev = await call('ci-devices', 'GET', '/api/devices', { as: 'manager' });
  const pix = (dev.data || []).find(d => d.device_name === 'Pixel 7');
  expect(pix && pix.problems.length === 2, `a phone with call-log denied + battery optimisation reports two problems (got ${pix && pix.problems.length})`);

  // ── exports + backup ──
  const rep = await J('ci-export', 'POST', '/api/call-exports/report', { tz: 330 }, { as: 'agent3' });
  expect(rep.status === 201 && /\.xlsx$/.test(rep.data.filename) && rep.data.rows === 5, `Excel call report (got ${rep.status} ${rep.data && rep.data.filename})`);
  const bk = await call('ci-backup', 'GET', '/api/call-exports/backup', { as: 'agent3' });
  expect(bk.status === 200 && bk.data.calls.length === 5, 'backup holds the five calls');
  const rs = await J('ci-restore', 'POST', '/api/call-exports/restore', bk.data, { as: 'agent3' });
  expect(rs.status === 200 && rs.data.calls_added === 0 && rs.data.calls_skipped === 5, `restoring the same backup adds nothing (added ${rs.data.calls_added})`);

  // ── Quick Call: browser → the person's own phone ──
  const noPhone = await J('ci-quickcall-nophone', 'POST', '/api/quick-call/dial', { number: '9000011111' }, { as: 'agent3' });
  expect(noPhone.status === 409, `dialling with no linked phone explains itself (got ${noPhone.status})`);
  const link = await J('ci-quickcall-link', 'POST', '/api/quick-call/devices', { device_name: 'Pixel 7' }, { as: 'agent3' });
  expect(link.status === 200 && link.data.linked === true, 'a phone links itself');
  const badNum = await J('ci-quickcall-badnum', 'POST', '/api/quick-call/dial', { number: 'DROP TABLE' }, { as: 'agent3' });
  expect(badNum.status === 400, `a non-number is refused (got ${badNum.status})`);
  const dial = await J('ci-quickcall-dial', 'POST', '/api/quick-call/dial', { number: '+91 90000 11111', name: 'Aanya', source: 'chrome' }, { as: 'agent3' });
  expect(dial.status === 201 && dial.data.phones_online === 1, `the browser queues a dial (got ${dial.status})`);
  const otherPhone = await call('ci-quickcall-other', 'GET', '/api/quick-call/pending?device_name=Pixel%207&wait=0', { as: 'agent1' });
  expect(otherPhone.status === 404, `another person's phone name is not linked for them (got ${otherPhone.status})`);
  const pend = await call('ci-quickcall-pending', 'GET', '/api/quick-call/pending?device_name=Pixel%207&wait=2', { as: 'agent3' });
  expect(pend.status === 200 && pend.data.commands.length === 1 && pend.data.commands[0].phone_number === '+91 90000 11111', 'the phone receives the number');
  const pend2 = await call('ci-quickcall-pending-2', 'GET', '/api/quick-call/pending?device_name=Pixel%207&wait=0', { as: 'agent3' });
  expect(pend2.data.commands.length === 0, 'a command is delivered once');

  // ── names and support links ──
  const bf = await J('ci-backfill', 'POST', '/api/calls/backfill', { events: [
    { phone_number: ev[1].phone_number, timestamp: ev[1].timestamp, caller_id: 'Rohan Gupta', sim_slot: 2 },
    { phone_number: ev[0].phone_number, timestamp: ev[0].timestamp, caller_id: 'Someone Else' },
  ] }, { as: 'agent3' });
  expect(bf.status === 200 && bf.data.updated === 1, `backfill fills the blank name only (updated ${bf.data.updated})`);
  const after = await call('ci-backfill-check', 'GET', '/api/contacts', { as: 'agent3' });
  const names = Object.fromEntries((after.data.rows || []).map(r => [r.phone_key, r.contact_name]));
  expect(names['9000022222'] === 'Rohan Gupta' && names['9000011111'] === 'Aanya', `a blank name is filled, an existing one is kept (${names['9000022222']}, ${names['9000011111']})`);
  const badLink = await J('ci-social-bad', 'PUT', '/api/workspace-settings', { social_twitter: 'javascript:alert(1)' });
  expect(badLink.status === 400, `a non-https social link is refused (got ${badLink.status})`);
  const okLink = await J('ci-social-ok', 'PUT', '/api/workspace-settings', { social_twitter: 'https://x.com/levoy', support_whatsapp: '+91 90000 99999' });
  expect(okLink.status === 200 && okLink.data.social_twitter === 'https://x.com/levoy', 'social link and support number save');
  await J('ci-social-clear', 'PUT', '/api/workspace-settings', { social_twitter: '', support_whatsapp: '' });

  // ── account lifecycle ──
  const consent = await J('ci-consent', 'POST', '/api/users/me/consent', {}, { as: 'agent3' });
  expect(consent.status === 200 && consent.data.accepted === true, 'privacy consent is recorded');
  const delNoPw = await J('ci-delete-nopw', 'DELETE', '/api/users/me', {}, { as: 'agent3' });
  expect(delNoPw.status === 400, `deleting an account needs the account email typed to confirm (got ${delNoPw.status})`);

  // leave the workspace the way we found it
  await J('ci-plan-reset', 'POST', '/api/platform/customers/1/subscription/plan', { plan: 'free' }, { as: 'platform' });
};
