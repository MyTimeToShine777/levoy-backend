// Multi-customer isolation and the platform console. Customer #1 is the workspace every other step used; here the
// platform owner creates a second company and we prove the two can never see each other — same user ids, same
// emails, shared caches — and that subscriptions, suspension and the plan catalog work per customer.
module.exports = async ({ tokens, vars, call, login, expect, fake }) => {
  const J = (name, method, p, body, o = {}) => call(name, method, p, { body, ...o });
  const PL = { as: 'platform' };

  // ── the platform owner creates a second customer ──
  const bad = await J('mc-create-bad', 'POST', '/api/platform/customers', { name: 'x', owner_email: 'nope' }, PL);
  expect(bad.status === 400, 'a customer needs a name and a valid owner email');
  const taken = await J('mc-create-email-taken', 'POST', '/api/platform/customers', { name: 'Clash Co', owner_email: 'agent1@test.local' }, PL);
  expect(taken.status === 409, 'an email that already belongs to a workspace cannot own another one');
  const made = await J('mc-create', 'POST', '/api/platform/customers',
    { name: 'Acme Realty', owner_email: 'owner@acme.test', owner_name: 'Ada Owner' }, { ...PL, save: { acmeId: d => d.id } });
  expect(made.status === 201 && made.data.schema_name === `levoy_c${made.data.id}` && made.data.status === 'active', 'customer created in its own schema');
  const noPlatform = await J('mc-create-as-admin', 'POST', '/api/platform/customers', { name: 'Nope Ltd', owner_email: 'x@nope.test' });
  expect(noPlatform.status === 403, 'a workspace admin cannot create customers');

  // ── its owner signs in and lands in THEIR workspace ──
  const acmeLogin = await login('mc-acme-login', 'owner@acme.test');
  expect(acmeLogin.status === 200 && !acmeLogin.data.platform && acmeLogin.data.workspace.name === 'Acme Realty' && acmeLogin.data.user.role === 'admin',
    'the owner signs in with an emailed code and lands in their own workspace');
  tokens.acme = acmeLogin.data.access_token;
  const acmeMe = await call('mc-acme-me', 'GET', '/api/auth/me', { as: 'acme' });
  expect(acmeMe.data.workspace.name === 'Acme Realty', 'me names the workspace');
  const c1Me = await call('mc-c1-me', 'GET', '/api/auth/me');
  expect(c1Me.data.workspace && c1Me.data.workspace.id === 1, 'the original workspace is customer #1');

  // ── data isolation: same user ids, different data ──
  const c1Lead = await J('mc-c1-lead', 'POST', '/api/leads', { name: 'Customer One Lead', phone: '9100000001' }, { save: { c1LeadId: d => d.id } });
  const acmeLead = await J('mc-acme-lead', 'POST', '/api/leads', { name: 'Acme Lead', phone: '9200000001' }, { as: 'acme', save: { acmeLeadId: d => d.id } });
  expect(c1Lead.status === 201 && acmeLead.status === 201, 'each customer can create leads');
  expect(c1Lead.data.id === acmeLead.data.id || true, '(lead ids may coincide across customers; that is the point of the next checks)');
  const acmeList = await call('mc-acme-leads', 'GET', '/api/leads?limit=100', { as: 'acme' });
  const names = (acmeList.data.leads || acmeList.data.rows || acmeList.data || []).map(l => l.name);
  expect(acmeList.status === 200 && names.includes('Acme Lead') && !names.includes('Customer One Lead'), 'a customer lists only its own leads');
  const c1List = await call('mc-c1-leads', 'GET', '/api/leads?limit=500');
  const c1Names = (c1List.data.leads || c1List.data.rows || c1List.data || []).map(l => l.name);
  expect(c1Names.includes('Customer One Lead') && !c1Names.includes('Acme Lead'), 'the original customer never sees the new customer\'s leads');
  // read another customer's lead by id: ids can collide, so make sure the ROW is the right customer's
  const peek = await call('mc-acme-reads-c1-lead', 'GET', '/api/leads/{c1LeadId}', { as: 'acme' });
  expect(peek.status === 404 || (peek.status === 200 && peek.data.name === 'Acme Lead'), 'a lead id from another customer never returns that customer\'s lead');
  const users1 = await call('mc-c1-users', 'GET', '/api/users?include_inactive=true');
  const usersA = await call('mc-acme-users', 'GET', '/api/users', { as: 'acme' });
  expect(users1.data.length > 3 && usersA.data.length === 1 && usersA.data[0].email === 'owner@acme.test', 'user lists are per customer');
  expect(users1.data.some(u => u.id === usersA.data[0].id), 'user ids repeat across customers (so nothing may be keyed by id alone)');

  // permission cache: customer #1 customised the agent role earlier; the new customer must not inherit it
  const c1Matrix = await call('mc-c1-rbac', 'GET', '/api/rbac/matrix');
  const acmeMatrix = await call('mc-acme-rbac', 'GET', '/api/rbac/matrix', { as: 'acme' });
  const custom = m => (m.data.roles_detail.find(r => r.identifier === 'manager') || {}).customized;
  expect(typeof custom(c1Matrix) === 'boolean' && custom(acmeMatrix) === false, 'role profiles are per customer');
  const acmeCr = await J('mc-acme-custom-role', 'POST', '/api/rbac/custom-roles', { name: 'Acme Only Role', base_role: 'agent' }, { as: 'acme' });
  const c1Matrix2 = await call('mc-c1-rbac-after', 'GET', '/api/rbac/matrix');
  expect(acmeCr.status === 201 && !c1Matrix2.data.custom_roles.some(r => r.name === 'Acme Only Role'), 'a custom role made in one customer is invisible to the other');

  // ── the sign-in directory: one email, one customer ──
  const dupe = await J('mc-acme-create-dup-email', 'POST', '/api/users', { email: 'agent1@test.local', name: 'Steal', role: 'agent' }, { as: 'acme' });
  expect(dupe.status === 400, 'a customer cannot create a user with another customer\'s email');
  const dupeSelf = await J('mc-acme-rename-to-taken', 'PUT', '/api/users/me', { email: 'agent1@test.local' }, { as: 'acme' });
  expect(dupeSelf.status === 400, 'a user cannot change their email to another customer\'s address');

  // ── invitations carry their customer ──
  const inv = await J('mc-acme-invite', 'POST', '/api/invitations', { email: 'newhire@acme.test', role: 'agent' }, { as: 'acme', save: { acmeInv: d => d.token } });
  expect(inv.status === 201 && new RegExp(`^c${vars.acmeId}_`).test(inv.data.token), 'an invitation token names its customer');
  const acc = await J('mc-acme-accept', 'POST', '/api/auth/accept-invite', { token: '{acmeInv}', name: 'New Hire' }, { as: null });
  expect(acc.status === 201 && acc.data.email === 'newhire@acme.test', 'the public accept-invite finds the right customer from the token alone');
  const hire = await login('mc-acme-hire-login', 'newhire@acme.test');
  expect(hire.status === 200 && hire.data.workspace.name === 'Acme Realty' && hire.data.user.role === 'agent', 'the invitee lands in the inviting customer\'s workspace');
  const acmeUsers2 = await call('mc-acme-users-after', 'GET', '/api/users', { as: 'acme' });
  expect(acmeUsers2.data.length === 2, 'the new hire is a user of that customer only');
  const c1Users2 = await call('mc-c1-users-after', 'GET', '/api/users?include_inactive=true');
  expect(!c1Users2.data.some(u => u.email === 'newhire@acme.test'), 'and not of the other customer');

  // ── subscriptions are per customer ──
  const g = await J('mc-grant', 'POST', '/api/platform/customers/{acmeId}/subscription/grant', { plan: 'premium', months: 2, note: 'launch offer' }, PL);
  expect(g.status === 200 && g.data.plan_key === 'premium' && g.data.status === 'active', 'the platform owner grants a plan to one customer');
  const acmePlan = await call('mc-acme-plan', 'GET', '/api/plan', { as: 'acme' });
  const c1Plan = await call('mc-c1-plan', 'GET', '/api/plan');
  expect(acmePlan.data.effective_plan === 'premium' && c1Plan.data.effective_plan === 'free', 'only the customer that got Premium has it');
  const qc = await J('mc-acme-quickcall', 'POST', '/api/quick-call/dial', { number: '9000011111' }, { as: 'acme' });
  const qc1 = await J('mc-c1-quickcall', 'POST', '/api/quick-call/dial', { number: '9000011111' });
  expect(qc.status !== 402 && qc1.status === 402, 'a Premium feature opens for one customer and stays locked for the other');
  const acmeSelfActivate = await J('mc-acme-self-activate', 'POST', '/api/plan/activate', { plan: 'biz', months: 12 }, { as: 'acme' });
  expect(acmeSelfActivate.status === 403, 'a customer\'s own admin can no longer give themselves free months');

  const ext = await J('mc-extend', 'POST', '/api/platform/customers/{acmeId}/subscription/extend', { months: 1 }, PL);
  expect(ext.status === 200 && new Date(ext.data.current_period_end) > new Date(g.data.current_period_end), 'extend adds time');
  const dateSet = await J('mc-set-end', 'POST', '/api/platform/customers/{acmeId}/subscription/end-date', { date: '2031-01-15T00:00:00Z' }, PL);
  expect(dateSet.status === 200 && /^2031-01-15/.test(dateSet.data.current_period_end), 'an exact end date can be set');
  const badDate = await J('mc-set-end-bad', 'POST', '/api/platform/customers/{acmeId}/subscription/end-date', { date: 'someday' }, PL);
  expect(badDate.status === 400, 'a nonsense date is refused');
  const plus = await J('mc-change-plan', 'POST', '/api/platform/customers/{acmeId}/subscription/plan', { plan: 'premium_plus' }, PL);
  expect(plus.status === 200 && plus.data.plan_key === 'premium_plus' && /^2031-01-15/.test(plus.data.current_period_end), 'changing plan keeps the dates');
  const cancelLater = await J('mc-cancel-later', 'POST', '/api/platform/customers/{acmeId}/subscription/cancel', {}, PL);
  expect(cancelLater.status === 200 && cancelLater.data.cancel_at_period_end === true && cancelLater.data.status === 'active', 'cancel at period end keeps access until then');
  const keep = await J('mc-keep', 'POST', '/api/platform/customers/{acmeId}/subscription/keep', {}, PL);
  expect(keep.data.cancel_at_period_end === false, 'a scheduled cancellation can be undone');
  const cancelNow = await J('mc-cancel-now', 'POST', '/api/platform/customers/{acmeId}/subscription/cancel', { immediately: true }, PL);
  expect(cancelNow.data.status === 'cancelled', 'cancel now ends it');
  const afterCancel = await call('mc-acme-plan-cancelled', 'GET', '/api/plan', { as: 'acme' });
  expect(afterCancel.data.effective_plan === 'free' && afterCancel.data.status === 'cancelled', 'a cancelled customer is back on Free immediately');
  const trial = await J('mc-trial', 'POST', '/api/platform/customers/{acmeId}/subscription/trial', { plan: 'biz', days: 14 }, PL);
  expect(trial.status === 200 && trial.data.status === 'trial' && trial.data.plan_key === 'biz', 'the platform owner can start a trial of any length');
  const nothing = await J('mc-cancel-free-c1', 'POST', '/api/platform/customers/1/subscription/cancel', {}, PL);
  expect(nothing.status === 400, 'a customer on Free has nothing to cancel');
  const detail = await call('mc-detail', 'GET', '/api/platform/customers/{acmeId}', PL);
  const actions = detail.data.events.map(e => e.action);
  expect(['subscription.granted', 'subscription.extended', 'subscription.end_date_set', 'subscription.plan_changed',
    'subscription.cancel_scheduled', 'subscription.cancel_undone', 'subscription.cancelled', 'subscription.trial_started', 'customer.created']
    .every(a => actions.includes(a)), 'every change is in the history');
  expect(detail.data.admins.length === 1 && detail.data.usage.users === 2, 'the customer page shows admins and usage');

  // ── the plan catalog is editable and applies everywhere ──
  const plans = await call('mc-plans', 'GET', '/api/platform/plans', PL);
  expect(plans.data.plans.length >= 4 && plans.data.features.length >= 10, 'the catalog lists plans and the gated features');
  const cheap = await J('mc-plan-price', 'PUT', '/api/platform/plans/premium', { price_monthly: 99, tagline: 'Edited tagline' }, PL);
  expect(cheap.status === 200 && cheap.data.price_monthly === 99, 'a plan\'s price can be edited');
  const seen = await call('mc-c1-sees-price', 'GET', '/api/plan');
  expect(seen.data.catalog.find(p => p.key === 'premium').price_monthly === 99 && seen.data.catalog.find(p => p.key === 'premium').tagline === 'Edited tagline', 'customers see the edited price at once');
  await J('mc-plan-price-restore', 'PUT', '/api/platform/plans/premium', { price_monthly: 75, tagline: 'Backup, support and the browser dialler' }, PL);
  const moved = await J('mc-plan-features', 'PUT', '/api/platform/plans/premium', { features: ['ad_free', 'auto_backup', 'whatsapp_support', 'quick_call_extension', 'call_notes_tags'] }, PL);
  const noteGate = await call('mc-c1-features', 'GET', '/api/plan');
  expect(moved.status === 200 && noteGate.data.features.find(f => f.key === 'call_notes_tags').required_plan === 'premium', 'moving a feature to another plan changes what unlocks it');
  await J('mc-plan-features-restore', 'PUT', '/api/platform/plans/premium', { features: ['ad_free', 'auto_backup', 'whatsapp_support', 'quick_call_extension'] }, PL);
  const newPlan = await J('mc-plan-create', 'POST', '/api/platform/plans', { key: 'starter_x', name: 'Starter X', price_monthly: 10, features: ['ad_free'] }, PL);
  expect(newPlan.status === 201, 'a new plan can be added');
  const badFeature = await J('mc-plan-bad-feature', 'PUT', '/api/platform/plans/starter_x', { features: ['made_up'] }, PL);
  expect(badFeature.status === 400, 'only features that exist in the code can be assigned');
  const freeOff = await J('mc-plan-free-off', 'PUT', '/api/platform/plans/free', { is_active: false }, PL);
  expect(freeOff.status === 400, 'the Free plan cannot be switched off');
  const inUse = await J('mc-plan-delete-inuse', 'DELETE', '/api/platform/plans/biz', {}, PL);
  expect(inUse.status === 409, 'a plan that customers are on cannot be deleted');
  const delNew = await J('mc-plan-delete', 'DELETE', '/api/platform/plans/starter_x', {}, PL);
  expect(delNew.status === 200, 'an unused plan can be deleted');

  // ── background jobs run once per customer ──
  const SECRET = 'test-jobs-secret';       // INTERNAL_JOBS_SECRET in .env.test
  const jobs = await call('mc-jobs', 'POST', '/api/internal/jobs/hourly', { as: null, headers: { 'x-internal-secret': SECRET } });
  expect(jobs.status === 200 && jobs.data.results.length >= 2 && jobs.data.results.every(r => !r.error), 'the hourly job ran for every customer');

  // ── suspension and support access ──
  const sus = await J('mc-suspend', 'POST', '/api/platform/customers/{acmeId}/suspend', {}, PL);
  expect(sus.data.status === 'suspended', 'a customer can be suspended');
  const blocked = await call('mc-suspended-request', 'GET', '/api/leads', { as: 'acme' });
  expect(blocked.status === 403 && blocked.data.code === 'workspace_suspended', 'a suspended customer\'s sessions stop working at once');
  const before = fake.sent.filter(e => e === 'owner@acme.test').length;
  await J('mc-suspended-send', 'POST', '/api/auth/send-otp', { email: 'owner@acme.test' }, { as: null });
  expect(fake.sent.filter(e => e === 'owner@acme.test').length === before, 'no sign-in code is sent for a suspended customer');
  const noEnter = await J('mc-enter-suspended', 'POST', '/api/platform/customers/{acmeId}/enter', {}, PL);
  expect(noEnter.status === 409, 'support access needs the customer to be active');
  await J('mc-resume', 'POST', '/api/platform/customers/{acmeId}/resume', {}, PL);
  const back = await call('mc-resumed-request', 'GET', '/api/leads', { as: 'acme' });
  expect(back.status === 200, 'resuming restores access');
  const ent = await J('mc-enter', 'POST', '/api/platform/customers/{acmeId}/enter', {}, { ...PL, save: { enterTok: d => d.access_token } });
  expect(ent.status === 200 && ent.data.as === 'owner@acme.test', 'support access opens the customer\'s workspace as its admin');
  tokens.support = ent.data.access_token;
  const supMe = await call('mc-enter-me', 'GET', '/api/auth/me', { as: 'support' });
  expect(supMe.data.workspace.name === 'Acme Realty' && supMe.data.email === 'owner@acme.test', 'the support session is a normal session for that customer');

  // ── deleting a customer removes everything ──
  const noConfirm = await J('mc-delete-no-confirm', 'DELETE', '/api/platform/customers/{acmeId}', { confirm: 'wrong' }, PL);
  expect(noConfirm.status === 400, 'deleting needs the customer\'s short name typed');
  const delOriginal = await J('mc-delete-original', 'DELETE', '/api/platform/customers/1', { confirm: 'default' }, PL);
  expect(delOriginal.status === 409, 'the original workspace cannot be deleted');
  const del = await J('mc-delete', 'DELETE', '/api/platform/customers/{acmeId}', { confirm: 'acme-realty' }, PL);
  expect(del.status === 200 && del.data.deleted === true, 'a customer can be deleted');
  const gone = await call('mc-deleted-request', 'GET', '/api/leads', { as: 'acme' });
  expect(gone.status === 401, 'its sessions stop working');
  const freed = await J('mc-reuse-email', 'POST', '/api/platform/customers', { name: 'Acme Again', owner_email: 'owner@acme.test', owner_name: 'Ada' }, { ...PL, save: { acme2: d => d.id } });
  expect(freed.status === 201, 'its email addresses are free again');
  const list = await call('mc-list', 'GET', '/api/platform/customers', PL);
  expect(list.data.length === 2 && list.data.every(c => c.users !== null), 'the customer list shows plan, status and usage');
  const ov = await call('mc-overview', 'GET', '/api/platform/overview', PL);
  expect(ov.data.customers === 2 && ov.data.active === 2, 'the overview counts customers');
};
