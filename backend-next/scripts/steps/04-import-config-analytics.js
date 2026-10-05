// Sheet-style CSV/XLSX import (preview + commit), legacy CSV import, enrichment,
// scoring config, telecaller map, analytics, call queue.
const XLSX = require('xlsx');

module.exports = async ({ vars, call }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });
  const fmt = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10); // ISO: legacy cannot load dd/mm/yyyy with day > 12

  const HEADER = ['Segment', 'Lead Assigned Date', 'Call Attempted Date', 'Tellecaller Name', 'Customer Name', 'Pharmacy Name', 'Locality / Area', 'Address', 'Phone Number', 'Email Id', 'Lead Source', 'Followup Date', 'Call Done', 'Call Status', 'Remarks', 'Priority Score', 'Tier'];
  const rows = [
    ['Cold Call', fmt(-5), fmt(-3), 'Asha Telecaller', 'Anil Kumar', 'Kumar Medicals', 'Andheri', '12 MG Road', '+91 98200 11111', 'anil@kumar.in', 'Cold Call', fmt(-1), 'Yes', 'Interested', 'wants demo', '999', 'Hot'],
    ['Cold Call', fmt(-5), '', 'Ravi Telecaller', 'Bhavna Shah', 'Shah Pharmacy', 'Bandra', '5 Hill Rd', '9820022222', 'bhavna@shah.in', 'Cold Call', fmt(2), 'No', '', '', '', ''],
    ['Social Media Campaign', fmt(-2), fmt(-1), 'Unknown Person', 'Chetan Rao', 'Rao Chemists', 'Powai', '', '98200 33333', '', 'Instagram', '', 'Yes', 'Not Answered', '', '', ''],
    ['Cold Call', fmt(-1), '', '', 'Dup Phone Guy', 'Other Shop', 'Juhu', '', '09820011111', '', 'Cold Call', '', '', 'Under Consideration', '', '', ''],
    ['WhatsApp Campaign', fmt(-1), '', 'Meena Telecaller', '', 'Only Pharmacy Name', 'Colaba', '', '9820044444', '', 'WhatsApp', fmt(0), '', 'Demo Done', '', '', ''],
    ['Cold Call', '', '', '', '', '', '', '', '98200 55555', '', '', '', '', '', '', '', ''],
    ['Cold Call', '', '', '', 'Bad Phone', 'Bad Phone Store', 'Thane', '', '12345', 'not-an-email', '', '', '', 'Converted', '', '', ''],
    ['Cold Call', '', '', 'Asha Telecaller', 'Weird Status', 'Weird Store', 'Thane', '', '9820066666', '', '', '', '', 'Mystery Status', '', '', ''],
  ];
  const csvEsc = v => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = [HEADER, ...rows].map(r => r.map(csvEsc).join(',')).join('\n');

  const file = (name, content, type = 'text/csv') => ({ file: { name, content, type } });

  // ── legacy-shape config reads ──
  await call('status-rules', 'GET', '/api/leads/status-rules');
  await call('scoring-get', 'GET', '/api/leads/scoring-settings');
  await J('scoring-put-agent', 'PUT', '/api/leads/scoring-settings', { settings: { plan_price: 1 } }, { as: 'agent1' });
  await J('scoring-put-bad', 'PUT', '/api/leads/scoring-settings', { settings: { bogus: 1 } });
  await J('scoring-put-neg', 'PUT', '/api/leads/scoring-settings', { settings: { plan_price: -5 } });
  await J('scoring-put', 'PUT', '/api/leads/scoring-settings', { settings: { plan_price: 499, daily_call_target: 60 } });
  await J('status-rule-agent', 'POST', '/api/leads/status-rules', { call_status: 'X' }, { as: 'agent1' });
  await J('status-rule-none', 'POST', '/api/leads/status-rules', {});
  await J('status-rule-save', 'POST', '/api/leads/status-rules', { call_status: 'Site Visit Booked', base_priority: 70, active_pipeline: true, win_prob: 0.2, next_action: 'Visit', reached: true, interested_plus: true, sort_order: 50 });
  await call('status-rule-delete-fallback', 'DELETE', '/api/leads/status-rules/notcalledyet');
  await call('status-rule-delete', 'DELETE', '/api/leads/status-rules/sitevisitbooked');
  await call('status-rule-delete-404', 'DELETE', '/api/leads/status-rules/sitevisitbooked');

  // ── telecaller map (before import so bindings apply) ──
  await call('tmap-get', 'GET', '/api/leads/telecaller-map');
  await J('tmap-agent', 'POST', '/api/leads/telecaller-map', { name: 'Unknown Person', user_id: '{agent2Id}' }, { as: 'agent1' });
  await J('tmap-noname', 'POST', '/api/leads/telecaller-map', {}, { as: 'manager' });
  await J('tmap-nouser', 'POST', '/api/leads/telecaller-map', { name: 'Ghost', user_id: 99999 }, { as: 'manager' });
  await J('tmap-nan', 'POST', '/api/leads/telecaller-map', { name: 'Ghost', user_id: 'abc' }, { as: 'manager' });

  // ── preview ──
  await call('imp-preview-nofile', 'POST', '/api/leads/import/preview', { form: { fields: {} } });
  await call('imp-preview-onerow', 'POST', '/api/leads/import/preview', { form: { fields: {}, ...file('one.csv', 'Name,Phone\n') } });
  const pv = await call('imp-preview', 'POST', '/api/leads/import/preview', { form: { fields: {}, ...file('sheet.csv', csv) }, save: { pvToken: d => d.preview_token } });
  void pv;
  await call('imp-commit-nothing', 'POST', '/api/leads/import/commit', { body: {} });
  await call('imp-commit-badtoken', 'POST', '/api/leads/import/commit', { body: { preview_token: 'nope' } });
  // commit via token with a corrected mapping that double-maps a column
  await J('imp-commit-token', 'POST', '/api/leads/import/commit', { preview_token: '{pvToken}', mapping: { customer_name: 'Customer Name', pharmacy_name: 'Pharmacy Name', phone_number: 'Phone Number', locality: 'Locality / Area', telecaller_name: 'Tellecaller Name', call_status: 'Call Status', followup_date: 'Followup Date', call_attempted_date: 'Call Attempted Date', segment: 'Segment', lead_source: 'Lead Source', email_id: 'Email Id', address: 'Address', call_done: 'Call Done', lead_assigned_date: 'Lead Assigned Date', remarks: 'Customer Name', ghost_field: 'Nope' } });
  // re-import the same file directly (idempotency / upsert path)
  await call('imp-commit-file-again', 'POST', '/api/leads/import/commit', { form: { fields: {}, ...file('sheet.csv', csv) } });

  // xlsx variant
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ['Cold Call', fmt(-1), '', 'Ravi Telecaller', 'Xlsx Person', 'Xlsx Pharmacy', 'Dadar', '', '9820077777', 'x@y.in', 'Cold Call', fmt(1), '', 'Interested', '', '', '']]), 'Leads');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Other', 'Tab'], ['ignored', 'row']]), 'Side Tab');
  const xbuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  await call('imp-xlsx-preview', 'POST', '/api/leads/import/preview', { form: { fields: {}, ...file('sheet.xlsx', xbuf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') } });
  await call('imp-xlsx-badsheet', 'POST', '/api/leads/import/preview', { form: { fields: { sheet: 'Nope' }, ...file('sheet.xlsx', xbuf) } });
  await call('imp-xlsx-commit', 'POST', '/api/leads/import/commit', { form: { fields: {}, ...file('sheet.xlsx', xbuf) } });
  await call('imp-xlsx-commit-sheet2', 'POST', '/api/leads/import/commit', { form: { fields: { sheet: 'Side Tab' }, ...file('sheet.xlsx', xbuf) } });

  // telecaller map after import
  await call('tmap-get2', 'GET', '/api/leads/telecaller-map');
  await J('tmap-bind', 'POST', '/api/leads/telecaller-map', { name: 'Unknown Person', user_id: '{agent2Id}' }, { as: 'manager' });
  await J('tmap-unbind', 'POST', '/api/leads/telecaller-map', { name: 'Unknown Person', user_id: null }, { as: 'manager' });
  await J('tmap-bind-again', 'POST', '/api/leads/telecaller-map', { name: 'Unknown Person', user_id: '{agent2Id}' }, { as: 'manager' });
  await call('tmap-get3', 'GET', '/api/leads/telecaller-map');

  // ── legacy CSV import ──
  await call('legacy-import-nofile', 'POST', '/api/leads/import', { form: { fields: {} } });
  await call('legacy-import-nocols', 'POST', '/api/leads/import', { form: { fields: {}, ...file('a.csv', 'foo,bar\n1,2') } });
  await call('legacy-import-onerow', 'POST', '/api/leads/import', { form: { fields: {}, ...file('a.csv', 'name,phone\n') } });
  await call('legacy-import', 'POST', '/api/leads/import', { form: { fields: {}, ...file('legacy.csv', 'Name,Mobile,Email,Source,Priority,Status,Notes\nLegacy One,9877000001,l1@x.in,web,high,new,hello\nLegacy Two,9877000002,bad,web,,,\n,9877000003,,,,,\nLegacy Four,12,,,,,\nLegacy Five,9877000005,,,weird,,\nLegacy Six,9877000006,,,,zzz,\nLegacy One Again,+91 9877000001,,,,contacted,updated\n') } });

  // ── enrichment ──
  await call('enrich-preview', 'GET', '/api/leads/enrichment/preview?limit=50');
  await call('enrich-preview-agent', 'GET', '/api/leads/enrichment/preview', { as: 'agent1' });
  await J('enrich-apply-agent', 'POST', '/api/leads/enrichment/apply', {}, { as: 'agent1' });
  await J('enrich-apply', 'POST', '/api/leads/enrichment/apply', {}, { as: 'manager' });

  // ── analytics + queue ──
  await call('an-command', 'GET', '/api/analytics/command-center');
  await call('an-command-agent', 'GET', '/api/analytics/command-center', { as: 'agent1' });
  await call('an-daily', 'GET', '/api/analytics/daily-report');
  await call('an-area', 'GET', '/api/analytics/area-analysis');
  await call('queue', 'GET', '/api/leads/call-queue');
  await call('queue-closed', 'GET', '/api/leads/call-queue?include_closed=true&limit=50');
  await call('queue-telecaller', 'GET', '/api/leads/call-queue?telecaller=Asha%20Telecaller');
  await call('queue-agent', 'GET', '/api/leads/call-queue', { as: 'agent1' });
  await call('leads-list-after-import', 'GET', '/api/leads?limit=1000');
};
