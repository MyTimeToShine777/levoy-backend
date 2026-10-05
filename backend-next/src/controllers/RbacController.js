'use strict';

const RbacService = require('../services/RbacService');
const { ctxOf } = require('../utils/audit');
const { ValidationError } = require('../exceptions');

const intParam = (v, label) => {
  const n = parseInt(v);
  if (!Number.isInteger(n)) throw new ValidationError(`Invalid ${label}`);
  return n;
};

class RbacController {
  // Registry + every role's permissions + custom roles: all the RBAC page needs.
  matrix = async (req, res) => res.json(await RbacService.matrix());

  saveRole = async (req, res) =>
    res.json(await RbacService.saveRoleProfile(ctxOf(req), req.params.role, req.body.permissions || req.body));

  resetRole = async (req, res) => res.json(await RbacService.resetRoleProfile(ctxOf(req), req.params.role));

  createCustomRole = async (req, res) => res.status(201).json(await RbacService.createCustomRole(ctxOf(req), req.body));

  updateCustomRole = async (req, res) =>
    res.json(await RbacService.updateCustomRole(ctxOf(req), intParam(req.params.id, 'custom role id'), req.body));

  deleteCustomRole = async (req, res) =>
    res.json(await RbacService.deleteCustomRole(ctxOf(req), intParam(req.params.id, 'custom role id')));

  listUsers = async (req, res) => res.json(await RbacService.listUsers());

  getUser = async (req, res) => res.json(await RbacService.userPermissions(intParam(req.params.userId, 'user id')));

  saveUser = async (req, res) =>
    res.json(await RbacService.saveUserOverride(ctxOf(req), intParam(req.params.userId, 'user id'), req.body.permissions || req.body));

  resetUser = async (req, res) =>
    res.json(await RbacService.resetUserOverride(ctxOf(req), intParam(req.params.userId, 'user id')));

  setUserCustomRole = async (req, res) =>
    res.json(await RbacService.assignCustomRole(ctxOf(req), intParam(req.params.userId, 'user id'), req.body.custom_role_id));
}

module.exports = new RbacController();
