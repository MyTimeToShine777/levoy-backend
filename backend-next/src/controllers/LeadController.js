'use strict';

const LeadService = require('../services/LeadService');
const LeadActivityService = require('../services/LeadActivityService');
const LeadMergeService = require('../services/LeadMergeService');
const LeadTagService = require('../services/LeadTagService');
const RbacService = require('../services/RbacService');
const { can } = require('../config/rbac');
const { ctxOf } = require('../utils/audit');
const { requireManager } = require('../middleware/requireRole');

class LeadController {
  create = async (req, res) => res.status(201).json(await LeadService.create(ctxOf(req), req.body));

  list = async (req, res) => {
    const { rows, total } = await LeadService.list(ctxOf(req), req.query);
    res.set('X-Total-Count', String(total));
    res.json(rows);
  };

  summary = async (req, res) => res.json(await LeadService.summary(ctxOf(req)));

  get = async (req, res) => res.json(await LeadService.get(ctxOf(req), req.params.leadId));

  update = async (req, res) => {
    // Changing the owner through PUT is an assignment: it needs the `assign` action.
    let canAssign = true;
    if (req.body && req.body.assigned_to !== undefined) {
      const eff = await RbacService.effectiveFor({ id: parseInt(req.userId), role: req.userRole, customRoleId: req.customRoleId });
      canAssign = can(eff, 'leads', 'assign');
    }
    res.json(await LeadService.update(ctxOf(req), req.params.leadId, req.body, { canAssign }));
  };

  remove = async (req, res) => res.json(await LeadService.remove(ctxOf(req), req.params.leadId));

  contact = async (req, res) => res.json(await LeadService.contact(ctxOf(req), req.params.leadId));

  bulkStatus = async (req, res) => {
    requireManager(req);
    res.json(await LeadService.bulkStatus(ctxOf(req), req.body));
  };

  // ── timeline / activities ──
  timeline = async (req, res) => res.json(await LeadActivityService.timeline(ctxOf(req), req.params.leadId, req.query));

  addActivity = async (req, res) => res.status(201).json(await LeadActivityService.add(ctxOf(req), req.params.leadId, req.body));

  // ── duplicates / merge ──
  duplicates = async (req, res) => res.json(await LeadMergeService.duplicates(ctxOf(req), req.params.leadId, req.query));

  merge = async (req, res) => {
    requireManager(req);
    res.json(await LeadMergeService.merge(ctxOf(req), req.params.leadId, req.body));
  };

  // ── tags ──
  listTags = async (req, res) => res.json(await LeadTagService.list());

  createTag = async (req, res) => {
    requireManager(req);
    res.status(201).json(await LeadTagService.create(ctxOf(req), req.body));
  };

  deleteTag = async (req, res) => {
    requireManager(req);
    res.json(await LeadTagService.remove(ctxOf(req), req.params.tagId));
  };

  leadTags = async (req, res) => res.json(await LeadTagService.forLead(ctxOf(req), req.params.leadId));

  setLeadTags = async (req, res) => {
    requireManager(req);
    res.json(await LeadTagService.replaceForLead(ctxOf(req), req.params.leadId, req.body));
  };
}

module.exports = new LeadController();
