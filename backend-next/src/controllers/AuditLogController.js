'use strict';

const AuditLogService = require('../services/AuditLogService');
const { requireAdmin } = require('../middleware/requireRole');

class AuditLogController {
  list = async (req, res) => {
    requireAdmin(req);
    res.json(await AuditLogService.list(req.query));
  };
}

module.exports = new AuditLogController();
