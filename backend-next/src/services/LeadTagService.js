'use strict';

const { pool, q } = require('../config/db');
const { ValidationError, NotFoundError, AppError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { loadLeadForRead } = require('../utils/leadAccess');

class LeadTagService {
  // Tags for a page of leads in one query, grouped in JS.
  async tagsForLeads(leadIds) {
    const map = new Map();
    if (!leadIds.length) return map;
    const r = await q(
      `SELECT lt.lead_id, t.id, t.name, t.color
         FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id
        WHERE lt.lead_id = ANY($1) ORDER BY t.name`, [leadIds]);
    for (const t of r.rows) {
      if (!map.has(t.lead_id)) map.set(t.lead_id, []);
      map.get(t.lead_id).push({ id: t.id, name: t.name, color: t.color });
    }
    return map;
  }

  async tagIdsForLead(leadId) {
    const r = await q('SELECT tag_id FROM lead_tags WHERE lead_id = $1', [leadId]);
    return r.rows.map(x => x.tag_id);
  }

  // Reads are open to any authenticated user (tags only label leads they may
  // already see); creating/deleting the shared vocabulary is manager+.
  async list() {
    const r = await q(
      `SELECT t.id, t.name, t.color, t.created_at,
              cu.name AS created_by_name,
              COUNT(lt.lead_id) AS lead_count
         FROM tags t
         LEFT JOIN users cu ON cu.id = t.created_by
         LEFT JOIN lead_tags lt ON lt.tag_id = t.id
         LEFT JOIN leads l ON l.id = lt.lead_id AND l.merged_into_lead_id IS NULL
        GROUP BY t.id, t.name, t.color, t.created_at, cu.name
        ORDER BY LOWER(t.name)`);
    return r.rows.map(t => ({
      id: t.id, name: t.name, color: t.color, created_at: t.created_at,
      created_by_name: t.created_by_name, lead_count: parseInt(t.lead_count) || 0,
    }));
  }

  async create(ctx, body) {
    const name = String(body.name || '').trim();
    if (!name) throw new ValidationError('name required');
    // Case-insensitive uniqueness: "Hot Lead" and "hot lead" must not both exist.
    const dupe = await q('SELECT id FROM tags WHERE LOWER(name) = LOWER($1)', [name]);
    if (dupe.rows.length) throw new ValidationError('Tag already exists');
    try {
      const r = await q(
        'INSERT INTO tags (name, color, created_by) VALUES ($1,$2,$3) RETURNING *',
        [name, body.color || '#3b82f6', parseInt(ctx.userId)]);
      await audit(null, ctx, 'tag.created', 'tag', r.rows[0].id, { name, color: r.rows[0].color });
      return r.rows[0];
    } catch (e) {
      if (e.code === '23505') throw new ValidationError('Tag already exists');
      throw e;
    }
  }

  async remove(ctx, tagId) {
    const existing = await q('SELECT * FROM tags WHERE id = $1', [tagId]);
    if (existing.rows.length === 0) throw new NotFoundError('Not found');
    // lead_tags rows go with it (ON DELETE CASCADE).
    const used = await q('SELECT COUNT(*)::int AS c FROM lead_tags WHERE tag_id = $1', [tagId]);
    await q('DELETE FROM tags WHERE id = $1', [tagId]);
    await audit(null, ctx, 'tag.deleted', 'tag', tagId,
      { name: existing.rows[0].name, detached_leads: used.rows[0].c });
    return { id: parseInt(tagId), deleted: true, detached_leads: used.rows[0].c };
  }

  async forLead(ctx, leadId) {
    const lead = await loadLeadForRead(ctx, leadId);
    const r = await q(
      `SELECT t.id, t.name, t.color FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id
        WHERE lt.lead_id = $1 ORDER BY LOWER(t.name)`, [lead.id]);
    return r.rows;
  }

  // Replace the lead's whole tag set in one shot. Validating every id up front
  // means a typo in the payload cannot leave the lead half-tagged.
  async replaceForLead(ctx, leadId, body) {
    const lead = await loadLeadForRead(ctx, leadId);
    const ids = body.tag_ids;
    if (!Array.isArray(ids)) throw new ValidationError('tag_ids must be an array');
    const tagIds = [...new Set(ids.map(x => parseInt(x)).filter(Number.isInteger))];
    if (tagIds.length) {
      const known = await q('SELECT id, name, color FROM tags WHERE id = ANY($1) ORDER BY LOWER(name)', [tagIds]);
      const missing = tagIds.filter(id => !known.rows.some(t => t.id === id));
      if (missing.length) throw new AppError(400, 'Unknown tag ids', { tag_ids: missing });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM lead_tags WHERE lead_id = $1', [lead.id]);
      for (const id of tagIds) {
        await client.query('INSERT INTO lead_tags (lead_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [lead.id, id]);
      }
      await client.query('UPDATE leads SET updated_at = NOW() WHERE id = $1', [lead.id]);
      await audit(client, ctx, 'lead.tags_replaced', 'lead', lead.id, { tag_ids: tagIds });
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

    const tags = await q(
      `SELECT t.id, t.name, t.color FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id
        WHERE lt.lead_id = $1 ORDER BY LOWER(t.name)`, [lead.id]);
    return { lead_id: lead.id, tags: tags.rows, tag_ids: tagIds.map(id => id) };
  }
}

module.exports = new LeadTagService();
