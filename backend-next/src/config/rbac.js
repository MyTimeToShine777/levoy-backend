'use strict';

/*
 * RBAC registry — which dashboard pages ("tabs") exist, which actions each one
 * has, and what each built-in role may do by default.
 *
 * Modelled on crm/crm-frontend (AdminPermissions.vue: role / user modes, module
 * checklist, page x action matrix) and crm-backend (RolePermissionProfile,
 * CustomRoleProfile, UserPermissionProfile).
 *
 * The DEFAULT profiles below reproduce what each role could already do before
 * RBAC existed (the old sidebar's managerOnly/adminOnly flags and the hard role
 * checks in the API), so nothing changes until an admin edits a profile.
 *
 * Permission document shape (stored as JSON in all three profile tables):
 *   { "pages": { "<pageKey>": { "view": true, "create": false, ... } } }
 */

const ROLES = ['admin', 'manager', 'agent'];

// view   : see the page / its data (controls sidebar visibility + route access)
// create : add new records           update : edit records
// delete : remove records            export : download data
// assign : hand leads to people      import : bulk-load (CSV / Excel)
const ACTIONS = ['view', 'create', 'update', 'delete', 'export', 'assign', 'import'];

const MODULES = [
  { key: 'overview',  label: 'Overview' },
  { key: 'calls',     label: 'Calls' },
  { key: 'leads',     label: 'Leads' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'team',      label: 'Team' },
  { key: 'workspace', label: 'Workspace' },
];

// `actions`: which actions are meaningful for the page (the RBAC page only shows
// these checkboxes). `defaults`: per-role default grants. 'all' = every action
// in `actions`; 'view' = view only; an array lists explicit actions; null = none.
const PAGES = [
  { key: 'dashboard',      label: 'Dashboard',        path: '/',               module: 'overview',  actions: ['view'],
    defaults: { admin: 'all', manager: 'all', agent: 'all' } },

  { key: 'calls',          label: 'Call Logs',        path: '/calls',          module: 'calls',     actions: ['view', 'update', 'export'],
    defaults: { admin: 'all', manager: 'all', agent: ['view', 'update'] } },
  { key: 'recordings',     label: 'Recordings',       path: '/recordings',     module: 'calls',     actions: ['view', 'delete', 'export'],
    defaults: { admin: 'all', manager: 'all', agent: ['view', 'delete'] } },   // agents may delete their OWN recordings (service-enforced)
  { key: 'reports',        label: 'Reports',          path: '/reports',        module: 'calls',     actions: ['view', 'export'],
    defaults: { admin: 'all', manager: 'all', agent: ['view'] } },

  // Call analytics, modelled on the Levoy app: tabbed call history, graphs, per-contact detail, plans.
  // 'update' on call-history = notes/tags/reminders; on call-analytics = the billing and idle-gap settings.
  { key: 'call-history',   label: 'Call History',     path: '/call-history',   module: 'calls',     actions: ['view', 'update', 'export'],
    defaults: { admin: 'all', manager: 'all', agent: 'all' } },
  { key: 'call-analytics', label: 'Call Analytics',   path: '/call-analytics', module: 'calls',     actions: ['view', 'update', 'export'],
    defaults: { admin: 'all', manager: 'all', agent: ['view', 'export'] } },
  { key: 'contacts',       label: 'Contacts',         path: '/contacts',       module: 'calls',     actions: ['view', 'create', 'update', 'delete', 'export'],
    defaults: { admin: 'all', manager: 'all', agent: ['view', 'create', 'update', 'delete', 'export'] } },

  { key: 'leads',          label: 'Leads',            path: '/leads',          module: 'leads',     actions: ['view', 'create', 'update', 'delete', 'export', 'assign', 'import'],
    defaults: { admin: 'all', manager: 'all', agent: ['view', 'create', 'update', 'delete'] } },
  { key: 'pipeline',       label: 'Kanban Board',     path: '/pipeline',       module: 'leads',     actions: ['view', 'update'],
    defaults: { admin: 'all', manager: 'all', agent: ['view', 'update'] } },
  { key: 'follow-ups',     label: 'Follow-ups',       path: '/follow-ups',     module: 'leads',     actions: ['view', 'create', 'update'],
    defaults: { admin: 'all', manager: 'all', agent: 'all' } },
  { key: 'call-queue',     label: 'Call Queue',       path: '/call-queue',     module: 'leads',     actions: ['view'],
    defaults: { admin: 'all', manager: 'all', agent: 'all' } },
  // The sheet's Settings tab, made editable: call-status rules, scoring thresholds, targets and
  // the rules that hand out new leads. Everyone who can see it may read; only 'update' changes it.
  { key: 'lead-rules',     label: 'Lead Rules',       path: '/lead-rules',     module: 'leads',     actions: ['view', 'update'],
    defaults: { admin: 'all', manager: ['view'], agent: null } },

  { key: 'command-center', label: 'Command Centre',   path: '/command-center', module: 'analytics', actions: ['view', 'export'],
    defaults: { admin: 'all', manager: 'all', agent: null } },
  { key: 'daily-report',   label: 'Daily Report',     path: '/daily-report',   module: 'analytics', actions: ['view', 'export'],
    defaults: { admin: 'all', manager: 'all', agent: ['view'] } },
  { key: 'area-analysis',  label: 'Area Analysis',    path: '/area-analysis',  module: 'analytics', actions: ['view', 'export'],
    defaults: { admin: 'all', manager: 'all', agent: null } },
  { key: 'performance',    label: 'Performance',      path: '/performance',    module: 'analytics', actions: ['view', 'export'],
    defaults: { admin: 'all', manager: 'all', agent: null } },
  { key: 'quality',        label: 'Quality / QA',     path: '/quality',        module: 'analytics', actions: ['view', 'create'],
    defaults: { admin: 'all', manager: 'all', agent: null } },
  { key: 'qa-review',      label: 'New QA Review',    path: '/reviews/new',    module: 'analytics', actions: ['view', 'create'],
    defaults: { admin: 'all', manager: 'all', agent: null } },

  { key: 'team',           label: 'Team Workload',    path: '/team',           module: 'team',      actions: ['view', 'create', 'update', 'delete'],
    defaults: { admin: 'all', manager: 'all', agent: null } },
  { key: 'users',          label: 'User Management', path: '/users',          module: 'team',      actions: ['view', 'create', 'update', 'delete'],
    defaults: { admin: 'all', manager: null, agent: null } },

  { key: 'settings',       label: 'Settings',         path: '/settings',       module: 'workspace', actions: ['view', 'update'],
    defaults: { admin: 'all', manager: 'all', agent: ['view', 'update'] } },
  { key: 'exports',        label: 'Exports',          path: '/exports',        module: 'workspace', actions: ['view', 'create'],
    defaults: { admin: 'all', manager: 'all', agent: ['view', 'create'] } },
  { key: 'api-doc',        label: 'API Docs',         path: '/api-doc',        module: 'workspace', actions: ['view'],
    defaults: { admin: 'all', manager: 'all', agent: 'all' } },
  // 'update' on plans = start a trial / switch the workspace plan.
  { key: 'plans',          label: 'Premium',          path: '/plans',          module: 'workspace', actions: ['view', 'update'],
    defaults: { admin: 'all', manager: ['view'], agent: ['view'] } },
  // What each telecaller's phone app reports (permissions, battery, last sync). The phone-side fixes live in the app.
  { key: 'troubleshooting', label: 'Device Health',   path: '/troubleshooting', module: 'workspace', actions: ['view'],
    defaults: { admin: 'all', manager: 'all', agent: null } },
  { key: 'rbac',           label: 'Roles & Access',   path: '/rbac',           module: 'workspace', actions: ['view', 'update'],
    defaults: { admin: 'all', manager: null, agent: null } },
];

const PAGE_BY_KEY = new Map(PAGES.map(p => [p.key, p]));

// Pages the admin role can never lose, so a bad edit cannot lock every admin out
// of the screen that fixes it.
const ADMIN_LOCKED = { rbac: ['view', 'update'], users: ['view'], dashboard: ['view'] };

function expand(page, spec) {
  const out = {};
  for (const a of page.actions) out[a] = false;
  if (spec === 'all') for (const a of page.actions) out[a] = true;
  else if (Array.isArray(spec)) for (const a of spec) if (a in out) out[a] = true;
  return out;
}

/** Built-in permission document for a role (what applies if nothing is stored). */
function defaultProfile(role) {
  const r = ROLES.includes(role) ? role : 'agent';
  const pages = {};
  for (const p of PAGES) pages[p.key] = expand(p, p.defaults[r]);
  return { pages };
}

/**
 * Keep only known pages/actions and coerce to booleans, so a stored or
 * client-supplied document can never smuggle in unknown keys.
 * Pages absent from `doc` stay absent (they fall through to the next layer).
 */
function sanitize(doc) {
  const out = { pages: {} };
  const pages = doc && typeof doc === 'object' && doc.pages && typeof doc.pages === 'object' ? doc.pages : {};
  for (const [key, acts] of Object.entries(pages)) {
    const page = PAGE_BY_KEY.get(key);
    if (!page || !acts || typeof acts !== 'object') continue;
    out.pages[key] = {};
    for (const a of page.actions) out.pages[key][a] = !!acts[a];
    // Actions other than `view` are meaningless without view.
    if (!out.pages[key].view) for (const a of page.actions) out.pages[key][a] = false;
  }
  return out;
}

/**
 * Resolve the effective permissions for one user.
 * Order (first layer that mentions a page wins for that page):
 *   user override  >  custom role  >  stored role profile  >  built-in default
 *
 * @param {object} p
 * @param {string} p.role           system role: admin | manager | agent
 * @param {object} [p.userOverride] stored UserPermissionProfile.permissions
 * @param {object} [p.customRole]   stored CustomRole.permissions (only if active)
 * @param {object} [p.roleProfile]  stored RolePermissionProfile.permissions for `role`
 */
function resolveEffective({ role, userOverride, customRole, roleProfile }) {
  const layers = [sanitize(userOverride), sanitize(customRole), sanitize(roleProfile), defaultProfile(role)];
  const pages = {};
  for (const page of PAGES) {
    const hit = layers.find(l => l.pages[page.key]);
    pages[page.key] = { ...hit.pages[page.key] };
  }
  if (role === 'admin') {
    for (const [key, acts] of Object.entries(ADMIN_LOCKED)) for (const a of acts) pages[key][a] = true;
  }
  return { pages };
}

const can = (effective, pageKey, action = 'view') =>
  !!(effective && effective.pages && effective.pages[pageKey] && effective.pages[pageKey][action]);

/** First page the user may open: where login should land. */
function homePath(effective) {
  const first = PAGES.find(p => can(effective, p.key, 'view'));
  return first ? first.path : null;
}

/** Public registry for the RBAC page / client (no defaults logic needed there). */
function registry() {
  return {
    roles: ROLES,
    actions: ACTIONS,
    modules: MODULES,
    pages: PAGES.map(({ key, label, path, module, actions }) => ({ key, label, path, module, actions })),
  };
}

module.exports = {
  ROLES, ACTIONS, MODULES, PAGES, PAGE_BY_KEY, ADMIN_LOCKED,
  defaultProfile, sanitize, resolveEffective, can, homePath, registry,
};
