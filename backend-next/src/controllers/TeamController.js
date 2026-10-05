'use strict';

const TeamService = require('../services/TeamService');
const { ctxOf } = require('../utils/audit');

class TeamController {
  create = async (req, res) => res.status(201).json(await TeamService.create(ctxOf(req), req.body, req.query));

  list = async (req, res) => res.json(await TeamService.list(ctxOf(req)));

  addMember = async (req, res) =>
    res.status(201).json(await TeamService.addMember(ctxOf(req), req.params.teamId, req.body));

  removeMember = async (req, res) =>
    res.json(await TeamService.removeMember(ctxOf(req), req.params.teamId, req.params.userId));
}

module.exports = new TeamController();
