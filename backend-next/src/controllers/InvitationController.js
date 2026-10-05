'use strict';

const InvitationService = require('../services/InvitationService');
const { ctxOf } = require('../utils/audit');
const { requireAdmin } = require('../middleware/requireRole');

class InvitationController {
  create = async (req, res) => {
    requireAdmin(req);
    res.status(201).json(await InvitationService.create(ctxOf(req), req.body));
  };

  list = async (req, res) => {
    requireAdmin(req);
    res.json(await InvitationService.list(req.query));
  };

  revoke = async (req, res) => {
    requireAdmin(req);
    res.json(await InvitationService.revoke(ctxOf(req), req.params.id));
  };
}

module.exports = new InvitationController();
