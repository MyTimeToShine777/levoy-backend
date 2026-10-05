// Auth (emailed-code sign-in), users, capacity, invitations, teams, audit-log.
module.exports = async ({ tokens, vars, call, login, expect, fake }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });

  await call('regstatus', 'GET', '/api/auth/registration-status', { as: null });
  // Passwords are gone: the old endpoints no longer exist.
  const reg = await J('register-removed', 'POST', '/api/auth/register', { email: 'x@x.com', password: 'secret1', name: 'X' }, { as: null });
  expect(reg.status === 404, 'password register endpoint is gone');
  const oldLogin = await J('login-password-removed', 'POST', '/api/auth/login', { email: 'admin@test.local', password: 'Admin#12345' }, { as: null });
  expect(oldLogin.status === 404, 'password login endpoint is gone');

  // -- sign in by emailed code --
  const sb = await J('otp-send-badbody', 'POST', '/api/auth/send-otp', { email: 'nope' }, { as: null });
  expect(sb.status === 400, 'send-otp rejects a malformed email');
  const su = await J('otp-send-unknown', 'POST', '/api/auth/send-otp', { email: 'ghost@test.local' }, { as: null });
  expect(su.status === 200, 'send-otp answers the same for an unknown address');
  expect(!fake.sent.includes('ghost@test.local'), 'an unknown address never reaches medivoy.api');
  const vb = await J('otp-verify-badbody', 'POST', '/api/auth/verify-otp', { email: 'admin@test.local', otp: '12' }, { as: null });
  expect(vb.status === 400, 'verify-otp needs a 6-digit code');
  const vu = await J('otp-verify-unknown', 'POST', '/api/auth/verify-otp', { email: 'ghost@test.local', otp: '123456' }, { as: null });
  expect(vu.status === 400, 'verify-otp refuses an unknown address');
  await J('otp-verify-before-send', 'POST', '/api/auth/verify-otp', { email: 'admin@test.local', otp: '123456' }, { as: null });
  const s1 = await J('otp-send-admin', 'POST', '/api/auth/send-otp', { email: 'admin@test.local' }, { as: null });
  expect(s1.status === 200 && s1.data.resend_in > 0 && fake.sent.includes('admin@test.local'), 'a real user gets a code requested');
  const s2 = await J('otp-send-admin-cooldown', 'POST', '/api/auth/send-otp', { email: 'admin@test.local' }, { as: null });
  expect(s2.status === 429, 'asking again inside the cooldown is refused');
  const sx = await J('otp-send-unknown-cooldown', 'POST', '/api/auth/send-otp', { email: 'ghost@test.local' }, { as: null });
  expect(sx.status === 429, 'the cooldown applies to unknown addresses too (no account oracle)');
  const vw = await J('otp-verify-wrong', 'POST', '/api/auth/verify-otp', { email: 'admin@test.local', otp: '000000' }, { as: null });
  expect(vw.status === 400, 'a wrong code is refused');
  const l = await login('login-admin', 'admin@test.local');
  expect(l.status === 200 && l.data.access_token && l.data.user.role === 'admin', 'admin signs in with the code');
  tokens.admin = l.data.access_token;
  // the platform owner is a different kind of session: no customer, and it only works on /api/platform/*
  const pl = await login('login-platform', 'platform@test.local');
  expect(pl.status === 200 && pl.data.platform === true && pl.data.user.role === 'platform_admin', 'the platform owner signs in with an emailed code too');
  tokens.platform = pl.data.access_token;
  const plMe = await call('platform-me', 'GET', '/api/auth/me', { as: 'platform' });
  expect(plMe.status === 200 && plMe.data.platform === true, '/auth/me answers a platform session');
  const plLeads = await call('platform-cannot-use-workspace', 'GET', '/api/leads', { as: 'platform' });
  expect(plLeads.status === 403, 'a platform session cannot read workspace data');
  const wsPlatform = await call('workspace-cannot-use-platform', 'GET', '/api/platform/customers');
  expect(wsPlatform.status === 403, 'a workspace admin cannot use the platform console');
  await call('noauth', 'GET', '/api/auth/me', { as: null });
  tokens.nobody = 'garbage.token.value';
  await call('badtoken', 'GET', '/api/auth/me', { as: 'nobody' });
  await call('me', 'GET', '/api/auth/me');

  // users (no passwords: they sign in with a code)
  const mk = async (tag, body) => {
    const r = await J(`create-${tag}`, 'POST', '/api/users', body);
    vars[tag + 'Id'] = r.data.id;
    return r;
  };
  await J('create-bad-email', 'POST', '/api/users', { email: 'nope', name: 'x' });
  await J('create-bad-role', 'POST', '/api/users', { email: 'r@test.local', name: 'x', role: 'god' });
  const c1 = await mk('agent1', { email: 'agent1@test.local', name: 'Asha Telecaller', role: 'agent', phone: '9000000001' });
  expect(c1.status === 201 || c1.status === 200, 'admin can create a user');
  expect(!('password' in c1.data) && !('generated_password' in c1.data), 'creating a user returns no password');
  await mk('agent2', { email: 'agent2@test.local', name: 'Ravi Telecaller', role: 'agent' });
  await mk('agent3', { email: 'agent3@test.local', name: 'Meena Telecaller', role: 'agent' });
  await mk('manager', { email: 'manager@test.local', name: 'Mani Manager', role: 'manager' });
  await J('create-dup', 'POST', '/api/users', { email: 'agent1@test.local', name: 'Dup' });
  for (const [tag, email] of [['agent1', 'agent1@test.local'], ['agent2', 'agent2@test.local'], ['agent3', 'agent3@test.local'], ['manager', 'manager@test.local']]) {
    const r = await login(`login-${tag}`, email);
    tokens[tag] = r.data.access_token;
  }
  const rp = await J('admin-reset-pw-removed', 'POST', '/api/users/{agent2Id}/reset-password', {});
  expect(rp.status === 404, 'admin password reset is gone');

  await call('users-admin', 'GET', '/api/users');
  await call('users-role', 'GET', '/api/users?role=agent');
  await call('users-inactive', 'GET', '/api/users?include_inactive=true');
  await call('users-as-agent', 'GET', '/api/users', { as: 'agent1' });
  await call('users-as-manager', 'GET', '/api/users', { as: 'manager' });

  await J('patch-user', 'PATCH', '/api/users/{agent3Id}', { phone: '9000000003', name: 'Meena T' });
  await J('patch-user-self-demote', 'PATCH', '/api/users/1', { role: 'agent' });
  await J('patch-user-bad-role', 'PATCH', '/api/users/{agent3Id}', { role: 'x' });
  await J('patch-user-empty', 'PATCH', '/api/users/{agent3Id}', {});
  await J('patch-user-404', 'PATCH', '/api/users/9999', { name: 'x' });
  await J('patch-user-as-agent', 'PATCH', '/api/users/{agent3Id}', { name: 'x' }, { as: 'agent1' });
  await J('legacy-role', 'POST', '/api/users/{agent3Id}/role?role=agent', {});
  await J('legacy-role-bad', 'POST', '/api/users/{agent3Id}/role?role=zzz', {});

  // capacity
  await call('cap-get', 'GET', '/api/users/{agent1Id}/capacity');
  await call('cap-get-other', 'GET', '/api/users/{agent2Id}/capacity', { as: 'agent1' });
  await J('cap-put', 'PUT', '/api/users/{agent1Id}/capacity', { max_open_leads: 20 }, { as: 'manager' });
  await J('cap-put-bad', 'PUT', '/api/users/{agent1Id}/capacity', { max_open_leads: -1 });
  await J('cap-put-agent', 'PUT', '/api/users/{agent1Id}/capacity', { max_open_leads: 5 }, { as: 'agent1' });
  await call('cap-get-after', 'GET', '/api/users/{agent1Id}/capacity');

  // invitations
  await J('inv-bad', 'POST', '/api/invitations', { email: 'bad' });
  const inv = await J('inv-create', 'POST', '/api/invitations', { email: 'invitee@test.local', role: 'agent' }, { save: { invToken: d => d.token, invId: d => d.id } });
  await J('inv-dup', 'POST', '/api/invitations', { email: 'invitee@test.local' });
  await call('inv-list', 'GET', '/api/invitations');
  await call('inv-list-pending', 'GET', '/api/invitations?status=pending');

  await J('inv-accept-bad', 'POST', '/api/auth/accept-invite', { token: 'nope', name: 'N' }, { as: null });
  const acc = await J('inv-accept', 'POST', '/api/auth/accept-invite', { token: '{invToken}', name: 'Invitee One' }, { as: null });
  expect(acc.status === 201 && !acc.data.access_token && acc.data.user.email === 'invitee@test.local', 'accepting an invite creates the account but issues no session');
  const li = await login('login-invitee', 'invitee@test.local');
  expect(li.status === 200 && li.data.user.role === 'agent', 'the invitee then signs in with an emailed code');
  await J('inv-accept-again', 'POST', '/api/auth/accept-invite', { token: '{invToken}', name: 'Invitee One' }, { as: null });
  await J('inv-create2', 'POST', '/api/invitations', { email: 'invitee2@test.local', role: 'manager' }, { save: { invToken2: d => d.token, invId2: d => d.id } });
  await J('inv-register-token-removed', 'POST', '/api/auth/register', { token: '{invToken2}', email: 'invitee2@test.local', password: 'Invitee#456', name: 'Invitee Two' }, { as: null });
  await J('inv-create3', 'POST', '/api/invitations', { email: 'invitee3@test.local' }, { save: { invId3: d => d.id } });
  await call('inv-revoke', 'DELETE', '/api/invitations/{invId3}');
  await call('inv-revoke-again', 'DELETE', '/api/invitations/{invId3}');
  void inv;

  // the old password endpoints are gone
  for (const [name, p, body] of [
    ['chg-removed', '/api/auth/change-password', { current_password: 'a', new_password: 'Newpass#12' }],
    ['forgot-removed', '/api/auth/forgot-password', { email: 'agent1@test.local' }],
    ['reset-removed', '/api/auth/reset-password', { token: 'x', new_password: 'Newpass#12' }],
    ['admin-reset-link-removed', '/api/admin/password-reset-link', { email: 'agent1@test.local' }],
  ]) {
    const r = await J(name, 'POST', p, body, { as: name === 'admin-reset-link-removed' ? 'admin' : null });
    expect(r.status === 404, `${name}: endpoint is gone`);
  }

  // deactivate / reactivate: a deactivated user can neither get nor use a code
  await J('deactivate', 'PATCH', '/api/users/{agent3Id}', { is_active: false });
  await call('deactivated-me', 'GET', '/api/auth/me', { as: 'agent3' });
  const before = fake.sent.filter(e => e === 'agent3@test.local').length;
  await J('deactivated-send', 'POST', '/api/auth/send-otp', { email: 'agent3@test.local' }, { as: null });
  expect(fake.sent.filter(e => e === 'agent3@test.local').length === before, 'no code is requested for a deactivated user');
  const dv = await J('deactivated-verify', 'POST', '/api/auth/verify-otp', { email: 'agent3@test.local', otp: '123456' }, { as: null });
  expect(dv.status === 403, 'a deactivated user cannot sign in');
  await J('reactivate', 'PATCH', '/api/users/{agent3Id}', { is_active: true });

  // teams
  const t1 = await J('team-create', 'POST', '/api/teams', { name: 'Pharmacy Telecallers' }, { as: 'manager', save: { teamId: d => d.id } });
  await J('team-create-noname', 'POST', '/api/teams', {}, { as: 'manager' });
  await J('team-create-q', 'POST', '/api/teams?name=QueryTeam', {});
  await call('teams-admin', 'GET', '/api/teams');
  await call('teams-manager', 'GET', '/api/teams', { as: 'manager' });
  await J('team-add', 'POST', '/api/teams/{teamId}/members', { user_id: '{agent1Id}' }, { as: 'manager' });
  await J('team-add-nan', 'POST', '/api/teams/{teamId}/members', { user_id: 'abc' }, { as: 'manager' });
  await J('team-add-404', 'POST', '/api/teams/9999/members', { user_id: 1 }, { as: 'manager' });
  await J('team-add-nouser', 'POST', '/api/teams/{teamId}/members', { user_id: 9999 }, { as: 'manager' });
  await J('team-add-agent', 'POST', '/api/teams/{teamId}/members', { user_id: 1 }, { as: 'agent1' });
  await J('team-add2', 'POST', '/api/teams/{teamId}/members', { user_id: '{agent2Id}' }, { as: 'manager' });
  await J('team-add3', 'POST', '/api/teams/{teamId}/members', { user_id: '{agent3Id}' }, { as: 'admin' });
  await call('team-remove', 'DELETE', '/api/teams/{teamId}/members/{agent3Id}', { as: 'manager' });
  await call('team-remove-again', 'DELETE', '/api/teams/{teamId}/members/{agent3Id}', { as: 'manager' });
  void t1;

  await call('audit', 'GET', '/api/audit-log?limit=500');
  await call('audit-filter', 'GET', '/api/audit-log?action=user.created');
  await call('audit-agent', 'GET', '/api/audit-log', { as: 'agent1' });
};
