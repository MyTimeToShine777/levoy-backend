// Sign-in edge cases that need their own users, so they run last and do not
// disturb the lists and counts recorded by the earlier steps.
module.exports = async ({ call, expect, fake }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });

  await J('otp95-create-down', 'POST', '/api/users', { email: 'down-user@test.local', name: 'Down User', role: 'agent' });
  await J('otp95-create-limited', 'POST', '/api/users', { email: 'limited-user@test.local', name: 'Limited User', role: 'agent' });

  // medivoy.api is down: the user is told, and is not made to wait out the cooldown
  const d1 = await J('otp95-send-outage', 'POST', '/api/auth/send-otp', { email: 'down-user@test.local' }, { as: null });
  expect(d1.status === 502, 'a medivoy outage is reported as 502');
  const d2 = await J('otp95-send-outage-again', 'POST', '/api/auth/send-otp', { email: 'down-user@test.local' }, { as: null });
  expect(d2.status === 502, 'a failed send does not start the resend cooldown');
  const dv = await J('otp95-verify-outage', 'POST', '/api/auth/verify-otp', { email: 'down-user@test.local', otp: '123456' }, { as: null });
  expect(dv.status === 502, 'verify during an outage is 502, not a wrong-code error');

  // medivoy.api rate-limits the address: surfaced as 429
  const r1 = await J('otp95-send-limited', 'POST', '/api/auth/send-otp', { email: 'limited-user@test.local' }, { as: null });
  expect(r1.status === 429, 'a medivoy rate-limit is surfaced as 429');

  // email is matched case-insensitively and whitespace-trimmed
  const before = fake.sent.length;
  await J('otp95-send-mixed-case', 'POST', '/api/auth/send-otp', { email: ' Manager@Test.Local ' }, { as: null });
  expect(fake.sent.length === before + 1 && fake.sent[fake.sent.length - 1] === 'manager@test.local', 'email is normalised before it is sent on');

  // delete-my-account now confirms by typing your own email
  await J('otp95-delete-no-confirm', 'DELETE', '/api/users/me', {}, { as: 'agent2' });
  await J('otp95-delete-wrong-confirm', 'DELETE', '/api/users/me', { email: 'someone@else.local' }, { as: 'agent2' });
};
