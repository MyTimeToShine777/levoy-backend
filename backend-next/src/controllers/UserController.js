'use strict';

const UserService = require('../services/UserService');
const { ctxOf } = require('../utils/audit');
const { requireAdmin } = require('../middleware/requireRole');

class UserController {
  list = async (req, res) => res.json(await UserService.list(ctxOf(req), req.query));

  create = async (req, res) => {
    requireAdmin(req);
    res.status(201).json(await UserService.create(ctxOf(req), req.body));
  };

  update = async (req, res) => {
    requireAdmin(req);
    res.json(await UserService.update(ctxOf(req), req.params.userId, req.body));
  };

  setRoleLegacy = async (req, res) => {
    requireAdmin(req);
    res.json(await UserService.setRoleLegacy(ctxOf(req), req.params.userId, req.query.role));
  };

  getCapacity = async (req, res) => res.json(await UserService.getCapacity(ctxOf(req), req.params.userId));

  setCapacity = async (req, res) => res.json(await UserService.setCapacity(ctxOf(req), req.params.userId, req.body));
}

module.exports = new UserController();
