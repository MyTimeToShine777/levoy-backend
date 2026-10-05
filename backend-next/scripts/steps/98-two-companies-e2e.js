// Two real companies side by side, end to end. Each gets its own team, leads (typed and imported), calls from the
// phone app, recordings, exports, settings and so on, every record stamped with that company's marker. Then:
//   1. every one of the API's GET endpoints is read as each company and must never contain the OTHER company's marker;
//   2. one company tries to read / change / delete things that exist ONLY in the other, which must fail and change nothing;
//   3. both companies hammer the API at the same time (AsyncLocalStorage must keep every request in its own company);
//   4. one company is suspended, then deleted, while the other keeps working with all of its data.
const { createApp } = require('../../src/app');

const BASE = 'http://127.0.0.1:3101';

module.exports = async ({ tokens, vars, call, login, expect }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });
  const PL = { as: 'platform' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // direct HTTP (no recording): used for the parallel and sweep parts
  const raw = async (method, p, who, body) => {
    const headers = {};
    if (who && tokens[who]) headers.Authorization = `Bearer ${tokens[who]}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, data, text };
  };
  // sign in with an emailed code, directly (parallel-safe)
  const rawLogin = async email => {
    await raw('POST', '/api/auth/send-otp', null, { email });
    return raw('POST', '/api/auth/verify-otp', null, { email, otp: '123456' });
  };

  const CO = {
    A: { t: 'A', name: 'Alpha Realty', slug: 'alpha-realty', domain: 'zz-a.test', ph: '97771', leads: 6, agents: 3, teams: 2, tags: 2, calls: 3 },
    B: { t: 'B', name: 'Beta Pharma', slug: 'beta-pharma', domain: 'zz-b.test', ph: '97772', leads: 3, agents: 2, teams: 1, tags: 1, calls: 2 },
  };
  const other = t => (t === 'A' ? 'B' : 'A');
  const mark = t => `ZZMARK-${t}`;
  const FOREIGN = { A: /ZZMARK-B|zz-b\.test|97772\d{5}/, B: /ZZMARK-A|zz-a\.test|97771\d{5}/ };
  const audio = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');

  // ───────────────────────── 1. build both companies ─────────────────────────
  for (const co of Object.values(CO)) {
    const t = co.t;
    const made = await J(`e2e-${t}-create`, 'POST', '/api/platform/customers', { name: co.name, owner_email: `owner@${co.domain}`, owner_name: `${mark(t)} Owner` }, PL);
    expect(made.status === 201, `${co.name} is created`);
    co.id = made.data.id;
    const lo = await login(`e2e-${t}-owner-login`, `owner@${co.domain}`);
    expect(lo.status === 200 && lo.data.workspace.name === co.name, `${co.name}'s owner lands in ${co.name}`);
    tokens[`${t}Owner`] = lo.data.access_token;

    // team members: a manager and several agents, each signing in with a code
    const people = [['Mgr', 'manager'], ...Array.from({ length: co.agents }, (_, i) => [`Ag${i + 1}`, 'agent'])];
    co.userIds = {};
    for (const [key, role] of people) {
      const u = await J(`e2e-${t}-user-${key}`, 'POST', '/api/users', { email: `${key.toLowerCase()}@${co.domain}`, name: `${mark(t)} ${key}`, role }, { as: `${t}Owner` });
      expect(u.status === 201, `${co.name}: ${key} created`);
      co.userIds[key] = u.data.id;
      const lg = await login(`e2e-${t}-login-${key}`, `${key.toLowerCase()}@${co.domain}`);
      expect(lg.status === 200 && lg.data.workspace.name === co.name, `${co.name}: ${key} signs in to ${co.name}`);
      tokens[`${t}${key}`] = lg.data.access_token;
    }

    // teams
    co.teamIds = [];
    for (let i = 1; i <= co.teams; i++) {
      const tm = await J(`e2e-${t}-team-${i}`, 'POST', '/api/teams', { name: `${mark(t)} Team ${i}` }, { as: `${t}Mgr` });
      expect(tm.status === 201, `${co.name}: team ${i} created`);
      co.teamIds.push(tm.data.id);
    }
    await J(`e2e-${t}-team-member`, 'POST', `/api/teams/${co.teamIds[0]}/members`, { user_id: co.userIds.Ag1 }, { as: `${t}Mgr` });

    // leads typed in by hand
    co.leadIds = [];
    for (let i = 1; i <= co.leads; i++) {
      const l = await J(`e2e-${t}-lead-${i}`, 'POST', '/api/leads',
        { name: `${mark(t)} Lead ${i}`, phone: `${co.ph}0000${i}`, email: `lead${i}@${co.domain}`, source: `${mark(t)} source`, notes: `${mark(t)} lead note ${i}` }, { as: `${t}Owner` });
      expect(l.status === 201, `${co.name}: lead ${i} created`);
      co.leadIds.push(l.data.id);
    }
    // leads uploaded from a spreadsheet (CSV)
    const csv = ['name,phone', `${mark(t)} Import 1,${co.ph}10001`, `${mark(t)} Import 2,${co.ph}10002`].join('\n');
    const imp = await call(`e2e-${t}-import`, 'POST', '/api/leads/import', { as: `${t}Owner`, form: { fields: {}, file: { name: 'leads.csv', content: csv, type: 'text/csv' } } });
    expect(imp.status === 200 || imp.status === 201, `${co.name}: CSV import works (got ${imp.status})`);

    // tags, notes on a lead, follow-up, assignment, rule
    co.tagIds = [];
    for (let i = 1; i <= co.tags; i++) {
      const tg = await J(`e2e-${t}-tag-${i}`, 'POST', '/api/tags', { name: `${mark(t)} tag ${i}` }, { as: `${t}Owner` });
      expect(tg.status === 201 || tg.status === 200, `${co.name}: tag ${i} created`);
      co.tagIds.push(tg.data.id);
    }
    await J(`e2e-${t}-lead-tags`, 'PUT', `/api/leads/${co.leadIds[0]}/tags`, { tag_ids: [co.tagIds[0]] }, { as: `${t}Owner` });
    await J(`e2e-${t}-activity`, 'POST', `/api/leads/${co.leadIds[0]}/activities`, { type: 'note', summary: `${mark(t)} activity note` }, { as: `${t}Owner` });
    await J(`e2e-${t}-followup`, 'POST', `/api/leads/${co.leadIds[0]}/follow-ups`, { type: 'call', due_at: new Date(Date.now() + 86400000).toISOString(), notes: `${mark(t)} follow-up` }, { as: `${t}Owner` });
    const asg = await J(`e2e-${t}-assign`, 'POST', `/api/leads/${co.leadIds[1]}/assign`, { assigned_to: co.userIds.Ag1 }, { as: `${t}Mgr` });
    expect(asg.status === 200 || asg.status === 201, `${co.name}: a lead is assigned to an agent (got ${asg.status})`);
    await J(`e2e-${t}-rule`, 'POST', '/api/assignment-rules', { name: `${mark(t)} rule`, strategy: 'fixed', fixed_user_id: co.userIds.Ag2 }, { as: `${t}Mgr` });
    await J(`e2e-${t}-stage`, 'POST', '/api/pipeline/stages', { name: `${mark(t)} Stage` }, { as: `${t}Owner` });
    await J(`e2e-${t}-custom-role`, 'POST', '/api/rbac/custom-roles', { name: `${mark(t)} Role`, base_role: 'agent' }, { as: `${t}Owner` });
    await J(`e2e-${t}-invite`, 'POST', '/api/invitations', { email: `invitee@${co.domain}`, role: 'agent' }, { as: `${t}Owner` });
    await J(`e2e-${t}-settings`, 'PUT', '/api/workspace-settings', { support_whatsapp: `+91${co.ph}00099` }, { as: `${t}Owner` });
    await J(`e2e-${t}-wa-template`, 'POST', '/api/whatsapp-templates', { name: `${mark(t)} template`, category: 'sales', content: `Hello from ${mark(t)}` }, { as: `${t}Ag1` });
    await J(`e2e-${t}-push-token`, 'POST', '/api/push/tokens', { token: `${mark(t)}-device-token-1234567890`, device_name: `${mark(t)} phone`, platform: 'android' }, { as: `${t}Ag1` });

    // calls uploaded from the phone app, a recording, a note, a reminder
    co.callIds = [];
    for (let i = 1; i <= co.calls; i++) {
      const c = await J(`e2e-${t}-call-${i}`, 'POST', '/api/calls',
        { phone_number: `${co.ph}2000${i}`, direction: 'outgoing', status: 'connected', duration_seconds: 30 + i, timestamp: new Date(Date.now() - i * 60000).toISOString(), notes: `${mark(t)} call note ${i}` }, { as: `${t}Ag1` });
      expect(c.status === 201 || c.status === 200, `${co.name}: call ${i} saved from the phone`);
      co.callIds.push(c.data.id);
    }
    const batch = await J(`e2e-${t}-batch`, 'POST', '/api/calls/batch', { events: [
      { phone_number: `${co.ph}30001`, status: 'connected', duration_seconds: 12, timestamp: new Date(Date.now() - 600000).toISOString() },
      { phone_number: `${co.ph}30002`, direction: 'incoming', status: 'missed', timestamp: new Date(Date.now() - 700000).toISOString() }] }, { as: `${t}Ag1` });
    expect(batch.status === 200 || batch.status === 201, `${co.name}: a batch of calls syncs from the phone`);
    co.lastCall = co.callIds[co.callIds.length - 1];
    const rec = await call(`e2e-${t}-recording`, 'POST', `/api/calls/${co.callIds[0]}/recordings`, { as: `${t}Ag1`, form: { fileField: 'recording', fields: { duration: '30' }, file: { name: `${t}.m4a`, content: audio, type: 'audio/mp4' } } });
    expect(rec.status === 201 || rec.status === 200, `${co.name}: a call recording uploads (got ${rec.status})`);
    co.recId = rec.data && rec.data.id;
    if (t === 'A') {
      // a second recording, so the id used in the cross-company attempts below exists ONLY in Alpha
      const rec2 = await call(`e2e-${t}-recording-2`, 'POST', `/api/calls/${co.callIds[1]}/recordings`, { as: `${t}Ag1`, form: { fileField: 'recording', fields: { duration: '31' }, file: { name: `${t}2.m4a`, content: audio, type: 'audio/mp4' } } });
      co.recId2 = rec2.data && rec2.data.id;
    }
    await J(`e2e-${t}-reminder`, 'POST', '/api/call-reminders', { phone_number: `${co.ph}40001`, note: `${mark(t)} reminder`, remind_at: new Date(Date.now() + 3600000).toISOString() }, { as: `${t}Ag1` });
    await J(`e2e-${t}-review`, 'POST', `/api/calls/${co.callIds[0]}/reviews`, { scores: { Opening: 4, Discovery: 4, Resolution: 4, Communication: 4, Compliance: 4, Closing: 4 }, notes: `${mark(t)} review` }, { as: `${t}Mgr` });

    // exports
    const ex = await J(`e2e-${t}-export`, 'POST', '/api/exports', { type: 'leads', params: {} }, { as: `${t}Owner` });
    expect(ex.status === 200 || ex.status === 201, `${co.name}: a leads export is created`);
    const exl = await call(`e2e-${t}-export-list`, 'GET', '/api/exports', { as: `${t}Owner` });
    co.exportId = (exl.data.exports || exl.data)[0].id;
    expect(!!co.exportId, `${co.name}: its export appears in its own export list`);
  }

  // plans differ per company: A is on Premium Plus, B stays on Free
  await J('e2e-A-grant', 'POST', `/api/platform/customers/${CO.A.id}/subscription/grant`, { plan: 'premium_plus', months: 1 }, PL);
  const grpA = await J('e2e-A-group', 'POST', '/api/contact-groups', { name: `${mark('A')} group` }, { as: 'AOwner' });
  const grpB = await J('e2e-B-group', 'POST', '/api/contact-groups', { name: `${mark('B')} group` }, { as: 'BOwner' });
  expect(grpA.status === 201 || grpA.status === 200, 'Alpha (Premium Plus) can use contact groups');
  expect(grpB.status === 402, 'Beta (Free) is told to upgrade for contact groups');
  const planA = await call('e2e-A-plan', 'GET', '/api/plan', { as: 'AOwner' });
  const planB = await call('e2e-B-plan', 'GET', '/api/plan', { as: 'BOwner' });
  expect(planA.data.effective_plan === 'premium_plus' && planB.data.effective_plan === 'free', 'each company has its own plan');

  // ───────────────────────── 2. each company sees exactly its own data ─────────────────────────
  const expectLeads = { A: CO.A.leads + 2, B: CO.B.leads + 2 };
  for (const t of ['A', 'B']) {
    const co = CO[t];
    const list = await call(`e2e-${t}-leads`, 'GET', '/api/leads?limit=1000', { as: `${t}Owner` });
    const rows = list.data.leads || list.data.rows || list.data;
    expect(rows.length === expectLeads[t], `${co.name} has exactly its own ${expectLeads[t]} leads (typed + imported), got ${rows.length}`);
    expect(rows.every(l => String(l.name).includes(mark(t))), `${co.name}'s leads are all its own`);
    co.maxLead = Math.max(...rows.map(l => l.id));
    const users = await call(`e2e-${t}-users`, 'GET', '/api/users', { as: `${t}Owner` });
    expect(users.data.length === 2 + co.agents && users.data.every(u => String(u.email).endsWith(co.domain)), `${co.name} has only its own ${2 + co.agents} users`);
    co.maxUser = Math.max(...users.data.map(u => u.id));
    const calls = await call(`e2e-${t}-calls`, 'GET', '/api/calls?limit=500', { as: `${t}Owner` });
    const crow = calls.data.calls || calls.data.rows || calls.data;
    expect(crow.length === co.calls + 2 && crow.every(c => String(c.phone_number).startsWith(co.ph)), `${co.name} has only its own ${co.calls + 2} calls`);
    co.maxCall = Math.max(...crow.map(c => c.id));
    const team = await call(`e2e-${t}-teams`, 'GET', '/api/teams', { as: `${t}Mgr` });
    expect(team.data.length === co.teams && team.data.every(x => x.name.includes(mark(t))), `${co.name} has only its own teams`);
    const st = await call(`e2e-${t}-settings-read`, 'GET', '/api/workspace-settings', { as: `${t}Owner` });
    expect(String(st.data.support_whatsapp).includes(`${co.ph}00099`) && !FOREIGN[t].test(JSON.stringify(st.data)), `${co.name} has its own settings (${st.data.support_whatsapp})`);
    const nt = await call(`e2e-${t}-notifications`, 'GET', '/api/notifications', { as: `${t}Ag1` });
    expect(!FOREIGN[t].test(JSON.stringify(nt.data)), `${co.name}'s notifications are its own`);
    const exp = await raw('GET', `/api/exports/${co.exportId}/file`, `${t}Owner`);
    expect(exp.status === 200 && exp.text.includes(mark(t)) && !FOREIGN[t].test(exp.text), `${co.name}'s export file holds only its own leads`);
    const aud = await call(`e2e-${t}-audit`, 'GET', '/api/audit-log?limit=500', { as: `${t}Owner` });
    expect(!FOREIGN[t].test(JSON.stringify(aud.data)), `${co.name}'s audit log shows only its own actions`);
  }
  expect(CO.A.leads + 2 > CO.B.leads + 2 && CO.A.agents > CO.B.agents && CO.A.calls > CO.B.calls, '(setup: Alpha has more records, so some ids exist ONLY in Alpha)');

  // ───────────────────────── 3. sweep every GET endpoint ─────────────────────────
  const routes = [];
  const walk = stack => {
    for (const l of stack) {
      if (l.route) { if (l.route.methods.get) routes.push(l.route.path); }
      else if (l.name === 'router' && l.handle.stack) walk(l.handle.stack);
    }
  };
  walk(createApp()._router.stack);
  const SKIP = /^\/(api\/platform|pay|health|uploads)|^\/$|^\/api$|stripe|enrichment/;
  const getRoutes = [...new Set(routes)].filter(r => !SKIP.test(r));
  const staticRoutes = getRoutes.filter(r => !r.includes(':'));
  const paramRoutes = getRoutes.filter(r => r.includes(':'));
  expect(staticRoutes.length >= 50 && paramRoutes.length >= 15, `the sweep covers the API (${staticRoutes.length} fixed + ${paramRoutes.length} parameterised GET endpoints)`);

  const leaks = [];
  const ownSeen = { A: new Set(), B: new Set() };
  const check = (who, t, route, res) => {
    if (res.status >= 500) leaks.push(`${who} ${route} -> ${res.status} (server error)`);
    if (res.status !== 200) return;
    if (FOREIGN[t].test(res.text)) leaks.push(`${who} ${route} leaked ${other(t)}'s data`);
    if (res.text.includes(mark(t))) ownSeen[t].add(route);
  };
  for (const who of ['AOwner', 'AAg1', 'AMgr', 'BOwner', 'BAg1', 'BMgr']) {
    const t = who[0];
    for (const r of staticRoutes) check(who, t, r, await raw('GET', r, who));
  }
  // parameterised: try small ids (which exist in BOTH companies) and each company's own phone numbers
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const phones = [`${CO.A.ph}20001`, `${CO.B.ph}20001`, `${CO.A.ph}30001`, `${CO.B.ph}30001`];
  for (const who of ['AOwner', 'BOwner', 'AAg1', 'BAg1']) {
    const t = who[0];
    for (const r of paramRoutes) {
      const vals = /:phone/.test(r) ? phones : ids;
      for (const v of vals) check(who, t, r.replace(/:\w+/g, v), await raw('GET', r.replace(/:\w+/g, v), who));
    }
  }
  expect(leaks.length === 0, `no endpoint ever returns the other company's data (${leaks.length} leaks: ${leaks.slice(0, 5).join(' | ')})`);
  expect(ownSeen.A.size >= 15 && ownSeen.B.size >= 15, `the sweep was meaningful: Alpha's data appeared on ${ownSeen.A.size} endpoints, Beta's on ${ownSeen.B.size}`);

  // ───────────────────────── 4. cross-company attempts on ids that exist only in the other ─────────────────────────
  const A = CO.A; const B = CO.B;
  const aOnlyLead = A.maxLead; const aOnlyUser = A.maxUser; const aOnlyCall = A.maxCall; const aOnlyTeam = A.teamIds[1]; const aOnlyTag = A.tagIds[1];
  expect(aOnlyLead > B.maxLead && aOnlyUser > B.maxUser && aOnlyCall > B.maxCall, `(setup: lead ${aOnlyLead}, user ${aOnlyUser}, call ${aOnlyCall} exist only in Alpha)`);
  const aLeadBefore = (await raw('GET', `/api/leads/${aOnlyLead}`, 'AOwner')).data;
  const tries = [
    ['GET', `/api/leads/${aOnlyLead}`], ['PUT', `/api/leads/${aOnlyLead}`, { name: 'HACKED' }], ['DELETE', `/api/leads/${aOnlyLead}`],
    ['POST', `/api/leads/${aOnlyLead}/activities`, { type: 'note', summary: 'HACKED' }], ['GET', `/api/leads/${aOnlyLead}/timeline`],
    ['PATCH', `/api/users/${aOnlyUser}`, { is_active: false, name: 'HACKED' }], ['PUT', `/api/rbac/users/${aOnlyUser}`, { permissions: { pages: {} } }],
    ['PUT', `/api/calls/${aOnlyCall}/notes`, { notes: 'HACKED' }], ['PUT', `/api/calls/${aOnlyCall}/pin`, { is_pinned: true }],
    ['GET', `/api/calls/${aOnlyCall}/recordings`], ['DELETE', `/api/recordings/${A.recId2}`],
    ['POST', `/api/teams/${aOnlyTeam}/members`, { user_id: B.userIds.Ag1 }], ['DELETE', `/api/tags/${aOnlyTag}`],
  ];
  const outcomes = [];
  for (const [m, p, b] of tries) {
    const r = await raw(m, p, 'BOwner', b);
    outcomes.push(`${m} ${p} -> ${r.status}`);
    expect([400, 403, 404].includes(r.status), `Beta cannot ${m} ${p} (got ${r.status})`);
  }
  const assignOut = await raw('POST', `/api/leads/${B.leadIds[2]}/assign`, 'BOwner', { assigned_to: aOnlyUser });
  expect(assignOut.status >= 400 && assignOut.status < 500, `Beta cannot assign its lead to a user that only exists in Alpha (got ${assignOut.status})`);
  const aLeadAfter = (await raw('GET', `/api/leads/${aOnlyLead}`, 'AOwner')).data;
  expect(aLeadAfter.name === aLeadBefore.name && !JSON.stringify(aLeadAfter).includes('HACKED'), 'Alpha\'s lead is untouched by all of Beta\'s attempts');
  const aUserAfter = (await raw('GET', '/api/users', 'AOwner')).data.find(u => u.id === aOnlyUser);
  expect(aUserAfter && aUserAfter.is_active && !aUserAfter.name.includes('HACKED'), 'Alpha\'s user is untouched');
  const aCallsAfter = (await raw('GET', '/api/calls?limit=500', 'AOwner')).text;
  expect(!aCallsAfter.includes('HACKED'), 'Alpha\'s calls are untouched');
  const aRecAfter = await raw('GET', `/api/calls/${A.callIds[1]}/recordings`, 'AOwner');
  expect(aRecAfter.status === 200 && JSON.stringify(aRecAfter.data).includes(String(A.recId2)), 'Alpha\'s recording still exists');
  expect(A.recId2 > B.recId, `(setup: recording ${A.recId2} exists only in Alpha)`);
  const recFile = await raw('GET', `/api/calls/${A.callIds[1]}/recordings/${A.recId2}/file`, 'BOwner');
  expect(recFile.status === 404 || recFile.status === 403, `Beta cannot download Alpha's recording even by guessing the ids (got ${recFile.status})`);

  // ───────────────────────── 5. both companies hammer the API at the same time ─────────────────────────
  const started = Date.now();
  const N = 24;
  const jobs = [];
  for (let i = 1; i <= N; i++) {
    for (const t of ['A', 'B']) {
      jobs.push(raw('POST', '/api/leads', `${t}Owner`, { name: `${mark(t)} Concurrent ${i}`, phone: `${CO[t].ph}5${String(i).padStart(4, '0')}` }).then(r => ({ t, kind: 'create', r })));
      jobs.push(raw('GET', '/api/leads?limit=1000', `${t}Mgr`).then(r => ({ t, kind: 'read', r })));
      jobs.push(raw('GET', '/api/calls/stats', `${t}Ag1`).then(r => ({ t, kind: 'stats', r })));
    }
  }
  const done = await Promise.all(jobs);
  const bad = done.filter(d => (d.kind === 'create' ? d.r.status !== 201 : d.r.status !== 200));
  expect(bad.length === 0, `${jobs.length} simultaneous requests all succeeded (${bad.length} failed: ${bad.slice(0, 3).map(b => `${b.t} ${b.kind} ${b.r.status}`).join(', ')})`);
  expect(done.filter(d => d.kind === 'read').every(d => !FOREIGN[d.t].test(d.r.text)), 'no simultaneous read ever contained the other company\'s data');
  // parallel assignments (these open a database transaction each)
  const assigns = [];
  for (let i = 0; i < 12; i++) {
    for (const t of ['A', 'B']) assigns.push(raw('POST', `/api/leads/${CO[t].leadIds[i % CO[t].leadIds.length]}/assign`, `${t}Mgr`, { assigned_to: CO[t].userIds[i % 2 ? 'Ag1' : 'Ag2'] }).then(r => ({ t, r })));
  }
  const asgDone = await Promise.all(assigns);
  expect(asgDone.every(a => a.r.status === 200 || a.r.status === 201), `parallel assignments (database transactions) all succeed (${asgDone.filter(a => ![200, 201].includes(a.r.status)).map(a => a.r.status).join(',') || 'ok'})`);
  // parallel sign-ins land in the right company
  const logins = await Promise.all(['A', 'B'].flatMap(t => ['ag1', 'ag2', 'mgr'].map(k => rawLogin(`${k}@${CO[t].domain}`).then(r => ({ t, r })))));
  expect(logins.every(l => l.r.status === 200 && l.r.data.workspace.name === CO[l.t].name), 'simultaneous sign-ins each land in the right company');
  const afterA = await raw('GET', '/api/leads?limit=1000', 'AOwner');
  const afterB = await raw('GET', '/api/leads?limit=1000', 'BOwner');
  const rowsA = afterA.data.leads || afterA.data.rows || afterA.data; const rowsB = afterB.data.leads || afterB.data.rows || afterB.data;
  expect(rowsA.length === expectLeads.A + N && rowsB.length === expectLeads.B + N, `after the storm each company has exactly its own leads (Alpha ${rowsA.length}/${expectLeads.A + N}, Beta ${rowsB.length}/${expectLeads.B + N})`);
  expect(rowsA.every(l => String(l.name).includes(mark('A'))) && rowsB.every(l => String(l.name).includes(mark('B'))), 'and not one lead landed in the wrong company');
  expect(Date.now() - started < 90000, `the stress run finished in time (${Math.round((Date.now() - started) / 1000)}s, no deadlock)`);

  // the platform owner's numbers match reality
  const plat = await call('e2e-platform-list', 'GET', '/api/platform/customers', PL);
  const pa = plat.data.find(c => c.id === A.id); const pb = plat.data.find(c => c.id === B.id);
  expect(pa.leads === rowsA.length && pb.leads === rowsB.length, `the Customers console shows the true lead counts (${pa.leads}/${rowsA.length}, ${pb.leads}/${rowsB.length})`);
  expect(pa.users === 2 + A.agents && pb.users === 2 + B.agents && pa.effective_plan === 'premium_plus' && pb.effective_plan === 'free', 'and the true user counts and plans');

  // ───────────────────────── 6. suspend one company, delete it, the other carries on ─────────────────────────
  await J('e2e-A-suspend', 'POST', `/api/platform/customers/${A.id}/suspend`, {}, PL);
  const during = await Promise.all([
    raw('GET', '/api/leads?limit=1000', 'AOwner'), raw('GET', '/api/leads?limit=1000', 'AMgr'),
    raw('GET', '/api/leads?limit=1000', 'BOwner'), raw('GET', '/api/leads?limit=1000', 'BMgr'),
  ]);
  expect(during[0].status === 403 && during[1].status === 403, 'Alpha is locked out while suspended');
  expect(during[2].status === 200 && during[3].status === 200, 'Beta is not affected by Alpha being suspended');
  await J('e2e-A-resume', 'POST', `/api/platform/customers/${A.id}/resume`, {}, PL);
  expect((await raw('GET', '/api/leads?limit=1000', 'AOwner')).status === 200, 'Alpha is back after resuming');

  const delA = await J('e2e-A-delete', 'DELETE', `/api/platform/customers/${A.id}`, { confirm: A.slug }, PL);
  expect(delA.status === 200, 'Alpha is deleted');
  expect((await raw('GET', '/api/leads?limit=1000', 'AOwner')).status === 401, 'Alpha\'s sessions stop working');
  const bAfter = await raw('GET', '/api/leads?limit=1000', 'BOwner');
  const bRows = bAfter.data.leads || bAfter.data.rows || bAfter.data;
  expect(bAfter.status === 200 && bRows.length === rowsB.length, `Beta keeps every one of its ${rowsB.length} leads after Alpha is deleted`);
  const bCalls = await raw('GET', '/api/calls?limit=500', 'BOwner');
  expect(bCalls.status === 200 && (bCalls.data.calls || bCalls.data.rows || bCalls.data).length === B.calls + 2, 'and its calls');
  const bRec = await raw('GET', `/api/calls/${B.callIds[0]}/recordings`, 'BOwner');
  expect(bRec.status === 200 && JSON.stringify(bRec.data).includes(String(B.recId)), 'and its recording');
  const reborn = await J('e2e-A-recreate', 'POST', '/api/platform/customers', { name: 'Alpha Again', owner_email: `owner@${A.domain}`, owner_name: 'Alpha Again' }, { ...PL, save: { alpha2: d => d.id } });
  expect(reborn.status === 201, 'Alpha\'s email addresses are free again');
  const fresh = await login('e2e-A2-login', `owner@${A.domain}`);
  const freshLeads = await raw('GET', '/api/leads?limit=1000', null);
  void freshLeads;
  tokens.A2Owner = fresh.data.access_token;
  const freshList = await raw('GET', '/api/leads?limit=1000', 'A2Owner');
  expect((freshList.data.leads || freshList.data.rows || freshList.data).length === 0, 'a re-created company starts completely empty (none of the old Alpha data came back)');

  // tidy up so later runs start clean: remove both test companies
  await J('e2e-A2-delete', 'DELETE', `/api/platform/customers/${vars.alpha2}`, { confirm: 'alpha-again' }, PL);
  await J('e2e-B-delete', 'DELETE', `/api/platform/customers/${B.id}`, { confirm: B.slug }, PL);
  await sleep(50);
  const finalList = await call('e2e-final-list', 'GET', '/api/platform/customers', PL);
  expect(!finalList.data.some(c => c.id === A.id || c.id === B.id || c.id === vars.alpha2), 'both test companies are gone');
};
