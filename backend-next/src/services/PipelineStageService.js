'use strict';

const { pool, q } = require('../config/db');
const { ValidationError, NotFoundError, AppError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { slugify } = require('../utils/leadMath');
const { visibleSql } = require('../utils/leadAccess');

const stageJson = s => ({
  id: s.id, name: s.name, slug: s.slug, position: s.position, color: s.color,
  is_won: s.is_won, is_lost: s.is_lost, probability: s.probability, created_at: s.created_at,
});

// The kanban columns are data, not an enum. leads.status stores the stage SLUG.
class PipelineStageService {
  stageJson(s) { return stageJson(s); }

  // Is `status` a configured pipeline stage? Leads store the stage SLUG, but the
  // name is accepted too so the API is forgiving about "Qualified" vs "qualified".
  async isValidStage(status) {
    if (status == null || status === '') return false;
    const r = await q(
      'SELECT 1 FROM pipeline_stages WHERE LOWER(slug) = LOWER($1) OR LOWER(name) = LOWER($1) LIMIT 1',
      [String(status)]);
    return r.rows.length > 0;
  }

  // Throws the standard 400 (with the list of valid slugs) for an unknown stage.
  async assertValidStage(status) {
    if (await this.isValidStage(status)) return;
    const stages = await q('SELECT slug FROM pipeline_stages ORDER BY position');
    throw new AppError(400, `Unknown pipeline stage '${status}'`, { valid_stages: stages.rows.map(s => s.slug) });
  }

  async list() {
    const r = await q('SELECT * FROM pipeline_stages ORDER BY position ASC, id ASC');
    return r.rows.map(stageJson);
  }

  async create(ctx, body) {
    const name = String(body.name || '').trim();
    if (!name) throw new ValidationError('name required');
    const slug = body.slug ? slugify(body.slug) : slugify(name);
    const dupe = await q('SELECT id FROM pipeline_stages WHERE slug = $1', [slug]);
    if (dupe.rows.length) throw new ValidationError(`Stage slug '${slug}' already exists`);

    // New stages go to the end of the board unless a position is given.
    const maxPos = await q('SELECT COALESCE(MAX(position), -1) AS maxp FROM pipeline_stages');
    const position = Number.isFinite(parseInt(body.position)) ? parseInt(body.position) : maxPos.rows[0].maxp + 1;

    try {
      const r = await q(
        `INSERT INTO pipeline_stages (name, slug, position, color, is_won, is_lost, probability)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [name, slug, position, body.color || '#64748b', !!body.is_won, !!body.is_lost,
          Math.min(Math.max(parseInt(body.probability) || 0, 0), 100)]);
      await audit(null, ctx, 'pipeline_stage.created', 'pipeline_stage', r.rows[0].id, { name, slug, position });
      return stageJson(r.rows[0]);
    } catch (e) {
      if (e.code === '23505') throw new ValidationError('Stage slug already exists');
      throw e;
    }
  }

  async update(ctx, id, body) {
    const cur = await q('SELECT * FROM pipeline_stages WHERE id = $1', [id]);
    if (!cur.rows.length) throw new NotFoundError('Not found');
    const stage = cur.rows[0];

    const fields = [], values = [];
    let idx = 1;
    const push = (col, val) => { fields.push(`${col} = $${idx}`); values.push(val); idx++; };

    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (!n) throw new ValidationError('name cannot be empty');
      push('name', n);
    }
    if (body.color !== undefined) push('color', String(body.color));
    if (body.position !== undefined) {
      const p = parseInt(body.position);
      if (!Number.isFinite(p)) throw new ValidationError('position must be an integer');
      push('position', p);
    }
    if (body.probability !== undefined) {
      const p = parseInt(body.probability);
      if (!Number.isFinite(p)) throw new ValidationError('probability must be an integer');
      push('probability', Math.min(Math.max(p, 0), 100));
    }
    if (body.is_won !== undefined) push('is_won', !!body.is_won);
    if (body.is_lost !== undefined) push('is_lost', !!body.is_lost);
    if (fields.length === 0) throw new ValidationError('No fields');

    // leads.status stores the slug, so the slug itself is immutable here —
    // renaming it would orphan every lead sitting in that stage.
    values.push(id);
    const r = await q(`UPDATE pipeline_stages SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    await audit(null, ctx, 'pipeline_stage.updated', 'pipeline_stage', id, {
      fields: fields.map(f => f.split(' =')[0]),
      before: { name: stage.name, position: stage.position, probability: stage.probability },
      after: { name: r.rows[0].name, position: r.rows[0].position, probability: r.rows[0].probability },
    });
    return stageJson(r.rows[0]);
  }

  async reorder(ctx, body) {
    const ids = body.ordered_ids;
    if (!Array.isArray(ids) || ids.length === 0) throw new ValidationError('ordered_ids must be a non-empty array');
    const stageIds = ids.map(x => parseInt(x)).filter(Number.isInteger);
    const known = await q('SELECT id FROM pipeline_stages WHERE id = ANY($1)', [stageIds]);
    const missing = stageIds.filter(id => !known.rows.some(s => s.id === id));
    if (missing.length) throw new AppError(400, 'Unknown stage ids', { stage_ids: missing });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Position is set from array order, so the UI can drag-and-drop without
      // computing gaps or renumbering the whole table.
      for (let i = 0; i < stageIds.length; i++) {
        await client.query('UPDATE pipeline_stages SET position = $1 WHERE id = $2', [i, stageIds[i]]);
      }
      await audit(client, ctx, 'pipeline_stage.reordered', 'pipeline_stage', null, { ordered_ids: stageIds });
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

    const after = await q('SELECT * FROM pipeline_stages ORDER BY position ASC, id ASC');
    return { stages: after.rows.map(stageJson) };
  }

  async remove(ctx, id, query) {
    const cur = await q('SELECT * FROM pipeline_stages WHERE id = $1', [id]);
    if (!cur.rows.length) throw new NotFoundError('Not found');
    const stage = cur.rows[0];

    const total = await q('SELECT COUNT(*)::int AS c FROM pipeline_stages');
    if (total.rows[0].c <= 1) throw new ValidationError('Cannot delete the last remaining stage');

    const affected = await q('SELECT id FROM leads WHERE status = $1 AND merged_into_lead_id IS NULL', [stage.slug]);
    const force = query.force === 'true';
    if (affected.rows.length && !force) {
      // Refused rather than cascaded: silently moving live deals into "new"
      // would quietly reset a pipeline nobody asked to reset.
      throw new AppError(400,
        `${affected.rows.length} lead(s) are still in '${stage.slug}'. Re-run with ?force=true to move them to 'new'`,
        { leads_in_stage: affected.rows.length, example_lead_ids: affected.rows.slice(0, 10).map(l => l.id) });
    }

    const client = await pool.connect();
    let moved = 0;
    try {
      await client.query('BEGIN');
      if (affected.rows.length) {
        const fallback = await client.query("SELECT id FROM pipeline_stages WHERE slug = 'new'");
        if (!fallback.rows.length) throw new Error(`Cannot force-delete '${stage.slug}': no 'new' stage exists to move leads into`);
        const up = await client.query(
          `UPDATE leads SET status = 'new', updated_at = NOW()
            WHERE status = $1 AND merged_into_lead_id IS NULL`, [stage.slug]);
        moved = up.rowCount;
      }
      await client.query('DELETE FROM pipeline_stages WHERE id = $1', [stage.id]);
      await audit(client, ctx, 'pipeline_stage.deleted', 'pipeline_stage', stage.id,
        { name: stage.name, slug: stage.slug, forced: force, leads_moved_to_new: moved });
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

    return { id: stage.id, name: stage.name, slug: stage.slug, deleted: true, forced: force, leads_moved_to_new: moved };
  }

  // Every live lead bucketed into its stage column, with assignee info so a card
  // can render without a second request.
  async board(ctx) {
    const stagesR = await q('SELECT * FROM pipeline_stages ORDER BY position ASC, id ASC');
    const stages = stagesR.rows;

    // Merged-away leads are history, not work in progress, so they never reach
    // the board. An agent only ever sees leads they may access.
    const params = [];
    const where = ' WHERE l.merged_into_lead_id IS NULL' + visibleSql(ctx, 'l', params);

    const leadsR = await q(
      `SELECT l.id, l.name, l.phone, l.email, l.status, l.priority, l.source,
              l.assigned_to, l.updated_at, l.created_at,
              au.name AS assigned_to_name, au.avatar_url AS assigned_to_avatar
         FROM leads l
         LEFT JOIN users au ON au.id = l.assigned_to
         ${where}
        ORDER BY l.updated_at DESC
        LIMIT 2000`, params);

    const byStage = new Map(stages.map(s => [s.slug, []]));
    const unmapped = [];
    for (const l of leadsR.rows) {
      const key = String(l.status || '').toLowerCase();
      if (byStage.has(key)) byStage.get(key).push(l);
      else unmapped.push(l); // e.g. a status from before the stage was renamed
    }

    const cols = stages.map(s => {
      const leads = byStage.get(s.slug) || [];
      return {
        ...stageJson(s),
        is_open: !s.is_won && !s.is_lost,
        lead_count: leads.length,
        leads: leads.map(l => ({
          id: l.id, name: l.name, phone: l.phone, email: l.email, status: l.status,
          priority: l.priority, source: l.source,
          assigned_to: l.assigned_to, assigned_to_name: l.assigned_to_name,
          assigned_to_avatar: l.assigned_to_avatar,
          updated_at: l.updated_at, created_at: l.created_at,
        })),
      };
    });

    return {
      stages: cols,
      totals: {
        leads: leadsR.rows.length,
        open: cols.filter(c => c.is_open).reduce((n, c) => n + c.lead_count, 0),
        won: cols.filter(c => c.is_won).reduce((n, c) => n + c.lead_count, 0),
        lost: cols.filter(c => c.is_lost).reduce((n, c) => n + c.lead_count, 0),
        unmapped: unmapped.length,
      },
      // Leads whose status no longer matches any stage — surfaced instead of
      // dropped so a mis-typed status is visible rather than silently lost.
      unmapped: unmapped.map(l => ({ id: l.id, name: l.name, status: l.status })),
    };
  }
}

module.exports = new PipelineStageService();
