'use strict';

const { q } = require('../config/db');
const ReminderService = require('./ReminderService');

class NotificationService {
  async list(ctx) {
    // Reminders that have come due turn into notifications the first time anyone looks.
    await ReminderService.fireDue(parseInt(ctx.userId)).catch(() => {});
    const unread = await q('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false', [ctx.userId]);
    const r = await q('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [ctx.userId]);
    return {
      unread: parseInt(unread.rows[0].count),
      notifications: r.rows.map(n => ({
        id: n.id, type: n.type, title: n.title, message: n.message, data: n.data,
        is_read: n.is_read, created_at: n.created_at,
      })),
    };
  }

  async markRead(ctx, id) {
    await q('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [id, ctx.userId]);
    return { read: true };
  }

  async markAllRead(ctx) {
    await q('UPDATE notifications SET is_read = true WHERE user_id = $1', [ctx.userId]);
    return { readAll: true };
  }

  async remove(ctx, id) {
    await q('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [id, ctx.userId]);
    return { deleted: true };
  }
}

module.exports = new NotificationService();
