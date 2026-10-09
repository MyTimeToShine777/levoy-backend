'use strict';

const UserService = require('../services/UserService');
const { ctxOf } = require('../utils/audit');
const { requireAdmin, requireManager } =require('../middleware/requireRole');

class UserController {
  list = async (req, res) => res.json(await UserService.list(ctxOf(req), req.query));

  create = async (req, res) => {
    requireAdmin(req);
    res.status(201).json(await UserService.create(ctxOf(req), req.body));
  };

  update = async (req, res) => {
    requireManager(req);
    res.json(await UserService.update(ctxOf(req), req.params.userId, req.body));
  };

  handoverRole = async (req, res) => {
    requireManager(req);
    res.json(await UserService.handoverRole(ctxOf(req), req.params.userId));
  };

  remove = async (req, res) => {
    requireAdmin(req);
    res.json(await UserService.remove(ctxOf(req), req.params.userId));
  };

  setRoleLegacy = async (req, res) => {
    requireAdmin(req);
    res.json(await UserService.setRoleLegacy(ctxOf(req), req.params.userId, req.query.role));
  };

  getCapacity = async (req, res) => res.json(await UserService.getCapacity(ctxOf(req), req.params.userId));

  setCapacity = async (req, res) => res.json(await UserService.setCapacity(ctxOf(req), req.params.userId, req.body));
}

module.exports = new UserController();
