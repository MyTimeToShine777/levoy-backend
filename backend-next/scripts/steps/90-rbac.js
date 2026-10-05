// RBAC: role-based login payload, registry, admin console API, role profiles,
// custom roles, per-user overrides, API-level enforcement, lock-out protection.
// New-feature scenarios (skipped by --only-legacy); they assert as well as record.
module.exports = async ({ vars, tokens, call, expect, login }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });
  const pages = r => (r.data && (r.data.permissions || (r.data.effective && r.data.effective.pages))) || {};

  // ── login / me carry permissions + landing page ──
  const la = await login('rbac-login-agent', 'agent1@test.local');
  expect(la.status === 200, 'agent login should succeed');
  expect(la.data.permissions && la.data.permissions.leads.view === true, 'agent sees Leads by default');
  expect(la.data.permissions.rbac.view === false, 'agent must not see Roles & Access');
  expect(la.data.permissions.users.view === false, 'agent must not see User Management');
  expect(la.data.permissions.leads.assign === false && la.data.permissions.leads.import === false, 'agent cannot assign/import by default');
  expect(la.data.home === '/', 'agent lands on dashboard by default');
  expect(la.data.permission_source === 'default', 'no stored profile -> default source');
  const ld = await login('rbac-login-admin', 'admin@test.local');
  expect(ld.data.permissions.rbac.view === true && ld.data.permissions.rbac.update === true, 'admin has full RBAC access');
  const me = await call('rbac-me-manager', 'GET', '/api/auth/me', { as: 'manager' });
  expect(me.data.permissions.rbac.view === false && me.data.permissions['command-center'].view === true, 'manager defaults: analytics yes, rbac no');

  // ── registry + console access control ──
  const reg = await call('rbac-registry-agent', 'GET', '/api/rbac/registry', { as: 'agent1' });
  expect(reg.status === 200 && reg.data.pages.length >= 15 && reg.data.actions.includes('assign'), 'registry is open to any signed-in user');
  const m = await call('rbac-matrix-admin', 'GET', '/api/rbac/matrix');
  expect(m.status === 200 && m.data.roles_detail.length === 3 && Array.isArray(m.data.custom_roles), 'admin can read the matrix');
  const m403 = await call('rbac-matrix-manager', 'GET', '/api/rbac/matrix', { as: 'manager' });
  const m403a = await call('rbac-matrix-agent', 'GET', '/api/rbac/matrix', { as: 'agent1' });
  expect(m403.status === 403 && m403a.status === 403, 'manager/agent cannot open the RBAC console');
  const noauth = await call('rbac-matrix-noauth', 'GET', '/api/rbac/matrix', { as: null });
  expect(noauth.status === 401, 'RBAC console needs auth');

  // ── role profile: hide Kanban + Follow-ups from agents ──
  const prof = await J('rbac-role-save', 'PUT', '/api/rbac/roles/agent', { permissions: { pages: {
    pipeline: { view: false }, 'follow-ups': { view: false },
    leads: { view: true, create: true, update: true, assign: true },
  } } });
  expect(prof.status === 200 && prof.data.permissions.pages.pipeline.view === false, 'role profile saved');
  const la2 = await login('rbac-login-agent-after-profile', 'agent1@test.local');
  expect(la2.data.permissions.pipeline.view === false && la2.data.permissions['follow-ups'].view === false, 'agent login reflects hidden tabs');
  expect(la2.data.permissions.leads.assign === true, 'agent granted assign on leads');
  expect(la2.data.permission_source === 'role_profile', 'source reports role_profile');
  const bad = await J('rbac-role-save-badrole', 'PUT', '/api/rbac/roles/superuser', { permissions: {} });
  expect(bad.status === 400, 'unknown role rejected');
  const junk = await J('rbac-role-save-junk', 'PUT', '/api/rbac/roles/manager', { permissions: { pages: { nonsense: { view: true }, leads: { view: true, bogus: true } } } });
  expect(junk.status === 200 && !('nonsense' in junk.data.permissions.pages) && !('bogus' in junk.data.permissions.pages.leads), 'unknown pages/actions are dropped');
  await call('rbac-role-reset-manager', 'DELETE', '/api/rbac/roles/manager');

  // ── custom role "Senior Telecaller" based on agent ──
  const cr = await J('rbac-custom-create', 'POST', '/api/rbac/custom-roles', { name: 'Senior Telecaller', description: 'Agents who may also see analytics', base_role: 'agent', permissions: { pages: { 'daily-report': { view: true, export: true }, 'command-center': { view: true } } } }, { save: { crId: d => d.id } });
  expect(cr.status === 201 && cr.data.key === 'senior_telecaller' && cr.data.base_role === 'agent', 'custom role created with slug key');
  const dup = await J('rbac-custom-dup', 'POST', '/api/rbac/custom-roles', { name: 'Senior Telecaller' });
  expect(dup.status === 400, 'duplicate custom role key rejected');
  await J('rbac-custom-noname', 'POST', '/api/rbac/custom-roles', {});
  const asg = await J('rbac-assign-custom', 'PUT', '/api/rbac/users/{agent2Id}/custom-role', { custom_role_id: '{crId}' });
  expect(asg.status === 200 && asg.data.effective.pages['command-center'].view === true, 'custom role grants command-center to the member');
  const la3 = await login('rbac-login-agent2-custom', 'agent2@test.local');
  expect(la3.data.custom_role && la3.data.custom_role.name === 'Senior Telecaller', 'login exposes the custom role');
  tokens.agent2 = la3.data.access_token;
  const cc = await call('rbac-agent2-command-center', 'GET', '/api/analytics/command-center', { as: 'agent2' });
  void cc;                                     // analytics endpoints are guarded after the leads port (see 91-rbac-enforcement)
  const del = await call('rbac-custom-delete-inuse', 'DELETE', '/api/rbac/custom-roles/{crId}');
  expect(del.status === 200 && del.data.members_detached === 1, 'deleting a custom role detaches members');
  const la4 = await login('rbac-login-agent2-detached', 'agent2@test.local');
  expect(la4.data.custom_role === null && la4.data.permissions['command-center'].view === false, 'member falls back to the role profile');

  // ── per-user override ──
  const ov = await J('rbac-user-override', 'PUT', '/api/rbac/users/{agent3Id}', { permissions: { pages: { exports: { view: false }, leads: { view: true, import: true } } } });
  expect(ov.status === 200 && ov.data.has_override === true && ov.data.effective.pages.leads.import === true, 'user override saved + effective');
  expect(ov.data.effective.source === 'user', 'source = user');
  const u3 = await call('rbac-user-get', 'GET', '/api/rbac/users/{agent3Id}');
  expect(u3.data.override.pages.exports.view === false, 'override readable');
  await call('rbac-users-list', 'GET', '/api/rbac/users');
  const rs = await call('rbac-user-reset', 'DELETE', '/api/rbac/users/{agent3Id}');
  expect(rs.data.has_override === false, 'override reset');
  await call('rbac-user-404', 'GET', '/api/rbac/users/99999');
  await J('rbac-custom-assign-bad', 'PUT', '/api/rbac/users/{agent3Id}/custom-role', { custom_role_id: 99999 });

  // ── admin lock-out protection ──
  const lock = await J('rbac-admin-lockout', 'PUT', '/api/rbac/roles/admin', { permissions: { pages: { rbac: { view: false }, users: { view: false }, dashboard: { view: false } } } });
  expect(lock.data.permissions.pages.rbac.view === true && lock.data.permissions.pages.users.view === true, 'admin keeps RBAC + Users access whatever is saved');
  const stillAdmin = await call('rbac-matrix-admin-after', 'GET', '/api/rbac/matrix');
  expect(stillAdmin.status === 200, 'admin can still open the console');
  await call('rbac-role-reset-admin', 'DELETE', '/api/rbac/roles/admin');

  // ── restore agent role defaults for later suites ──
  await call('rbac-role-reset-agent', 'DELETE', '/api/rbac/roles/agent');
  const audit = await call('rbac-audit', 'GET', '/api/audit-log?action=rbac.role_profile_saved');
  expect(audit.data.total >= 2, 'RBAC changes are audited');
  void pages;
};
