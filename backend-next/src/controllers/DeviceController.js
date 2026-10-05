'use strict';

const SimService = require('../services/SimService');
const DeviceService = require('../services/DeviceService');
const { ValidationError } = require('../exceptions');
const { ctxOf } = require('../utils/audit');

const idOf = v => {
  const n = parseInt(v);
  if (!Number.isInteger(n)) throw new ValidationError('id must be an integer');
  return n;
};

// SIM numbers (and their verification) and what the phone app reports about itself.
class DeviceController {
  sims = async (req, res) => res.json(await SimService.list(ctxOf(req), req.query.user_id));

  putSim = async (req, res) => res.json(await SimService.upsert(ctxOf(req), req.params.slot, req.body, req.query.user_id));

  deleteSim = async (req, res) => res.json(await SimService.remove(ctxOf(req), req.params.slot, req.query.user_id));

  reportStatus = async (req, res) => res.json(await DeviceService.report(ctxOf(req), req.body));

  devices = async (req, res) => res.json(await DeviceService.list(ctxOf(req), req.query));

  deleteDevice = async (req, res) => res.json(await DeviceService.remove(ctxOf(req), idOf(req.params.deviceId)));
}

module.exports = new DeviceController();
