'use strict';

const { q } = require('../config/db');
const { ValidationError } = require('../exceptions');

// `variables` is a JSONB column, so pg already hands it back as a parsed value.
// (Legacy ran JSON.parse on it, which threw for any template that had variables.)
const tmplJson = t => ({
  id: t.id, name: t.name, category: t.category, language: t.language, content: t.content,
  variables: t.variables ?? null, is_active: t.is_active, created_at: t.created_at,
});

class WhatsappTemplateService {
  async list(ctx) {
    const r = await q('SELECT * FROM whatsapp_templates WHERE user_id = $1 ORDER BY created_at DESC', [ctx.userId]);
    return r.rows.map(tmplJson);
  }

  async create(ctx, body) {
    const { name, category, language, content, variables } = body;
    if (!name || !content) throw new ValidationError('name and content required');
    const r = await q(
      'INSERT INTO whatsapp_templates (user_id, name, category, language, content, variables) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [ctx.userId, name, category || null, language || 'en', content, variables ? JSON.stringify(variables) : null]);
    return tmplJson(r.rows[0]);
  }

  async update(ctx, id, body) {
    const { name, category, language, content, variables, is_active } = body;
    const fields = [];
    const vals = [];
    let idx = 1;
    for (const [k, v] of Object.entries({ name, category, language, content, is_active })) {
      if (v !== undefined) { fields.push(`${k} = $${idx}`); vals.push(v); idx++; }
    }
    if (variables !== undefined) { fields.push(`variables = $${idx}`); vals.push(JSON.stringify(variables)); idx++; }
    if (fields.length === 0) throw new ValidationError('No fields to update');
    vals.push(id);
    const r = await q(`UPDATE whatsapp_templates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    return tmplJson(r.rows[0]);
  }

  async remove(ctx, id) {
    await q('DELETE FROM whatsapp_templates WHERE id = $1 AND user_id = $2', [id, ctx.userId]);
    return { deleted: true };
  }
}

module.exports = new WhatsappTemplateService();
