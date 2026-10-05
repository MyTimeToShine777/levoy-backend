'use strict';

const FollowUpService = require('../services/FollowUpService');
const { ctxOf } = require('../utils/audit');

class FollowUpController {
  create = async (req, res) => res.status(201).json(await FollowUpService.create(ctxOf(req), req.params.leadId, req.body));

  listForLead = async (req, res) => res.json(await FollowUpService.listForLead(ctxOf(req), req.params.leadId));

  patch = async (req, res) => res.json(await FollowUpService.patch(ctxOf(req), req.params.fuId, req.body));

  due = async (req, res) => res.json(await FollowUpService.due(ctxOf(req), req.query));
}

module.exports = new FollowUpController();
