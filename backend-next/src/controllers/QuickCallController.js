'use strict';

const QuickCallService = require('../services/QuickCallService');
const { ctxOf } = require('../utils/audit');

class QuickCallController {
  link = async (req, res) => res.json(await QuickCallService.link(ctxOf(req), req.body));

  unlink = async (req, res) => res.json(await QuickCallService.unlink(ctxOf(req), req.query.device_name));

  devices = async (req, res) => res.json(await QuickCallService.devices(ctxOf(req)));

  dial = async (req, res) => res.status(201).json(await QuickCallService.dial(ctxOf(req), req.body || {}));

  pending = async (req, res) => {
    let gone = false;
    req.on('close', () => { gone = true; });
    res.json(await QuickCallService.pending(ctxOf(req), req.query, () => gone));
  };
}

module.exports = new QuickCallController();
