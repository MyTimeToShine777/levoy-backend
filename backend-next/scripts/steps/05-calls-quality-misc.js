// Calls, recordings, QA reviews + agent quality, reports, profile/settings,
// WhatsApp templates, notifications, team analytics, exports, system routes.
module.exports = async ({ vars, call }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });
  const iso = (offsetMin) => new Date(Date.now() - offsetMin * 60000).toISOString();
  // a few bytes that look like an m4a container; content only matters for size/type checks
  const audio = Buffer.from('....ftypM4A ' + 'x'.repeat(200));
  const rec = (name, type = 'audio/mp4', fields = {}) => ({ fileField: 'recording', fields, file: { name, content: audio, type } });

  // ── calls ──
  await J('call-nophone', 'POST', '/api/calls', {}, { as: 'agent1' });
  await J('call-a1', 'POST', '/api/calls', { phone_number: '9876500001', direction: 'outgoing', status: 'connected', duration_seconds: 120, timestamp: iso(30), notes: 'good call' }, { as: 'agent1', save: { callA1: d => d.id } });
  await J('call-a1-missed', 'POST', '/api/calls', { phone_number: '9876500009', direction: 'incoming', status: 'missed', duration: 0, timestamp: iso(20) }, { as: 'agent1', save: { callA1m: d => d.id } });
  await J('call-a2', 'POST', '/api/calls', { phone_number: '9876500002', direction: 'outgoing', status: 'connected', duration_seconds: 45, timestamp: iso(10) }, { as: 'agent2', save: { callA2: d => d.id } });
  await J('call-admin', 'POST', '/api/calls', { phone_number: '9876500003', direction: 'incoming', status: 'rejected', timestamp: iso(5), is_pinned: true }, { as: 'admin', save: { callAd: d => d.id } });
  await J('calls-batch-bad', 'POST', '/api/calls/batch', {}, { as: 'agent1' });
  await J('calls-batch', 'POST', '/api/calls/batch', { events: [{ phone_number: '9000000001', status: 'connected', duration_seconds: 10, timestamp: iso(60) }, { phone_number: '9000000002', direction: 'incoming', status: 'missed', timestamp: iso(55) }] }, { as: 'agent1' });
  await call('calls-list-admin', 'GET', '/api/calls');
  await call('calls-list-agent', 'GET', '/api/calls', { as: 'agent1' });
  await call('calls-list-direction', 'GET', '/api/calls?direction=incoming');
  await call('calls-list-status', 'GET', '/api/calls?status=connected');
  await call('calls-list-phone', 'GET', '/api/calls?phone=9876500');
  await call('calls-list-pinned', 'GET', '/api/calls?pinned=true');
  await call('calls-list-limit', 'GET', '/api/calls?limit=2&offset=1');
  await call('calls-list-dates', 'GET', '/api/calls?date_from=2020-01-01&date_to=2099-01-01');
  await call('calls-list-dates-none', 'GET', '/api/calls?date_from=2099-01-01');
  await call('calls-stats-admin', 'GET', '/api/calls/stats');
  await call('calls-stats-agent', 'GET', '/api/calls/stats', { as: 'agent1' });
  await J('call-pin', 'PUT', '/api/calls/{callA1}/pin', { is_pinned: true }, { as: 'agent1' });
  await call('call-pin-q', 'PUT', '/api/calls/{callA1}/pin?pinned=false', { as: 'agent1' });
  await J('call-pin-other', 'PUT', '/api/calls/{callA2}/pin', { is_pinned: true }, { as: 'agent1' });
  await J('call-pin-404', 'PUT', '/api/calls/99999/pin', { is_pinned: true });
  await J('call-notes', 'PUT', '/api/calls/{callA1}/notes', { notes: 'updated note' }, { as: 'agent1' });
  await J('call-notes-other', 'PUT', '/api/calls/{callA2}/notes', { notes: 'x' }, { as: 'agent1' });
  await J('call-notes-404', 'PUT', '/api/calls/99999/notes', { notes: 'x' });

  // ── recordings ──
  await call('rec-nofile', 'POST', '/api/calls/{callA1}/recordings', { as: 'agent1', form: { fields: {} } });
  await call('rec-badmime', 'POST', '/api/calls/{callA1}/recordings', { as: 'agent1', form: rec('x.php', 'application/x-php') });
  await call('rec-nocall', 'POST', '/api/calls/99999/recordings', { as: 'agent1', form: rec('x.m4a') });
  await call('rec-other-call', 'POST', '/api/calls/{callA2}/recordings', { as: 'agent1', form: rec('x.m4a') });
  await call('rec-upload', 'POST', '/api/calls/{callA1}/recordings', { as: 'agent1', form: rec('call.m4a', 'audio/mp4', { duration: '118' }), save: { recId: d => d.id } });
  await call('rec-upload-manager', 'POST', '/api/calls/{callA2}/recordings', { as: 'manager', form: rec('call2.m4a', 'audio/mp4'), save: { recId2: d => d.id } });
  await call('rec-list', 'GET', '/api/calls/{callA1}/recordings', { as: 'agent1' });
  await call('rec-list-other', 'GET', '/api/calls/{callA2}/recordings', { as: 'agent1' });
  await call('rec-list-404', 'GET', '/api/calls/99999/recordings');
  await call('rec-file', 'GET', '/api/calls/{callA1}/recordings/{recId}/file', { as: 'agent1' });
  await call('rec-file-other', 'GET', '/api/calls/{callA2}/recordings/{recId2}/file', { as: 'agent1' });
  await call('rec-file-404', 'GET', '/api/calls/{callA1}/recordings/99999/file');
  await call('rec-all-admin', 'GET', '/api/recordings');
  await call('rec-all-agent', 'GET', '/api/recordings', { as: 'agent1' });
  await call('rec-all-filter', 'GET', '/api/recordings?phone=9876500&user_id={agent2Id}&limit=5');
  await call('calls-list-with-rec', 'GET', '/api/calls?limit=3');
  await call('rec-delete-other', 'DELETE', '/api/recordings/{recId2}', { as: 'agent1' });
  await call('rec-delete', 'DELETE', '/api/recordings/{recId}', { as: 'agent1' });
  await call('rec-delete-404', 'DELETE', '/api/recordings/99999');
  await call('uploads-direct', 'GET', '/uploads/recordings/anything.m4a');

  // ── QA reviews + agent quality ──
  const full = { Opening: 4, Discovery: 3, Resolution: 5, Communication: 4, Compliance: 5, Closing: 3 };
  await J('rev-agent', 'POST', '/api/calls/{callA1}/reviews', { scores: full }, { as: 'agent1' });
  await J('rev-404', 'POST', '/api/calls/99999/reviews', { scores: full }, { as: 'manager' });
  await J('rev-noscores', 'POST', '/api/calls/{callA1}/reviews', {}, { as: 'manager' });
  await J('rev-badscore', 'POST', '/api/calls/{callA1}/reviews', { scores: { ...full, Opening: 9 } }, { as: 'manager' });
  await J('rev-unknown', 'POST', '/api/calls/{callA1}/reviews', { scores: { ...full, Banter: 3 } }, { as: 'manager' });
  await J('rev-missing', 'POST', '/api/calls/{callA1}/reviews', { scores: { Opening: 4 } }, { as: 'manager' });
  await J('rev-badagent', 'POST', '/api/calls/{callA1}/reviews', { scores: full, agent_id: 99999 }, { as: 'manager' });
  await J('rev-ok', 'POST', '/api/calls/{callA1}/reviews', { scores: { opening: 4, ' discovery ': 3, RESOLUTION: 5, communication: 4, compliance: 5, closing: 3 }, notes: 'solid', overall_score: 100 }, { as: 'manager', save: { revId: d => d.id } });
  await J('rev-violation', 'POST', '/api/calls/{callA2}/reviews', { scores: full, compliance_violation: true, notes: 'breach' }, { as: 'manager', save: { revId2: d => d.id } });
  await J('rev-low', 'POST', '/api/calls/{callA1m}/reviews', { scores: { Opening: 1, Discovery: 2, Resolution: 2, Communication: 3, Compliance: 4, Closing: 1 } }, { as: 'admin' });
  await call('rev-get', 'GET', '/api/reviews/{revId}');
  await call('rev-get-own', 'GET', '/api/reviews/{revId}', { as: 'agent1' });
  await call('rev-get-other', 'GET', '/api/reviews/{revId2}', { as: 'agent1' });
  await call('rev-get-404', 'GET', '/api/reviews/99999');
  await call('perf-agent', 'GET', '/api/agents/performance', { as: 'agent1' });
  await call('perf-admin', 'GET', '/api/agents/performance');
  await call('perf-manager', 'GET', '/api/agents/performance', { as: 'manager' });
  await call('quality-self', 'GET', '/api/agents/{agent1Id}/quality', { as: 'agent1' });
  await call('quality-other', 'GET', '/api/agents/{agent2Id}/quality', { as: 'agent1' });
  await call('quality-admin', 'GET', '/api/agents/{agent1Id}/quality');
  await call('quality-manager-inteam', 'GET', '/api/agents/{agent1Id}/quality', { as: 'manager' });
  await call('quality-manager-outteam', 'GET', '/api/agents/{agent3Id}/quality', { as: 'manager' });
  await call('quality-404', 'GET', '/api/agents/99999/quality');
  await call('leaderboard', 'GET', '/api/quality/leaderboard');
  await call('leaderboard-agent', 'GET', '/api/quality/leaderboard', { as: 'agent1' });

  // ── reports ──
  await call('report-daily', 'GET', '/api/reports/daily?days=7');
  await call('report-daily-agent', 'GET', '/api/reports/daily?days=3', { as: 'agent1' });
  await call('report-email', 'POST', '/api/reports/generate-email', { body: {} });
  await call('report-email-agent', 'POST', '/api/reports/generate-email', { body: {}, as: 'agent1' });

  // ── profile + settings ──
  await call('me-get', 'GET', '/api/users/me', { as: 'agent1' });
  await J('me-put', 'PUT', '/api/users/me', { name: 'Asha T', phone: '9111111111' }, { as: 'agent1' });
  await J('me-put-dup-email', 'PUT', '/api/users/me', { email: 'agent2@test.local' }, { as: 'agent1' });
  await J('me-put-email', 'PUT', '/api/users/me', { email: 'asha.new@test.local' }, { as: 'agent1' });
  await J('me-put-back', 'PUT', '/api/users/me', { email: 'agent1@test.local' }, { as: 'agent1' });
  await call('avatar-nofile', 'POST', '/api/users/me/avatar', { as: 'agent1', form: { fields: {} } });
  await call('avatar', 'POST', '/api/users/me/avatar', { as: 'agent1', form: { fileField: 'avatar', fields: {}, file: { name: 'me.png', content: Buffer.from('89504e470d0a1a0a', 'hex'), type: 'image/png' } } });
  await call('settings-get', 'GET', '/api/user-settings', { as: 'agent1' });
  await J('settings-put-bad', 'PUT', '/api/user-settings', {}, { as: 'agent1' });
  await J('settings-put', 'PUT', '/api/user-settings', { settings: { time_format: '24h', theme: 'dark', n: 5 } }, { as: 'agent1' });
  await call('settings-get2', 'GET', '/api/user-settings', { as: 'agent1' });
  await call('me-get2', 'GET', '/api/users/me', { as: 'agent1' });

  // ── whatsapp templates ──
  await J('tpl-bad', 'POST', '/api/whatsapp-templates', { name: 'x' }, { as: 'agent1' });
  await J('tpl-create', 'POST', '/api/whatsapp-templates', { name: 'Intro', category: 'sales', content: 'Hi ##1##' }, { as: 'agent1', save: { tplId: d => d.id } });
  await J('tpl-create-vars', 'POST', '/api/whatsapp-templates', { name: 'With vars', content: 'Hi ##name##', variables: ['name'] }, { as: 'agent1' });
  await call('tpl-list', 'GET', '/api/whatsapp-templates', { as: 'agent1' });
  await J('tpl-put', 'PUT', '/api/whatsapp-templates/{tplId}', { content: 'Hello ##1##', is_active: false }, { as: 'agent1' });
  await J('tpl-put-empty', 'PUT', '/api/whatsapp-templates/{tplId}', {}, { as: 'agent1' });
  await call('tpl-delete', 'DELETE', '/api/whatsapp-templates/{tplId}', { as: 'agent1' });
  await call('tpl-list2', 'GET', '/api/whatsapp-templates', { as: 'agent1' });

  // ── notifications ──
  await call('notif-list', 'GET', '/api/notifications', { as: 'agent1' });
  await call('notif-read', 'PUT', '/api/notifications/1/read', { as: 'agent1', body: {} });
  await call('notif-read-all', 'PUT', '/api/notifications/read-all', { as: 'agent1', body: {} });
  await call('notif-delete', 'DELETE', '/api/notifications/1', { as: 'agent1' });

  // ── team analytics ──
  await call('team-analytics', 'GET', '/api/teams/{teamId}/analytics', { as: 'manager' });
  await call('team-analytics-member', 'GET', '/api/teams/{teamId}/analytics', { as: 'agent1' });
  await call('team-analytics-nonmember', 'GET', '/api/teams/{teamId}/analytics', { as: 'agent3' });
  await call('team-analytics-404', 'GET', '/api/teams/99999/analytics');

  // ── exports ──
  await J('exp-notype', 'POST', '/api/exports', {});
  await J('exp-summary', 'POST', '/api/exports', { type: 'calls_summary', params: {} });
  await J('exp-calls', 'POST', '/api/exports', { type: 'calls', params: { limit: 50 } });
  await J('exp-calls-noparams', 'POST', '/api/exports', { type: 'calls' });
  await J('exp-leads', 'POST', '/api/exports', { type: 'leads', params: {} });
  await J('exp-pipeline', 'POST', '/api/exports', { type: 'leads_pipeline', params: {} });
  await J('exp-unknown', 'POST', '/api/exports', { type: 'weird', params: {} });
  await J('exp-injection', 'POST', '/api/exports', { type: 'calls', params: { order: 'id; DROP TABLE call_events--', dir: 'DESC' } });
  await call('exp-list', 'GET', '/api/exports');
  await call('exp-file-404', 'GET', '/api/exports/99999/file');

  // ── system ──
  await call('sys-health', 'GET', '/health', { as: null });
  await call('sys-api', 'GET', '/api', { as: null });
  await call('sys-root-json', 'GET', '/', { as: null });
  await call('sys-version', 'GET', '/api/version', { as: null });
  await call('sys-unknown', 'GET', '/api/does-not-exist', { as: null });
};
