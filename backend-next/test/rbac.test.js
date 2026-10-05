'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/config/rbac');

const eff = (o) => R.resolveEffective({ role: 'agent', ...o });

test('defaults reproduce the pre-RBAC role gates', () => {
  const agent = R.resolveEffective({ role: 'agent' });
  const manager = R.resolveEffective({ role: 'manager' });
  const admin = R.resolveEffective({ role: 'admin' });

  // agents: personal tabs only (old sidebar managerOnly/adminOnly flags)
  for (const k of ['dashboard', 'calls', 'leads', 'pipeline', 'follow-ups', 'call-queue', 'settings']) {
    assert.equal(R.can(agent, k, 'view'), true, `agent should see ${k}`);
  }
  for (const k of ['command-center', 'area-analysis', 'performance', 'quality', 'qa-review', 'team', 'users', 'rbac']) {
    assert.equal(R.can(agent, k, 'view'), false, `agent must not see ${k}`);
  }
  assert.equal(R.can(agent, 'leads', 'assign'), false);
  assert.equal(R.can(agent, 'leads', 'import'), false);
  assert.equal(R.can(agent, 'leads', 'delete'), true);              // own leads only (service-enforced)
  assert.equal(R.can(agent, 'leads', 'create'), true);

  // managers: everything except user admin + RBAC
  assert.equal(R.can(manager, 'command-center', 'view'), true);
  assert.equal(R.can(manager, 'leads', 'assign'), true);
  assert.equal(R.can(manager, 'users', 'view'), false);
  assert.equal(R.can(manager, 'rbac', 'view'), false);

  // admin: everything
  for (const p of R.PAGES) for (const a of p.actions) assert.equal(R.can(admin, p.key, a), true, `${p.key}.${a}`);
});

test('resolution order: user override > custom role > role profile > default', () => {
  const roleProfile = { pages: { leads: { view: true, create: false, update: false } } };
  const customRole = { pages: { leads: { view: true, create: true, update: false }, calls: { view: false } } };
  const userOverride = { pages: { leads: { view: true, create: true, update: true, assign: true } } };

  let e = eff({ roleProfile });
  assert.equal(R.can(e, 'leads', 'create'), false);          // role profile beats default (agent default had create)
  assert.equal(R.can(e, 'calls', 'view'), true);             // untouched page falls through to default

  e = eff({ roleProfile, customRole });
  assert.equal(R.can(e, 'leads', 'create'), true);           // custom role beats role profile
  assert.equal(R.can(e, 'calls', 'view'), false);

  e = eff({ roleProfile, customRole, userOverride });
  assert.equal(R.can(e, 'leads', 'update'), true);           // user override beats custom role
  assert.equal(R.can(e, 'leads', 'assign'), true);
  assert.equal(R.can(e, 'calls', 'view'), false);            // not mentioned by override -> custom role still applies
});

test('sanitize drops unknown pages/actions and forces actions off without view', () => {
  const s = R.sanitize({ pages: {
    leads: { view: false, create: true, bogus: true },
    nonsense: { view: true },
    calls: { view: 'yes', export: 1 },
  } });
  assert.deepEqual(Object.keys(s.pages).sort(), ['calls', 'leads']);
  assert.equal(s.pages.leads.view, false);
  assert.equal(s.pages.leads.create, false);                  // no view -> no actions
  assert.equal('bogus' in s.pages.leads, false);
  assert.equal(s.pages.calls.view, true);
  assert.equal(s.pages.calls.export, true);
});

test('admin can never lock themselves out of RBAC / users / dashboard', () => {
  const e = R.resolveEffective({ role: 'admin', roleProfile: { pages: { rbac: { view: false }, users: { view: false }, dashboard: { view: false } } } });
  assert.equal(R.can(e, 'rbac', 'view'), true);
  assert.equal(R.can(e, 'rbac', 'update'), true);
  assert.equal(R.can(e, 'users', 'view'), true);
  assert.equal(R.can(e, 'dashboard', 'view'), true);
});

test('homePath is the first viewable page, null when none', () => {
  assert.equal(R.homePath(R.resolveEffective({ role: 'agent' })), '/');
  const none = R.resolveEffective({ role: 'agent', userOverride: { pages: Object.fromEntries(R.PAGES.map(p => [p.key, { view: false }])) } });
  assert.equal(R.homePath(none), null);
  const onlyLeads = R.resolveEffective({ role: 'agent', userOverride: { pages: { dashboard: { view: false }, leads: { view: true } } } });
  // calls is next in registry order and still default-visible to agents
  assert.equal(R.homePath(onlyLeads), '/calls');
});

test('registry exposes pages with their allowed actions only', () => {
  const reg = R.registry();
  assert.ok(reg.pages.find(p => p.key === 'leads').actions.includes('import'));
  assert.deepEqual(reg.pages.find(p => p.key === 'dashboard').actions, ['view']);
  assert.deepEqual(reg.roles, ['admin', 'manager', 'agent']);
});
