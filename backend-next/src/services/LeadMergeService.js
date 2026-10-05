'use strict';

const { pool, q } = require('../config/db');
const { ValidationError, NotFoundError } = require('../exceptions');
const { audit } = require('../utils/audit');
const { normalizeName } = require('../utils/leadMath');
const { loadLeadForRead } = require('../utils/leadAccess');
const AssignmentService = require('./AssignmentService');

// Three independent signals, scored rather than filtered, so the UI can show
// "same phone (60) + same email (50)" and let a human decide.
const DUP_SCORES = { phone_exact: 80, phone_last9: 60, email: 50, name: 40 };

class LeadMergeService {
  async duplicates(ctx, leadId, query) {
    const lead = await loadLeadForRead(ctx, leadId);

    const digits = String(lead.phone || '').replace(/\D/g, '');
    const last9 = digits.length >= 9 ? digits.slice(-9) : null;
    const email = String(lead.email || '').trim().toLowerCase();
    const nameKey = normalizeName(lead.name);

    // Each condition is guarded so a lead with no phone/email does not match every
    // other lead that also has none ('' = '' would be true). $2 needs an explicit
    // ::text cast or Postgres cannot infer its type (42P08).
    const r = await q(
      `SELECT l.id, l.name, l.phone, l.email, l.status, l.priority, l.created_at, l.assigned_to,
              au.name AS assigned_to_name,
              CASE WHEN regexp_replace(COALESCE(l.phone,''),'\\D','','g') = $3 THEN 1 ELSE 0 END AS phone_exact,
              CASE WHEN $2::text IS NOT NULL
                    AND RIGHT(regexp_replace(COALESCE(l.phone,''),'\\D','','g'), 9) = $2::text THEN 1 ELSE 0 END AS phone_last9,
              CASE WHEN $4::text <> '' AND LOWER(COALESCE(l.email,'')) = $4::text THEN 1 ELSE 0 END AS email_same,
              CASE WHEN $5::text <> '' AND regexp_replace(LOWER(COALESCE(l.name,'')),'[^a-z0-9]+','','g') = $5::text THEN 1 ELSE 0 END AS name_same
         FROM leads l
         LEFT JOIN users au ON au.id = l.assigned_to
        WHERE l.id <> $1
          AND l.merged_into_lead_id IS NULL
          AND (
                ($2::text IS NOT NULL AND RIGHT(regexp_replace(COALESCE(l.phone,''),'\\D','','g'), 9) = $2::text)
             OR ($4::text <> '' AND LOWER(COALESCE(l.email,'')) = $4::text)
             OR ($5::text <> '' AND regexp_replace(LOWER(COALESCE(l.name,'')),'[^a-z0-9]+','','g') = $5::text)
          )
        ORDER BY l.id DESC
        LIMIT 300`, [lead.id, last9, digits, email, nameKey]);

    const candidates = r.rows.map(l => {
      const reasons = [];
      let score = 0;
      if (l.phone_exact) { score += DUP_SCORES.phone_exact; reasons.push('identical phone number'); }
      else if (l.phone_last9) { score += DUP_SCORES.phone_last9; reasons.push('same last 9 phone digits'); }
      if (l.email_same) { score += DUP_SCORES.email; reasons.push('same email address'); }
      if (l.name_same) { score += DUP_SCORES.name; reasons.push('same name'); }
      return {
        lead_id: l.id, name: l.name, phone: l.phone, email: l.email,
        status: l.status, priority: l.priority, created_at: l.created_at,
        assigned_to: l.assigned_to, assigned_to_name: l.assigned_to_name,
        score, reasons,
        // Which signals fired, for the UI to badge each candidate.
        matched_on: {
          phone_exact: !!l.phone_exact, phone_last9: !!l.phone_last9,
          email: !!l.email_same, name: !!l.name_same,
        },
      };
    }).filter(c => c.score > 0);

    candidates.sort((a, b) => b.score - a.score || a.lead_id - b.lead_id);
    return {
      lead: { id: lead.id, name: lead.name, phone: lead.phone, email: lead.email },
      total: candidates.length,
      candidates: candidates.slice(0, parseInt(query.limit) || 25),
    };
  }

  // Fold a duplicate lead into the surviving one. Everything is MOVED, never
  // copied and never summed: re-pointing the rows means no counter can drift. The
  // source row is soft-deleted (merged_into_lead_id) so history stays inspectable.
  async merge(ctx, sourceIdRaw, body) {
    const sourceId = parseInt(sourceIdRaw);
    const targetId = parseInt(body.into_lead_id);
    if (!Number.isInteger(targetId)) throw new ValidationError('into_lead_id must be an integer');
    if (sourceId === targetId) throw new ValidationError('Cannot merge a lead into itself');

    const both = await q('SELECT * FROM leads WHERE id = ANY($1) ORDER BY id', [[sourceId, targetId]]);
    const source = both.rows.find(l => l.id === sourceId);
    const target = both.rows.find(l => l.id === targetId);
    if (!source) throw new NotFoundError('Source lead not found');
    if (!target) throw new NotFoundError('Target lead not found');
    if (target.merged_into_lead_id) throw new ValidationError('Target lead has itself been merged away');
    if (source.merged_into_lead_id) {
      throw new ValidationError(`Source lead was already merged into #${source.merged_into_lead_id}`);
    }

    const client = await pool.connect();
    let released = false;
    const moved = {};
    try {
      await client.query('BEGIN');

      // Plain re-point: one row per table, no aggregation to get wrong.
      for (const table of ['lead_activities', 'lead_follow_ups', 'lead_assignments', 'call_reviews']) {
        const u = await client.query(`UPDATE ${table} SET lead_id = $2 WHERE lead_id = $1`, [sourceId, targetId]);
        moved[table] = u.rowCount;
      }

      // Assignees: copy across, then drop the source rows. Source owners are
      // demoted to 'collaborator' — the partial unique index allows only ONE
      // owner per lead, and a merge must never steal ownership from the survivor.
      const srcAssignees = await client.query('SELECT * FROM lead_assignees WHERE lead_id = $1', [sourceId]);
      for (const a of srcAssignees.rows) {
        await client.query(
          `INSERT INTO lead_assignees (lead_id, user_id, role, assigned_by)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (lead_id, user_id) DO NOTHING`,
          [targetId, a.user_id, a.role === 'owner' ? 'collaborator' : a.role, a.assigned_by]);
      }
      await client.query('DELETE FROM lead_assignees WHERE lead_id = $1', [sourceId]);
      await AssignmentService.syncLeadOwner(client, targetId);

      // Tags: union, then drop the source's rows.
      const srcTags = await client.query('SELECT tag_id FROM lead_tags WHERE lead_id = $1', [sourceId]);
      for (const t of srcTags.rows) {
        await client.query('INSERT INTO lead_tags (lead_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [targetId, t.tag_id]);
      }
      await client.query('DELETE FROM lead_tags WHERE lead_id = $1', [sourceId]);

      // Backfill only what the survivor is missing: filling blanks is the only
      // non-destructive merge.
      await client.query(
        `UPDATE leads SET
           email    = COALESCE(NULLIF(email,''), $2),
           source   = COALESCE(NULLIF(source,''), $3),
           notes    = COALESCE(NULLIF(notes,''), $4),
           priority = CASE WHEN priority IS NULL OR priority = '' THEN $5 ELSE priority END,
           last_contacted_at = GREATEST(COALESCE(last_contacted_at,'epoch'::timestamp), COALESCE($6,'epoch'::timestamp)),
           updated_at = NOW()
         WHERE id = $1`,
        [targetId, source.email, source.source, source.notes, source.priority, source.last_contacted_at]);

      await client.query(
        `UPDATE leads SET merged_into_lead_id = $2, deleted_at = NOW(), updated_at = NOW()
          WHERE id = $1`, [sourceId, targetId]);

      await audit(client, ctx, 'lead.merged', 'lead', sourceId, {
        into_lead_id: targetId, source_name: source.name, target_name: target.name, moved,
      });
      await client.query('COMMIT');
      client.release(); released = true;   // give the connection back BEFORE the follow-up reads: they need another one

      const after = await q('SELECT id,name,phone,email,status,assigned_to FROM leads WHERE id = $1', [targetId]);
      return {
        merged: true,
        source: { id: source.id, name: source.name, soft_deleted: true, merged_into_lead_id: targetId },
        target: after.rows[0],
        moved,
        assignees_moved: srcAssignees.rows.length,
        tags_moved: srcTags.rows.length,
        // call_events has no lead_id — calls follow the merged lead by phone.
        calls_note: 'call_events are linked by phone, not lead_id — nothing to move',
      };
    } catch (e) { if (!released) await client.query('ROLLBACK'); throw e; } finally { if (!released) client.release(); }
  }
}

module.exports = new LeadMergeService();
