'use strict';

const { pool, q } = require('../config/db');
const { ValidationError, NotFoundError, ForbiddenError } = require('../exceptions');
const { audit } = require('../utils/audit');

class TeamService {
  async create(ctx, body, query) {
    const teamName = body.name || query.name;
    if (!teamName) throw new ValidationError('Name required');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tr = await client.query('INSERT INTO teams (name, created_by) VALUES ($1,$2) RETURNING id,name,created_at', [teamName, ctx.userId]);
      const team = tr.rows[0];
      await client.query('INSERT INTO team_members (team_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [team.id, ctx.userId]);
      await client.query('COMMIT');
      return { id: team.id, name: team.name, message: 'Created' };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }

  async list(ctx) {
    const admin = ctx.role === 'admin';
    const sql = admin
      ? 'SELECT t.id,t.name,t.created_at,(SELECT COUNT(*) FROM team_members WHERE team_id=t.id) as mc FROM teams t'
      : 'SELECT t.id,t.name,t.created_at,(SELECT COUNT(*) FROM team_members WHERE team_id=t.id) as mc FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.user_id=$1';
    const r = await q(sql, admin ? [] : [ctx.userId]);
    return r.rows.map(t => ({ id: t.id, name: t.name, members: parseInt(t.mc) }));
  }

  // Admin may touch any team; a manager only their own.
  async assertCanManage(ctx, teamId) {
    if (ctx.role !== 'admin' && ctx.role !== 'manager') throw new ForbiddenError('Forbidden');
    const team = await q('SELECT id,name FROM teams WHERE id = $1', [teamId]);
    if (team.rows.length === 0) throw new NotFoundError('Team not found');
    if (ctx.role === 'manager') {
      const m = await q('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, ctx.userId]);
      if (m.rows.length === 0) throw new ForbiddenError('Not your team');
    }
    return team.rows[0];
  }

  async addMember(ctx, teamIdRaw, body) {
    if (ctx.role !== 'admin' && ctx.role !== 'manager') throw new ForbiddenError('Forbidden');
    const teamId = parseInt(teamIdRaw);
    const userId = parseInt(body.user_id);
    if (!Number.isInteger(userId)) throw new ValidationError('user_id required');
    const team = await this.assertCanManage(ctx, teamId);
    const u = await q('SELECT id,name,role,is_active FROM users WHERE id = $1', [userId]);
    if (u.rows.length === 0) throw new ValidationError('User does not exist');
    const r = await q(
      `INSERT INTO team_members (team_id, user_id) VALUES ($1,$2)
       ON CONFLICT (team_id, user_id) DO UPDATE SET joined_at = team_members.joined_at
       RETURNING id, team_id, user_id, joined_at`, [teamId, userId]);
    await audit(null, ctx, 'team.member_added', 'team', teamId,
      { team_name: team.name, user_id: userId, user_name: u.rows[0].name });
    return { ...r.rows[0], added: true };
  }

  async removeMember(ctx, teamIdRaw, userIdRaw) {
    if (ctx.role !== 'admin' && ctx.role !== 'manager') throw new ForbiddenError('Forbidden');
    const teamId = parseInt(teamIdRaw);
    const userId = parseInt(userIdRaw);
    const team = await this.assertCanManage(ctx, teamId);
    const del = await q('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 RETURNING id', [teamId, userId]);
    if (del.rows.length === 0) throw new NotFoundError('Not a member');
    await audit(null, ctx, 'team.member_removed', 'team', teamId, { team_name: team.name, user_id: userId });
    return { removed: true, team_id: teamId, user_id: userId };
  }

  // Team dashboard: today's totals + per-member stats. Agents may only open a team
  // they belong to.
  async analytics(ctx, teamId) {
    if (ctx.role === 'agent') {
      const m = await q('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, ctx.userId]);
      if (m.rows.length === 0) throw new ForbiddenError('Not a member');
    }
    // t.name is not aggregated, so it must appear in GROUP BY (Postgres 42803 otherwise).
    const team = await q('SELECT t.name, COUNT(DISTINCT tm.user_id) as members FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.id = $1 GROUP BY t.name', [teamId]);
    if (team.rows.length === 0) throw new NotFoundError('Team not found');

    const today = new Date();
    const ts = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const te = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    const memberIds = await q('SELECT user_id FROM team_members WHERE team_id = $1', [teamId]);
    const ids = memberIds.rows.map(r => r.user_id);

    const callsR = await q(
      `SELECT COUNT(*) as cnt, SUM(duration_seconds) as dur, COUNT(DISTINCT phone_number) as uniq,
              COUNT(CASE WHEN direction='incoming' THEN 1 END) as inc, COUNT(CASE WHEN direction='outgoing' THEN 1 END) as out,
              COUNT(CASE WHEN status='missed' THEN 1 END) as missed, COUNT(CASE WHEN status='rejected' THEN 1 END) as rej
         FROM call_events WHERE timestamp >= $1 AND timestamp < $2 AND user_id = ANY($3)`, [ts, te, ids]);
    const cRow = callsR.rows[0];

    const members = await q('SELECT u.id, u.name, u.email, u.role, u.avatar_url FROM users u JOIN team_members tm ON tm.user_id = u.id WHERE tm.team_id = $1', [teamId]);
    const memberStats = [];
    for (const m of members.rows) {
      const stats = await q(
        `SELECT COUNT(*) as total, SUM(duration_seconds) as dur, COUNT(DISTINCT phone_number) as uniq, COUNT(CASE WHEN status='connected' THEN 1 END) as conn
           FROM call_events WHERE user_id = $1 AND timestamp >= $2 AND timestamp < $3`, [m.id, ts, te]);
      const s = stats.rows[0];
      memberStats.push({
        id: m.id, name: m.name, email: m.email, role: m.role, avatar_url: m.avatar_url,
        total_calls: parseInt(s.total) || 0,
        total_duration: parseInt(s.dur) || 0,
        unique_contacts: parseInt(s.uniq) || 0,
        connected_calls: parseInt(s.conn) || 0,
      });
    }

    return {
      team_name: team.rows[0].name,
      member_count: parseInt(team.rows[0].members),
      today: {
        total_calls: parseInt(cRow.cnt) || 0,
        total_duration: parseInt(cRow.dur) || 0,
        unique_contacts: parseInt(cRow.uniq) || 0,
        incoming: parseInt(cRow.inc) || 0,
        outgoing: parseInt(cRow.out) || 0,
        missed: parseInt(cRow.missed) || 0,
        rejected: parseInt(cRow.rej) || 0,
      },
      members: memberStats.sort((a, b) => b.total_calls - a.total_calls),
    };
  }
}

module.exports = new TeamService();
