'use strict';

const { validationResult } = require('express-validator');
const AuthService = require('../services/AuthService');
const { ctxOf } = require('../utils/audit');

const isValid = req => validationResult(req).isEmpty();

class AuthController {
  registrationStatus = async (req, res) => res.json(AuthService.registrationStatus());

  sendOtp = async (req, res) => res.json(await AuthService.sendOtp(ctxOf(req), req.body, isValid(req)));

  verifyOtp = async (req, res) => res.json(await AuthService.verifyOtp(ctxOf(req), req.body, isValid(req)));

  refresh = async (req, res) => res.json(await AuthService.refresh(ctxOf(req), req.body));

  logout = async (req, res) => res.json(await AuthService.logout(req.body));

  acceptInvite = async (req, res) => {
    const out = await AuthService.acceptInvite(ctxOf(req), req.body, isValid(req));
    res.status(201).json(out);
  };

  me = async (req, res) => res.json(req.platformAdmin ? await AuthService.platformMe(req.platformAdmin.id) : await AuthService.me(req.userId));
}

module.exports = new AuthController();
