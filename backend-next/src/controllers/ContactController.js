'use strict';

const ContactService = require('../services/ContactService');
const { ValidationError } = require('../exceptions');
const { ctxOf } = require('../utils/audit');

const idOf = v => {
  const n = parseInt(v);
  if (!Number.isInteger(n)) throw new ValidationError('id must be an integer');
  return n;
};

// People (grouped by phone number) and the groups Premium Plus lets you put them in.
class ContactController {
  list = async (req, res) => res.json(await ContactService.list(ctxOf(req), req.query));

  compare = async (req, res) => res.json(await ContactService.compare(ctxOf(req), req.query));

  detail = async (req, res) => res.json(await ContactService.detail(ctxOf(req), req.params.phone, req.query));

  groups = async (req, res) => res.json(await ContactService.groups());

  createGroup = async (req, res) => res.status(201).json(await ContactService.createGroup(ctxOf(req), req.body || {}));

  updateGroup = async (req, res) => res.json(await ContactService.updateGroup(ctxOf(req), idOf(req.params.groupId), req.body || {}));

  deleteGroup = async (req, res) => res.json(await ContactService.deleteGroup(ctxOf(req), idOf(req.params.groupId)));

  addMembers = async (req, res) => res.json(await ContactService.addMembers(ctxOf(req), idOf(req.params.groupId), req.body || {}));

  removeMember = async (req, res) => res.json(await ContactService.removeMember(ctxOf(req), idOf(req.params.groupId), req.params.phone));
}

module.exports = new ContactController();
