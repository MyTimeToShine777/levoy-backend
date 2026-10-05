'use strict';

const crypto = require('crypto');
const { pool, q, tx, currentTenant } = require('../config/db');
const {
  LEAD_IMPORT_FIELDS, LEAD_DERIVED_COLUMNS, IMPORT_ROW_CAP,
} = require('../config/leadEngine');
const { AppError, ValidationError, NotFoundError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { cleanPhone } = require('../utils/phone');
const { utcMidnight, toIsoDate, detectDateOrder, normaliseDateCell } = require('../utils/dates');
const { statusKey, pharmacyLocalityKey } = require('../utils/leadMath');
const { cellToString, parseCsv, readImportFile, headerKey, headerColumns } = require('../utils/tabularFile');
const Meta = require('../utils/metaLeads');
const LeadScoringService = require('./LeadScoringService');
const TelecallerMapService = require('./TelecallerMapService');
const AssignmentRuleService = require('./AssignmentRuleService');
const AssignmentService = require('./AssignmentService');
const ImportAssignmentService = require('./ImportAssignmentService');
const ScopeService = require('./ScopeService');
const LeadActivityService = require('./LeadActivityService');

const MAX_REPORTED_PROBLEMS = 200;
const DATE_FIELDS = ['lead_assigned_date', 'call_attempted_date', 'followup_date'];
const IMPORT_PREVIEW_TTL_MS = 30 * 60 * 1000;
const IMPORT_PREVIEW_MAX = 20;

// Extra header spellings that exports use for the same sheet fields.
const EXTRA_ALIASES = {
  customer_name: ['full name'],
  lead_source: ['platform'],
};
const FIELD_ALIASES = new Map(LEAD_IMPORT_FIELDS.map(f => [f.key, [...f.aliases, ...(EXTRA_ALIASES[f.key] || [])].map(headerKey)]));

// Automatic mapping: the first file column whose header matches one of a field's
// aliases. First-wins so a file with both "Status" and "Call Status" keeps the
// more specific one.
function autoMap(columns) {
  const mapping = {};
  const taken = new Set();
  for (const f of LEAD_IMPORT_FIELDS) mapping[f.key] = null;
  for (const f of LEAD_IMPORT_FIELDS) {
    const wanted = FIELD_ALIASES.get(f.key);
    for (const col of columns) {
      if (taken.has(col)) continue;
      if (wanted.includes(headerKey(col))) { mapping[f.key] = col; taken.add(col); break; }
    }
  }
  return mapping;
}

// The mapping keys FIELDS onto SOURCE COLUMN NAMES (what an operator sees in the
// preview UI), so it must be resolved to positional indexes before it can index a
// row — indexing an array with a name silently yields undefined.
function mapToIndexes(columns, mapping) {
  const idx = {};
  for (const f of LEAD_IMPORT_FIELDS) {
    const name = mapping ? mapping[f.key] : null;
    idx[f.key] = (name === null || name === undefined) ? -1 : columns.indexOf(name);
  }
  return idx;
}

function rowReader(cells, indexes) {
  return k => {
    const i = indexes[k];
    return (i < 0 || cells[i] === undefined) ? '' : cellToString(cells[i]);
  };
}

// ─── Preview cache ───
// Phase one parses the file and holds the rows in memory under a token; later
// phases commit/plan that same buffer with a corrected mapping. Bounded in both
// entries and age so a burst of previews cannot grow the heap without limit.
const previews = new Map();
function sweepPreviews() {
  const cutoff = Date.now() - IMPORT_PREVIEW_TTL_MS;
  for (const [k, v] of previews) if (v.created_at < cutoff) previews.delete(k);
}
// A preview belongs to the customer that made it: another customer presenting the same token sees nothing.
const previewOwner = () => (currentTenant() || {}).id;
function readPreview(token) {
  const p = token && previews.get(token);
  return p && p.customer_id === previewOwner() ? p : undefined;
}
function storePreview(token, payload) {
  sweepPreviews();
  previews.set(token, { ...payload, customer_id: previewOwner(), created_at: Date.now() });
  while (previews.size > IMPORT_PREVIEW_MAX) previews.delete(previews.keys().next().value);
}

const parseJsonField = (v, dflt = null) => {
  if (v === undefined || v === null || v === '') return dflt;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch (e) { return dflt; }
};

class LeadImportService {
  // ── file loading ──
  readFile(file, sheet) {
    try {
      return readImportFile(file.buffer, file.originalname, sheet);
    } catch (e) {
      throw new AppError(400, e.message, e.available_sheets ? { available_sheets: e.available_sheets } : undefined);
    }
  }

  // Problems the operator needs to see before (and after) a file is written.
  scanProblems(matrix, columns, mapping, cfg, profile) {
    const problems = [];
    let total = 0;
    const indexes = mapToIndexes(columns, mapping);
    const dataRows = matrix.slice(1);
    for (let i = 0; i < dataRows.length; i++) {
      const cells = dataRows[i];
      const rowNo = i + 2;                 // +1 header, +1 for 1-based display
      const get = rowReader(cells, indexes);
      const push = (field, value, reason) => {
        total++;
        if (problems.length < MAX_REPORTED_PROBLEMS) problems.push({ row: rowNo, field, value: String(value).slice(0, 120), reason });
      };

      const customer = get('customer_name');
      const pharmacy = get('pharmacy_name');
      const phone = profile === Meta.PROFILE ? Meta.stripMetaPrefix(get('phone_number')) : get('phone_number');

      // A row with a phone but no name is still a lead (the old sheet has several): it is imported
      // under a placeholder name. Only a row with neither is a stray line.
      if (!customer && !pharmacy && !phone) push('customer_name', '', 'no customer, pharmacy or phone on the row');
      if (!phone) push('phone_number', '', 'no phone number on the row');
      else if (!cleanPhone(phone)) push('phone_number', phone, 'not a usable 10-digit number (91 prefix not the only fixable case)');

      const fu = get('followup_date');
      if (fu && !toIsoDate(fu)) push('followup_date', fu, 'date could not be parsed');
      const ca = get('call_attempted_date');
      if (ca && !toIsoDate(ca)) push('call_attempted_date', ca, 'date could not be parsed');

      const st = get('call_status');
      if (st && !cfg.byKey.has(statusKey(st))) push('call_status', st, 'status is not in lead_status_rules — it scores as not-called');
    }
    return { problems, problem_count: total, scanned: dataRows.length };
  }

  // A caller-supplied mapping is trusted as column NAMES and checked against the
  // real header so a stale mapping cannot silently write the wrong column. One
  // column feeds at most one field; a contradictory mapping is reported in
  // mapping_warnings instead of being dropped silently.
  resolveMapping(columns, mapping) {
    const warnings = [];
    if (!mapping) return { effective: autoMap(columns), warnings };
    const effective = {};
    const used = new Map();
    for (const f of LEAD_IMPORT_FIELDS) {
      const want = mapping[f.key];
      if (want === null || want === undefined || want === '') { effective[f.key] = null; continue; }
      if (!columns.includes(want)) {
        effective[f.key] = null;
        warnings.push({ field: f.key, column: want, reason: 'no such column in this file' });
        continue;
      }
      const prior = used.get(want);
      if (prior) {
        effective[f.key] = null;
        warnings.push({ field: f.key, column: want, reason: `column already mapped to '${prior}'; a column can feed only one field`, also_mapped_field: prior });
        continue;
      }
      effective[f.key] = want;
      used.set(want, f.key);
    }
    return { effective, warnings };
  }

  // ───────────────────────── Phase 1: preview ─────────────────────────
  async preview(ctx, file, body) {
    if (!file) throw new ValidationError('file required (multipart field "file")');
    const parsed = this.readFile(file, body.sheet);
    const matrix = parsed.matrix;
    if (matrix.length < 2) throw new ValidationError('file needs a header row and at least one data row');

    const columns = headerColumns(matrix);
    const dataRows = matrix.length - 1;
    const mapping = autoMap(columns);
    const cfg = await LeadScoringService.loadConfig();
    const profile = Meta.isMetaExport(columns) ? Meta.PROFILE : null;

    const { problems, problem_count, scanned } = this.scanProblems(matrix, columns, mapping, cfg, profile);

    // Which of the file's columns are the app's own derived ones? Reported so the
    // operator can see they were recognised and deliberately not imported.
    const derivedKeys = new Set(LEAD_DERIVED_COLUMNS.map(headerKey));
    const ignored_columns = columns.map((c, i) => ({ column: c, index: i }))
      .filter(x => derivedKeys.has(headerKey(x.column)))
      .map(x => ({ ...x, reason: 'derived column — the app computes this, imports never overwrite it' }));
    const unmapped = columns.filter(c => !Object.values(mapping).includes(c) && !derivedKeys.has(headerKey(c)));

    const idx = mapToIndexes(columns, mapping);
    const sample_rows = matrix.slice(1, 9).map((cells, i) => {
      const o = { row: i + 2 };
      for (const f of LEAD_IMPORT_FIELDS) o[f.key] = idx[f.key] < 0 ? null : cellToString(cells[idx[f.key]]);
      return o;
    });

    const date_order = this.dateOrderInfo(matrix, columns, mapping);

    const token = crypto.randomBytes(16).toString('hex');
    storePreview(token, {
      matrix, columns, mapping, format: parsed.format,
      sheets: parsed.sheets, sheet: parsed.sheet, filename: file.originalname, profile,
    });

    const out = {
      format: parsed.format,
      filename: file.originalname,
      sheet: parsed.sheet,
      sheets: parsed.sheets,
      columns,
      sample_rows,
      mapping,
      field_labels: LEAD_IMPORT_FIELDS.map(f => ({ key: f.key, label: f.label })),
      derived_columns: LEAD_DERIVED_COLUMNS,
      ignored_columns,
      unmapped_columns: unmapped,
      problems,
      problem_count,
      rows_scanned: scanned,
      total_rows: dataRows,
      row_cap: IMPORT_ROW_CAP,
      row_cap_exceeded: dataRows > IMPORT_ROW_CAP,
      preview_token: token,
      preview_expires_in_minutes: Math.round(IMPORT_PREVIEW_TTL_MS / 60000),
      required_missing: LEAD_IMPORT_FIELDS.filter(f => mapping[f.key] === null).map(f => f.label),
      // Slash dates: what the file itself proves, and how many are ambiguous (the UI asks).
      date_order,
      // New: source profile (Meta Lead Ads…) and what the app will fill in for it.
      profile,
      profile_defaults: profile ? { segment: Meta.DEFAULT_SEGMENT } : null,
    };
    // A dry-run assignment plan when the caller already chose how to assign.
    const assignment = parseJsonField(body.assignment);
    if (assignment) {
      const planned = await this.planFromState(ctx, { matrix, columns, mapping, profile, filename: file.originalname }, mapping, assignment, body.default_segment, body.date_order, body.duplicates);
      out.assignment_plan = planned.assignment_plan;
    }
    return out;
  }

  // Re-run the whole decision (parse + dedupe + assignment) WITHOUT writing, so the
  // operator sees per-telecaller counts, duplicates and unassigned before commit.
  async plan(ctx, body) {
    sweepPreviews();
    const token = body.preview_token;
    const stored = readPreview(token);
    if (!stored) {
      throw new AppError(400, 'a live preview_token is required', { hint: 'POST /api/leads/import/preview first' });
    }
    const mapping = parseJsonField(body.mapping);
    const assignment = parseJsonField(body.assignment, {});
    return this.planFromState(ctx, stored, mapping, assignment, body.default_segment, body.date_order, body.duplicates);
  }

  // Looks at the three date columns of the mapped file and reports what its slash dates prove.
  dateOrderInfo(matrix, columns, mapping) {
    const idx = mapToIndexes(columns, this.resolveMapping(columns, mapping).effective);
    const vals = [];
    for (const row of matrix.slice(1)) {
      for (const f of DATE_FIELDS) if (idx[f] >= 0) vals.push(cellToString(row[idx[f]]));
    }
    return detectDateOrder(vals);
  }

  async planFromState(ctx, state, mapping, assignment, defaultSegment, dateOrder, duplicates) {
    const { effective, warnings } = this.resolveMapping(state.columns, mapping);
    const dataRows = state.matrix.length - 1;
    if (dataRows > IMPORT_ROW_CAP) {
      throw new AppError(400, `Too many rows: ${dataRows}. Maximum is ${IMPORT_ROW_CAP}`, { total_rows: dataRows, max_rows: IMPORT_ROW_CAP });
    }
    const cfg = await LeadScoringService.loadConfig();
    const run = (t, p) => q(t, p);
    const prepared = await this.prepareRows({
      run, matrix: state.matrix, columns: state.columns, mapping: effective, cfg,
      today: utcMidnight(new Date()), profile: state.profile, defaultSegment, dateOrder, duplicates,
    });
    const options = await this.normaliseAssignment(ctx, assignment);
    const plan = await this.buildPlan(ctx, run, prepared.rows, options);
    const users = await this.userNames(Object.keys(plan.summary.byUser));
    const names = (id) => (users.get(Number(id)) || `user ${id}`);

    const willInsert = prepared.rows.filter(r => !r.skip && !r.existingId).length;
    const willUpdate = prepared.rows.filter(r => !r.skip && r.existingId).length;
    return {
      profile: state.profile,
      date_order: prepared.date_order,
      total_rows: dataRows,
      will_insert: willInsert,
      will_update: willUpdate,
      will_skip: prepared.rows.filter(r => r.skip).length,
      duplicates_flagged: prepared.rows.filter(r => r.reasons && r.reasons.length).length,
      invalid_phones: prepared.rows.filter(r => !r.skip && !r.derived.phone_clean).length,
      skipped: prepared.rows.filter(r => r.skip).map(r => ({ row: r.rowNo, message: r.skip })).slice(0, MAX_REPORTED_PROBLEMS),
      mapping_warnings: warnings,
      assignment_plan: {
        options,
        total: plan.summary.total,
        unassigned: plan.summary.unassigned,
        by_reason: plan.summary.byReason,
        by_user: Object.entries(plan.summary.byUser)
          .map(([id, n]) => ({ user_id: Number(id), name: names(id), leads: n }))
          .sort((a, b) => b.leads - a.leads || a.user_id - b.user_id),
        capacity_skipped: plan.summary.byReason.capacity || 0,
      },
    };
  }

  async userNames(ids) {
    const list = ids.map(Number).filter(Number.isInteger);
    if (!list.length) return new Map();
    const r = await q('SELECT id, name FROM users WHERE id = ANY($1)', [list]);
    return new Map(r.rows.map(u => [u.id, u.name]));
  }

  // ───────────────────────── assignment options ─────────────────────────
  // Validates the `assignment` object from the upload dialog. When absent the
  // behaviour is the long-standing one: assign from the file's telecaller column.
  async normaliseAssignment(ctx, raw) {
    const a = raw && typeof raw === 'object' ? raw : null;
    if (!a) return { use_file_column: true, use_rules: false, round_robin: { enabled: false, user_ids: [] }, manual_user_id: null };

    const out = {
      use_file_column: a.use_file_column !== false && a.use_file_column !== 'false',
      use_rules: a.use_rules === true || a.use_rules === 'true',
      round_robin: { enabled: false, user_ids: [] },
      manual_user_id: null,
    };

    if (a.manual_user_id !== undefined && a.manual_user_id !== null && a.manual_user_id !== '') {
      const uid = parseInt(a.manual_user_id);
      if (!Number.isInteger(uid)) throw new ValidationError('assignment.manual_user_id must be an integer');
      await AssignmentService.assertAssignable(uid);
      out.manual_user_id = uid;
    }

    const rr = a.round_robin;
    if (rr && (rr.enabled === true || rr.enabled === 'true')) {
      let ids = Array.isArray(rr.user_ids) ? rr.user_ids.map(x => parseInt(x)).filter(Number.isInteger) : [];
      if (rr.team_id) {
        const t = await q(
          `SELECT DISTINCT u.id FROM users u JOIN team_members tm ON tm.user_id = u.id
            WHERE tm.team_id = $1 AND u.is_active AND u.role IN ('agent','manager') ORDER BY u.id`, [parseInt(rr.team_id)]);
        ids = [...ids, ...t.rows.map(r => r.id)];
      }
      ids = [...new Set(ids)];
      if (!ids.length) throw new ValidationError('assignment.round_robin needs user_ids or a team_id with members');
      const ok = await q(
        `SELECT id FROM users WHERE id = ANY($1) AND is_active AND role IN ('agent','manager')`, [ids]);
      const valid = new Set(ok.rows.map(r => r.id));
      const bad = ids.filter(id => !valid.has(id));
      if (bad.length) throw new AppError(400, 'assignment.round_robin has users that cannot receive leads', { invalid_user_ids: bad });
      out.round_robin = { enabled: true, user_ids: ids };
    }
    return out;
  }

  // Resolve, per prepared row, the telecaller (file column) and the matching rule,
  // then hand the whole batch to the pure planner.
  async buildPlan(ctx, run, rows, options) {
    const live = rows.filter(r => !r.skip);

    // Rules are loaded once; each rule's candidate pool is resolved once.
    let rules = [];
    if (options.use_rules) {
      const rr = await run('SELECT * FROM assignment_rules WHERE enabled = true ORDER BY priority ASC, id ASC');
      const scopeUsers = (await ScopeService.assignableUsers({ userId: ctx.userId, userRole: ctx.role })).map(u => u.id);
      for (const rule of rr.rows) {
        let pool = scopeUsers;
        if (rule.strategy !== 'fixed' && rule.team_id) {
          const t = await run(
            `SELECT DISTINCT u.id FROM users u JOIN team_members tm ON tm.user_id = u.id
              WHERE tm.team_id = $1 AND u.is_active AND u.role IN ('agent','manager') ORDER BY u.id`, [rule.team_id]);
          pool = t.rows.map(r => r.id);
        }
        rules.push({ ...rule, pool });
      }
    }
    const noTags = new Set();
    const ruleFor = row => {
      let winner = null;
      const leadLike = { source: row.input.lead_source, status: row.stage || 'new', priority: 'normal', segment: row.input.segment, locality: row.input.locality };
      for (const rule of rules) {
        if (!AssignmentRuleService.matchRuleConditions(rule, leadLike, noTags).matched) continue;
        winner = rule;
        if (rule.stop_on_match) break;
      }
      return winner ? { id: winner.id, name: winner.name, strategy: winner.strategy, fixed_user_id: winner.fixed_user_id, pool: winner.pool } : null;
    };

    const leads = live.map(r => ({
      file_user_id: r.tel && r.tel.user_id ? r.tel.user_id : null,
      rule: options.use_rules ? ruleFor(r) : null,
      existing_owned: !!r.existingOwned,
    }));

    const involved = new Set(options.round_robin.user_ids);
    if (options.manual_user_id) involved.add(options.manual_user_id);
    for (const l of leads) {
      if (l.file_user_id) involved.add(l.file_user_id);
      if (l.rule) { if (l.rule.fixed_user_id) involved.add(l.rule.fixed_user_id); (l.rule.pool || []).forEach(id => involved.add(id)); }
    }
    const deps = await ImportAssignmentService.loadDeps([...involved]);
    const plan = ImportAssignmentService.planAssignment({ leads, options, deps });

    // Map the planner's output (indexed over `live`) back onto the prepared rows.
    plan.assignments.forEach(a => { live[a.index].plan = a; });
    return plan;
  }

  // ───────────────────────── prepare (shared by plan + commit) ─────────────────────────
  // Parses every row, scores it, resolves duplicates and the telecaller — but
  // writes nothing. `run` is a query function (tx's q for commit, plain q for plan).
  // `duplicates`: 'merge' (default for API callers — a later row repeating a phone updates the lead the
  // earlier row made) or 'keep' (every row is its own lead; repeats are flagged Duplicate, as in the sheet).
  async prepareRows({ run, matrix, columns, mapping, cfg, today, profile, defaultSegment, dateOrder, duplicates }) {
    const keepDuplicates = duplicates === 'keep';
    const dataRows = matrix.slice(1);
    const indexes = mapToIndexes(columns, mapping);
    // 'dmy' | 'mdy' when the operator chose, else whatever the file proves, else day-first.
    const detected = this.dateOrderInfo(matrix, columns, mapping);
    const order = dateOrder === 'dmy' || dateOrder === 'mdy' ? dateOrder : (detected.order || 'dmy');
    const isMeta = profile === Meta.PROFILE;
    const idCol = isMeta ? Meta.findIdColumn(columns, dataRows[0]) : -1;

    // Existing leads are read once rather than per row: a 5,000-row file would
    // otherwise spend 5,000 round trips just deciding what to update.
    const existingR = await run(
      `SELECT id, phone, phone_clean, pharmacy_name, locality, pharmacy_locality_key, external_id, assigned_to
         FROM leads WHERE merged_into_lead_id IS NULL AND deleted_at IS NULL`);
    const byPhoneClean = new Map(), byRawPhone = new Map(), byPlKey = new Map(), byExternal = new Map();
    const byPhoneList = new Map();   // phone_clean -> [lead ids ascending]
    const occPhone = new Map();      // phone_clean -> how many rows of THIS file used it so far
    const byRawList = new Map();     // digits of the raw phone -> [lead ids ascending] (for numbers that cannot be cleaned)
    const occRaw = new Map();        // keep mode: how many rows of THIS file used that raw phone so far
    const ownedIds = new Set(existingR.rows.filter(e => e.assigned_to).map(e => e.id));
    for (const e of existingR.rows) {
      if (e.phone_clean && !byPhoneClean.has(e.phone_clean)) byPhoneClean.set(e.phone_clean, e.id);
      if (e.phone_clean) { if (!byPhoneList.has(e.phone_clean)) byPhoneList.set(e.phone_clean, []); byPhoneList.get(e.phone_clean).push(e.id); }
      if (e.phone) {
        const d = String(e.phone).replace(/\D/g, '');
        if (d && !byRawPhone.has(d)) byRawPhone.set(d, e.id);
        if (d) { if (!byRawList.has(d)) byRawList.set(d, []); byRawList.get(d).push(e.id); }
      }
      if (e.pharmacy_locality_key && !byPlKey.has(e.pharmacy_locality_key)) byPlKey.set(e.pharmacy_locality_key, e.id);
      if (e.external_id && !byExternal.has(e.external_id)) byExternal.set(e.external_id, e.id);
    }
    // Duplicates WITHIN the file are found the same way: every key seen in the
    // batch is registered as rows are processed.
    const seenPhone = new Map(), seenPl = new Map(), seenExternal = new Map();
    // A later row that repeats a phone / external id of an EARLIER row that will be
    // INSERTED updates that lead instead of inserting a second one (the long-standing
    // in-file upsert). Key -> rowNo of the inserting row; resolved to an id at write time.
    const pendingPhone = new Map(), pendingRaw = new Map(), pendingExternal = new Map();

    const validStages = new Set((await run('SELECT slug FROM pipeline_stages')).rows.map(s => s.slug));
    const defaultStage = validStages.has('new') ? 'new' : (validStages.values().next().value || null);
    const resolveTelecaller = TelecallerMapService.makeResolver(run);

    const rows = [];
    for (let i = 0; i < dataRows.length; i++) {
      const cells = dataRows[i];
      const rowNo = i + 2;
      const get = rowReader(cells, indexes);
      const input = {
        segment: get('segment') || null,
        lead_assigned_date: get('lead_assigned_date') || null,
        call_attempted_date: get('call_attempted_date') || null,
        telecaller_name: get('telecaller_name') || null,
        customer_name: get('customer_name') || null,
        pharmacy_name: get('pharmacy_name') || null,
        locality: get('locality') || null,
        address: get('address') || null,
        phone_number: get('phone_number') || null,
        email_id: get('email_id') || null,
        lead_source: get('lead_source') || null,
        followup_date: get('followup_date') || null,
        call_done: get('call_done') || null,
        call_status: get('call_status') || null,
        remarks: get('remarks') || null,
      };
      for (const f of DATE_FIELDS) input[f] = normaliseDateCell(input[f], order);

      // Source-specific enrichment (Meta Lead Ads).
      let meta = { external_id: null, received_at: null, lead_meta: null };
      if (isMeta) {
        const info = Meta.metaRowInfo(columns, cells, idCol);
        input.phone_number = input.phone_number ? Meta.stripMetaPrefix(input.phone_number) : null;
        input.lead_source = Meta.platformToSource(input.lead_source) || info.platform_source || input.lead_source;
        input.segment = input.segment || defaultSegment || Meta.DEFAULT_SEGMENT;
        meta = { external_id: info.external_id, received_at: info.received_at, lead_meta: info.lead_meta };
      }

      const row = { rowNo, input, meta };
      rows.push(row);

      // A row with no name AND no phone is not a lead; it is a stray line in a sheet.
      // Skipping it is reported, never silent. (A phone alone is enough: see displayName.)
      if (!input.customer_name && !input.pharmacy_name && !input.phone_number) { row.skip = 'no customer, pharmacy or phone on the row'; continue; }
      if (input.email_id && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email_id)) { row.skip = `invalid email '${input.email_id.slice(0, 60)}'`; continue; }

      const d = LeadScoringService.computeDerived(input, cfg, { today });
      const plKey = pharmacyLocalityKey(input.pharmacy_name, input.locality);
      const phoneStore = input.phone_number || '';

      // Resolve which lead this row will UPSERT onto BEFORE judging duplicates, so
      // a re-import does not flag every row as a duplicate of itself.
      let existingId = null;
      // keep mode: how many earlier rows of this file carried the same phone (0 = first sighting)
      const occ = keepDuplicates && d.phone_clean ? (occPhone.get(d.phone_clean) || 0) : 0;
      if (keepDuplicates && d.phone_clean) occPhone.set(d.phone_clean, occ + 1);
      if (meta.external_id && byExternal.has(meta.external_id)) existingId = byExternal.get(meta.external_id);
      if (!existingId && d.phone_clean) {
        // The Nth repeat maps to the Nth existing lead with that phone, so re-importing a file
        // lands every row on the lead it created last time instead of making new duplicates.
        const list = byPhoneList.get(d.phone_clean);
        if (keepDuplicates) existingId = (list && list[occ]) || null;
        else if (byPhoneClean.has(d.phone_clean)) existingId = byPhoneClean.get(d.phone_clean);
      }
      if (!existingId && phoneStore) {
        const rawDigits = phoneStore.replace(/\D/g, '');
        if (rawDigits) {
          if (keepDuplicates) {
            const n = occRaw.get(rawDigits) || 0;
            occRaw.set(rawDigits, n + 1);
            existingId = ((byRawList.get(rawDigits) || [])[n]) || null;
          } else if (byRawPhone.has(rawDigits)) existingId = byRawPhone.get(rawDigits);
        }
      }
      let existingFromRow = null;
      if (!existingId) {
        const rawD = phoneStore.replace(/\D/g, '');
        if (meta.external_id && pendingExternal.has(meta.external_id)) existingFromRow = pendingExternal.get(meta.external_id);
        else if (!keepDuplicates && d.phone_clean && pendingPhone.has(d.phone_clean)) existingFromRow = pendingPhone.get(d.phone_clean);
        else if (!keepDuplicates && rawD && pendingRaw.has(rawD)) existingFromRow = pendingRaw.get(rawD);
      }
      const isOther = id => id !== null && id !== undefined && id !== existingId;

      // Duplicate detection on the keys the spec names, against the database AND
      // earlier rows in this file. Flagged only — the row is kept, because the
      // sheet keeps duplicates visible too.
      const reasons = [];
      if (d.phone_clean) {
        if (keepDuplicates) { if (occ > 0) reasons.push('phone'); }   // a repeat of an earlier row in this file
        else if (isOther(byPhoneClean.get(d.phone_clean))) reasons.push('phone');
        else if (seenPhone.has(d.phone_clean)) reasons.push('phone');
      }
      if (plKey) {
        if (isOther(byPlKey.get(plKey))) reasons.push('pharmacy+locality');
        else if (seenPl.has(plKey)) reasons.push('pharmacy+locality');
      }
      if (meta.external_id && seenExternal.has(meta.external_id)) reasons.push('external_id');
      if (reasons.length) {
        // The sheet tells the telecaller to skip a duplicate rather than call it twice.
        d.next_best_action = 'Duplicate – skip';
        d.data_check = d.data_check === 'ok' ? 'DUPLICATE_PHONE' : `${d.data_check};DUPLICATE_PHONE`;
      }
      if (d.phone_clean && !seenPhone.has(d.phone_clean)) seenPhone.set(d.phone_clean, rowNo);
      if (plKey && !seenPl.has(plKey)) seenPl.set(plKey, rowNo);
      if (meta.external_id && !seenExternal.has(meta.external_id)) seenExternal.set(meta.external_id, rowNo);

      // Telecaller: explicit binding beats name match; no match means UNASSIGNED.
      const tel = await resolveTelecaller(input.telecaller_name);

      const stage = (d.pipeline_stage && validStages.has(d.pipeline_stage)) ? d.pipeline_stage : defaultStage;
      Object.assign(row, {
        derived: d, plKey, phoneStore, existingId, reasons, tel, stage,
        // leads.name is NOT NULL and the CRM shows it everywhere, so the sheet's
        // customer name falls back to the pharmacy, then the locality.
        displayName: input.customer_name || input.pharmacy_name || input.locality || (input.phone_number ? `Lead ${String(input.phone_number).replace(/\s+/g, '')}` : `Imported lead (row ${rowNo})`),
      });

      row.existingFromRow = existingFromRow;
      row.existingOwned = existingId ? ownedIds.has(existingId) : !!existingFromRow;
      // This row will INSERT: later rows repeating its keys update it.
      if (!existingId && !existingFromRow) {
        const rawD = phoneStore.replace(/\D/g, '');
        if (meta.external_id) pendingExternal.set(meta.external_id, rowNo);
        if (d.phone_clean && !pendingPhone.has(d.phone_clean)) pendingPhone.set(d.phone_clean, rowNo);
        if (rawD && !pendingRaw.has(rawD)) pendingRaw.set(rawD, rowNo);
      }
    }
    return { rows, byPhoneClean, byRawPhone, byPlKey, byExternal, date_order: { used: order, detected: detected.order, ambiguous: detected.ambiguous } };
  }

  // ───────────────────────── Phase 2: commit ─────────────────────────
  async commit(ctx, file, bodyIn) {
    sweepPreviews();
    const body = bodyIn || {};
    const mapping = parseJsonField(body.mapping);

    let matrix, columns, meta;
    if (file) {
      const parsed = this.readFile(file, body.sheet);
      matrix = parsed.matrix; columns = headerColumns(parsed.matrix);
      meta = { format: parsed.format, sheets: parsed.sheets, sheet: parsed.sheet, filename: file.originalname };
    } else if (readPreview(body.preview_token)) {
      const p = readPreview(body.preview_token);
      matrix = p.matrix; columns = p.columns;
      meta = { format: p.format, sheets: p.sheets, sheet: p.sheet, filename: p.filename };
      previews.delete(body.preview_token);
    } else {
      throw new AppError(400, 'either a file or a live preview_token is required',
        { hint: 'POST /api/leads/import/preview first, then send its preview_token with the corrected mapping' });
    }
    if (!matrix || matrix.length < 2) throw new ValidationError('file needs a header row and at least one data row');

    const { effective, warnings: mappingWarnings } = this.resolveMapping(columns, mapping);
    const dataRows = matrix.slice(1);
    if (dataRows.length > IMPORT_ROW_CAP) {
      throw new AppError(400, `Too many rows: ${dataRows.length}. Maximum is ${IMPORT_ROW_CAP}`, { total_rows: dataRows.length, max_rows: IMPORT_ROW_CAP });
    }
    const profile = Meta.isMetaExport(columns) ? Meta.PROFILE : null;
    const options = await this.normaliseAssignment(ctx, parseJsonField(body.assignment));

    const importer = parseInt(ctx.userId);
    const today = utcMidnight(new Date());

    let result;
    try {
      result = await tx(async ({ q: tq }) => {
        // Read the scoring config on the SAME pinned client, so every row in this
        // commit is scored against one consistent snapshot of the rules.
        const cfg = await LeadScoringService.loadConfig(tq);
        const prepared = await this.prepareRows({ run: tq, matrix, columns, mapping: effective, cfg, today, profile, defaultSegment: body.default_segment, dateOrder: body.date_order, duplicates: body.duplicates });
        const plan = await this.buildPlan(ctx, tq, prepared.rows, options);

        const batch = (await tq(
          `INSERT INTO lead_import_batches (filename, format, sheet, profile, created_by)
           VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
          [meta.filename || null, meta.format, meta.sheet || null, profile, importer])).rows[0];

        const errors = [], flagged = [];
        let inserted = 0, updated = 0, skipped = 0;
        let assignedByName = 0, unassignedByName = 0;
        const telecallerTally = new Map();
        const newLeadIds = [];
        const idByRow = new Map();        // rowNo -> lead id inserted by that row
        const assignRows = [];           // { lead_id, user_id, reason, rule_id }

        const INSERT = `INSERT INTO leads
          (name, phone, email, source, notes, status, priority, owner_id, assigned_to,
           segment, lead_assigned_date, call_attempted_date, telecaller_name,
           customer_name, pharmacy_name, locality, address, followup_date, call_done,
           call_status, remarks,
           phone_clean, pharmacy_locality_key, is_duplicate, duplicate_reasons,
           followup_clean, is_active_lead, followup_window, days_since_last_call,
           priority_score, tier, next_best_action, data_check, win_probability, queue_rank,
           external_id, received_at, lead_meta, import_batch_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
                  $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
                  $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,
                  $36,$37,$38,$39)`;

        for (const row of prepared.rows) {
          const { rowNo, input } = row;
          if (row.skip) { skipped++; errors.push({ row: rowNo, message: row.skip }); continue; }

          const { derived: d, tel } = row;
          // A BLANK telecaller cell is not a name to tally.
          if (tel.name) {
            if (!telecallerTally.has(tel.name)) telecallerTally.set(tel.name, { user_id: tel.user_id, source: tel.source, leads_count: 0 });
            telecallerTally.get(tel.name).leads_count++;
            if (tel.user_id) assignedByName++; else unassignedByName++;
          }

          // Dates go in as ISO or NULL: handing Postgres the raw "29/09/2026" (or
          // "notadate") would reject the statement and poison the transaction.
          const dLeadAssigned = toIsoDate(input.lead_assigned_date);
          const dCallAttempted = toIsoDate(input.call_attempted_date);
          const dFollowup = toIsoDate(input.followup_date);

          const targetId = row.existingId || (row.existingFromRow ? idByRow.get(row.existingFromRow) || null : null);
          const planned = row.plan || { user_id: null, reason: 'unassigned' };
          // A re-import must never WIPE or MOVE an owned lead: the planner marks those "kept" unless an explicit
          // choice (file / manual / rule) applies; round-robin only fills leads that have no owner yet.
          const explicit = ['file', 'manual', 'rule', 'round_robin'].includes(planned.reason);
          const newOwner = planned.user_id;

          // One SAVEPOINT per row: a poisonous row is reported and skipped while
          // everything that succeeded stays atomic.
          await tq('SAVEPOINT import_row');
          try {
            if (targetId) {
              await tq(
                `UPDATE leads SET
                   name = COALESCE($2, name), email = COALESCE($3, email),
                   source = COALESCE($4, source), notes = COALESCE($5, notes),
                   status = $6, segment = COALESCE($7, segment),
                   lead_assigned_date = COALESCE($8, lead_assigned_date),
                   call_attempted_date = COALESCE($9, call_attempted_date),
                   telecaller_name = COALESCE($10, telecaller_name),
                   customer_name = COALESCE($11, customer_name),
                   pharmacy_name = COALESCE($12, pharmacy_name),
                   locality = COALESCE($13, locality), address = COALESCE($14, address),
                   followup_date = COALESCE($15, followup_date),
                   call_done = COALESCE($16, call_done),
                   call_status = COALESCE($17, call_status), remarks = COALESCE($18, remarks),
                   phone = $19, phone_clean = $20, pharmacy_locality_key = $21,
                   is_duplicate = $22, duplicate_reasons = $23,
                   followup_clean = $24, is_active_lead = $25, followup_window = $26,
                   days_since_last_call = $27, priority_score = $28, tier = $29,
                   next_best_action = $30, data_check = $31, win_probability = $32,
                   assigned_to = CASE WHEN $34::boolean THEN $33 ELSE assigned_to END,
                   external_id = COALESCE(external_id, $35),
                   received_at = COALESCE(received_at, $36),
                   lead_meta = COALESCE($37::jsonb, lead_meta),
                   updated_at = NOW()
                 WHERE id = $1`, [
                  targetId,
                  input.customer_name || null, input.email_id || null, input.lead_source || null,
                  input.remarks || null, row.stage, input.segment, dLeadAssigned,
                  dCallAttempted, input.telecaller_name, input.customer_name,
                  input.pharmacy_name, input.locality, input.address, dFollowup,
                  input.call_done, input.call_status, input.remarks,
                  row.phoneStore, d.phone_clean, row.plKey, row.reasons.length > 0,
                  row.reasons.length ? row.reasons.join(';') : null, d.followup_clean, d.is_active_lead,
                  d.followup_window, d.days_since_last_call, d.priority_score, d.tier,
                  d.next_best_action, d.data_check, d.win_probability,
                  newOwner, explicit && newOwner !== null,
                  row.meta.external_id, row.meta.received_at,
                  row.meta.lead_meta ? JSON.stringify(row.meta.lead_meta) : null,
                ]);
              updated++;
              if (explicit && newOwner) assignRows.push({ lead_id: targetId, user_id: newOwner, reason: planned.reason, rule_id: planned.rule_id });
            } else {
              const ins = await tq(INSERT + ' RETURNING id', [
                row.displayName, row.phoneStore, input.email_id, input.lead_source, input.remarks,
                row.stage, 'normal', importer, newOwner,
                input.segment, dLeadAssigned, dCallAttempted,
                input.telecaller_name, input.customer_name, input.pharmacy_name, input.locality,
                input.address, dFollowup, input.call_done, input.call_status, input.remarks,
                d.phone_clean, row.plKey, row.reasons.length > 0, row.reasons.length ? row.reasons.join(';') : null,
                d.followup_clean, d.is_active_lead, d.followup_window, d.days_since_last_call,
                d.priority_score, d.tier, d.next_best_action, d.data_check, d.win_probability, null,
                row.meta.external_id, row.meta.received_at,
                row.meta.lead_meta ? JSON.stringify(row.meta.lead_meta) : null, batch.id,
              ]);
              const id = ins.rows[0].id;
              idByRow.set(rowNo, id);
              newLeadIds.push(id);
              inserted++;
              if (newOwner) assignRows.push({ lead_id: id, user_id: newOwner, reason: planned.reason, rule_id: planned.rule_id });
            }
            await tq('RELEASE SAVEPOINT import_row');
            if (row.reasons.length) {
              flagged.push({ row: rowNo, reasons: row.reasons, phone: row.phoneStore, pharmacy: input.pharmacy_name, locality: input.locality });
            }
          } catch (e) {
            await tq('ROLLBACK TO SAVEPOINT import_row');
            await tq('RELEASE SAVEPOINT import_row');
            errors.push({ row: rowNo, message: e.message });
          }
        }

        // Assignees are written after the loop: one multi-row INSERT instead of one
        // round trip per lead. Deduped by lead FIRST (last row wins — the later
        // line in a spreadsheet is the more recent correction): the partial unique
        // index allows exactly one 'owner' row per lead, checked per row WITHIN one
        // INSERT statement.
        const byLead = new Map();
        for (const a of assignRows) byLead.set(a.lead_id, a);
        const finalAssignments = [...byLead.values()];
        if (finalAssignments.length) {
          // A re-import that re-points an already-owned lead must demote the old
          // owner first. Per-PAIR, not per-lead: comparing against the whole
          // array would wrongly spare an old owner who owns a DIFFERENT lead in
          // the same batch.
          await tq(
            `UPDATE lead_assignees la SET role = 'collaborator'
               FROM unnest($1::int[], $2::int[]) AS incoming(lead_id, user_id)
              WHERE la.lead_id = incoming.lead_id AND la.role = 'owner' AND la.user_id <> incoming.user_id`,
            [finalAssignments.map(a => a.lead_id), finalAssignments.map(a => a.user_id)]);
          await tq(
            `INSERT INTO lead_assignees (lead_id, user_id, role, assigned_by)
             SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::int[])
             ON CONFLICT (lead_id, user_id) DO UPDATE SET role = 'owner'`,
            [finalAssignments.map(a => a.lead_id), finalAssignments.map(a => a.user_id),
              finalAssignments.map(() => 'owner'), finalAssignments.map(() => importer)]);
          // History: the timeline shows who the lead was handed to and why.
          await tq(
            `INSERT INTO lead_assignments (lead_id, previous_user_id, user_id, assigned_by, note)
             SELECT * FROM unnest($1::int[], $2::int[], $3::int[], $4::int[], $5::text[])`,
            [finalAssignments.map(a => a.lead_id), finalAssignments.map(() => null),
              finalAssignments.map(a => a.user_id), finalAssignments.map(() => importer),
              finalAssignments.map(a => `import #${batch.id}: ${a.reason}${a.rule_id ? ` (rule ${a.rule_id})` : ''}`)]);
        }

        // A batch of activity rows, not one INSERT per lead. Deduplicated: unnest()
        // arrays must not repeat a lead_id.
        const uniqueNewLeadIds = [...new Set(newLeadIds)];
        if (uniqueNewLeadIds.length) {
          await tq(
            `INSERT INTO lead_activities (lead_id, user_id, activity_type, summary, metadata)
             SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::text[], $5::jsonb[])`,
            [uniqueNewLeadIds, uniqueNewLeadIds.map(() => importer), uniqueNewLeadIds.map(() => 'system'),
              uniqueNewLeadIds.map(() => 'Lead created by spreadsheet import'),
              uniqueNewLeadIds.map(() => JSON.stringify({ source_file: meta.filename || null, format: meta.format, batch_id: batch.id }))]);
        }

        // Record the unmatched names so they stay visible until an admin binds
        // them, rather than being rediscovered on the next import. The tally is a
        // Map keyed BY NAME, so the name is the key, not a field of the value.
        for (const [name, t] of telecallerTally.entries()) {
          if (t.user_id) {
            await tq(
              `UPDATE lead_telecaller_unmatched SET last_seen_at = NOW(), leads_count = $2
                WHERE lower(btrim(name)) = lower(btrim($1))`, [name, t.leads_count]);
          } else {
            await tq(
              `INSERT INTO lead_telecaller_unmatched (name, leads_count, last_seen_at)
               VALUES ($1, $2, NOW())
               ON CONFLICT (name) DO UPDATE
                 SET leads_count = lead_telecaller_unmatched.leads_count + EXCLUDED.leads_count,
                     last_seen_at = NOW()`, [name, t.leads_count]);
          }
        }

        const telecallers = [...telecallerTally.entries()].map(([name, t]) => ({
          name, matched_user_id: t.user_id, match_source: t.source, leads_count: t.leads_count,
        })).sort((a, b) => b.leads_count - a.leads_count || a.name.localeCompare(b.name));

        errors.sort((a, b) => a.row - b.row);
        const totals = {
          total_rows: dataRows.length, inserted, updated, skipped, errors: errors.length,
          duplicates_flagged: flagged.length, assigned: finalAssignments.length,
          unassigned_new: inserted - finalAssignments.filter(a => newLeadIds.includes(a.lead_id)).length,
          by_user: plan.summary.byUser, by_reason: plan.summary.byReason,
        };
        await tq('UPDATE lead_import_batches SET totals = $2, assignment = $3 WHERE id = $1',
          [batch.id, JSON.stringify(totals), JSON.stringify(options)]);

        return {
          batch, inserted, updated, skipped, errors, flagged,
          total_rows: dataRows.length,
          assigned: assignedByName, unassigned: unassignedByName,
          telecallers, unmatched_names: telecallers.filter(t => t.matched_user_id === null).map(t => t.name),
          plan, finalAssignments,
        };
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      console.error('Lead import commit error:', e);
      throw new AppError(500, 'Import failed', { error: e.message });
    }

    await audit(null, ctx, 'lead.import_committed', 'lead_batch', result.batch.id, {
      filename: meta.filename || null, format: meta.format, sheet: meta.sheet, profile,
      total_rows: result.total_rows, inserted: result.inserted, updated: result.updated,
      skipped: result.skipped, errors: result.errors.length,
      duplicates_flagged: result.flagged.length, unmatched_telecallers: result.unmatched_names,
      assignment: options,
    });

    const users = await this.userNames(Object.keys(result.plan.summary.byUser));
    return {
      format: meta.format,
      sheet: meta.sheet,
      sheets: meta.sheets,
      filename: meta.filename || null,
      total_rows: result.total_rows,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      ok: result.total_rows - result.errors.length - result.skipped,
      duplicates_flagged: result.flagged.length,
      duplicate_rows: result.flagged.slice(0, MAX_REPORTED_PROBLEMS),
      assigned_to_a_user: result.assigned,
      left_unassigned: result.unassigned,
      telecallers: result.telecallers,
      unmatched_names: result.unmatched_names,
      // Corrections the server could not honour. Present so a silent no-op on an
      // operator's mapping is always visible.
      mapping_warnings: mappingWarnings,
      // New: batch + what the assignment chain did.
      batch_id: result.batch.id,
      profile,
      assignment: {
        options,
        total: result.plan.summary.total,
        unassigned: result.plan.summary.unassigned,
        by_reason: result.plan.summary.byReason,
        by_user: Object.entries(result.plan.summary.byUser)
          .map(([id, n]) => ({ user_id: Number(id), name: users.get(Number(id)) || `user ${id}`, leads: n }))
          .sort((a, b) => b.leads - a.leads || a.user_id - b.user_id),
      },
    };
  }

  // ───────────────────────── batches ─────────────────────────
  async batches(ctx, query) {
    const limit = Math.min(Math.max(parseInt(query.limit) || 50, 1), 200);
    const r = await q(
      `SELECT b.id, b.filename, b.format, b.sheet, b.profile, b.totals, b.assignment, b.created_at,
              b.created_by, u.name AS created_by_name,
              (SELECT COUNT(*)::int FROM leads l WHERE l.import_batch_id = b.id AND l.merged_into_lead_id IS NULL) AS leads_now,
              (SELECT COUNT(*)::int FROM leads l WHERE l.import_batch_id = b.id AND l.merged_into_lead_id IS NULL AND l.assigned_to IS NULL) AS unassigned_now
         FROM lead_import_batches b LEFT JOIN users u ON u.id = b.created_by
        ORDER BY b.id DESC LIMIT $1`, [limit]);
    return r.rows;
  }

  async batch(ctx, idRaw) {
    const id = parseInt(idRaw);
    if (!Number.isInteger(id)) throw new ValidationError('Invalid batch id');
    const b = (await this.batches(ctx, { limit: 200 })).find(x => x.id === id);
    if (!b) throw new NotFoundError('Import batch not found');
    const byUser = await q(
      `SELECT l.assigned_to AS user_id, u.name, COUNT(*)::int AS leads
         FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
        WHERE l.import_batch_id = $1 AND l.merged_into_lead_id IS NULL
        GROUP BY 1, 2 ORDER BY leads DESC, 2`, [id]);
    return { ...b, by_user: byUser.rows.map(r => ({ user_id: r.user_id, name: r.name || null, leads: r.leads })) };
  }

  // ───────────────────────── legacy simple CSV import ─────────────────────────
  // POST /api/leads/import — the original name/phone/email CSV. Kept as-is for
  // existing callers; the sheet-style flow above is the main path.
  async simpleCsv(ctx, file) {
    if (!file) throw new ValidationError('file required (multipart field "file")');
    let parsed;
    try { parsed = parseCsv(file.buffer.toString('utf8')); }
    catch (e) { throw new ValidationError('Could not parse CSV'); }
    if (parsed.length < 2) throw new ValidationError('CSV needs a header row and at least one data row');

    const CSV_FIELD_ALIASES = {
      name: ['name', 'lead_name', 'fullname', 'full_name', 'contact', 'contact_name', 'customer'],
      phone: ['phone', 'phone_number', 'phonenumber', 'mobile', 'mobile_number', 'contact_number', 'number'],
      email: ['email', 'email_address', 'mail'],
      source: ['source', 'lead_source', 'channel'],
      priority: ['priority', 'prio'],
      status: ['status', 'stage'],
      notes: ['notes', 'note', 'comments', 'comment', 'description'],
    };
    const IMPORTABLE_PRIORITIES = ['low', 'normal', 'medium', 'high', 'urgent', 'critical'];

    // Map header positions onto our field names. Unknown columns are ignored.
    const header = parsed[0].map(h => String(h).trim().toLowerCase().replace(/[\s-]+/g, '_'));
    const colOf = {};
    for (const [field, aliases] of Object.entries(CSV_FIELD_ALIASES)) {
      const idx = header.findIndex(h => aliases.includes(h));
      if (idx !== -1) colOf[field] = idx;
    }
    if (colOf.name === undefined && colOf.phone === undefined) throw new ValidationError('CSV needs at least a name or phone column');

    const dataRows = parsed.slice(1);
    if (dataRows.length > IMPORT_ROW_CAP) {
      // Reject rather than truncate: a silently partial import looks identical to
      // a complete one in the report.
      throw new AppError(400, `Too many rows: ${dataRows.length}. Maximum is ${IMPORT_ROW_CAP}`, { total_rows: dataRows.length, max_rows: IMPORT_ROW_CAP });
    }

    const client = await pool.connect();
    const errors = [];
    let inserted = 0, updated = 0;
    try {
      await client.query('BEGIN');
      const stageSlugs = new Set((await client.query('SELECT slug FROM pipeline_stages')).rows.map(s => s.slug.toLowerCase()));

      for (let i = 0; i < dataRows.length; i++) {
        const cells = dataRows[i];
        const rowNo = i + 2;                 // row 1 is the header
        const get = f => (colOf[f] === undefined ? '' : String(cells[colOf[f]] ?? '').trim());

        const name = get('name'), phone = get('phone'), email = get('email'), source = get('source');
        const priority = get('priority').toLowerCase(), status = get('status').toLowerCase(), notes = get('notes');
        const phoneDigits = phone.replace(/\D/g, '');

        if (!name && !phone) { errors.push({ row: rowNo, error: 'name and phone are both empty' }); continue; }
        if (!name) { errors.push({ row: rowNo, error: 'name is required', value: { phone, email } }); continue; }
        if (!phone || phoneDigits.length < 6) { errors.push({ row: rowNo, error: 'a usable phone number is required', value: { name, phone } }); continue; }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push({ row: rowNo, error: `invalid email '${email}'`, value: { name, phone } }); continue; }
        if (priority && !IMPORTABLE_PRIORITIES.includes(priority)) {
          errors.push({ row: rowNo, error: `invalid priority '${priority}' (allowed: ${IMPORTABLE_PRIORITIES.join(', ')})`, value: { name, phone } }); continue;
        }
        if (status && !stageSlugs.has(status)) { errors.push({ row: rowNo, error: `unknown pipeline stage '${status}'`, value: { name, phone } }); continue; }

        await client.query('SAVEPOINT csv_row');
        try {
          // Upsert on phone. Exact match first; if that misses, fall back to the
          // last 9 digits so "+919876543210" updates "9876543210".
          let existing = await client.query('SELECT id FROM leads WHERE phone = $1 LIMIT 1', [phone]);
          if (existing.rows.length === 0 && phoneDigits.length >= 9) {
            existing = await client.query(
              `SELECT id FROM leads
                WHERE RIGHT(regexp_replace(COALESCE(phone,''), '\\D', '', 'g'), 9) = $1
                LIMIT 1`, [phoneDigits.slice(-9)]);
          }
          if (existing.rows.length) {
            // Only non-empty columns are written, so a sparse row can never blank
            // out a field someone already filled in by hand.
            await client.query(
              `UPDATE leads SET
                 name    = COALESCE(NULLIF($2,''), name),
                 email   = COALESCE(NULLIF($3,''), email),
                 source  = COALESCE(NULLIF($4,''), source),
                 priority= COALESCE(NULLIF($5,''), priority),
                 status  = COALESCE(NULLIF($6,''), status),
                 notes   = COALESCE(NULLIF($7,''), notes),
                 updated_at = NOW()
               WHERE id = $1`,
              [existing.rows[0].id, name, email, source, priority, status, notes]);
            updated++;
          } else {
            const ins = await client.query(
              `INSERT INTO leads (name,phone,email,status,source,priority,notes,owner_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
              [name, phone, email || null, status || 'new', source || null, priority || 'normal', notes || null, parseInt(ctx.userId)]);
            await LeadActivityService.record(client, {
              leadId: ins.rows[0].id, userId: parseInt(ctx.userId), type: 'system',
              summary: 'Lead created by CSV import', metadata: { source_file: file.originalname },
            });
            inserted++;
          }
          await client.query('RELEASE SAVEPOINT csv_row');
        } catch (e) {
          // A single bad row must not abort the file: report it and carry on.
          await client.query('ROLLBACK TO SAVEPOINT csv_row');
          await client.query('RELEASE SAVEPOINT csv_row');
          errors.push({ row: rowNo, error: e.message, value: { name, phone, email } });
        }
      }
      await audit(client, ctx, 'lead.imported', 'lead_batch', null, {
        filename: file.originalname, total_rows: dataRows.length, inserted, updated, errors: errors.length,
      });
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

    return {
      total_rows: dataRows.length, inserted, updated, errors,
      // rows that produced no error at all
      ok: dataRows.length - errors.length,
      columns_mapped: colOf,
    };
  }
}

module.exports = new LeadImportService();
