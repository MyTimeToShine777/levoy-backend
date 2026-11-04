'use strict';

const ProfileService = require('../services/ProfileService');
const WhatsappTemplateService = require('../services/WhatsappTemplateService');
const NotificationService = require('../services/NotificationService');
const ReportService = require('../services/ReportService');
const ExportService = require('../services/ExportService');
const TeamService = require('../services/TeamService');
const AccountLifecycleService = require('../services/AccountLifecycleService');
const { ctxOf } = require('../utils/audit');

// Per-user self-service: profile, settings, templates, notifications, reports, exports.
class AccountController {
  // ── profile ──
  me = async (req, res) => res.json(await ProfileService.me(ctxOf(req)));

  updateMe = async (req, res) => res.json(await ProfileService.updateMe(ctxOf(req), req.body));

  avatar = async (req, res) => res.json(await ProfileService.setAvatar(ctxOf(req), req.file));

  getSettings = async (req, res) => res.json(await ProfileService.getSettings(ctxOf(req)));

  putSettings = async (req, res) => res.json(await ProfileService.putSettings(ctxOf(req), req.body));

  // ── whatsapp templates ──
  listTemplates = async (req, res) => res.json(await WhatsappTemplateService.list(ctxOf(req)));

  createTemplate = async (req, res) => res.status(201).json(await WhatsappTemplateService.create(ctxOf(req), req.body));

  updateTemplate = async (req, res) => res.json(await WhatsappTemplateService.update(ctxOf(req), req.params.tmplId, req.body));

  deleteTemplate = async (req, res) => res.json(await WhatsappTemplateService.remove(ctxOf(req), req.params.tmplId));

  // ── notifications ──
  listNotifications = async (req, res) => res.json(await NotificationService.list(ctxOf(req)));

  readNotification = async (req, res) => res.json(await NotificationService.markRead(ctxOf(req), req.params.notifId));

  readAllNotifications = async (req, res) => res.json(await NotificationService.markAllRead(ctxOf(req)));

  deleteNotification = async (req, res) => res.json(await NotificationService.remove(ctxOf(req), req.params.notifId));

  // ── reports ──
  dailyReport = async (req, res) => res.json(await ReportService.daily(ctxOf(req), req.query));

  generateEmailReport = async (req, res) => res.json(await ReportService.generateEmail(ctxOf(req), req.query));

  // ── exports ──
  createExport = async (req, res) => res.json(await ExportService.create(ctxOf(req), req.body));

  listExports = async (req, res) => res.json(await ExportService.list(ctxOf(req)));

  exportFile = async (req, res) => res.download(await ExportService.fileFor(ctxOf(req), req.params.expId));

  deleteExport = async (req, res) => res.json(await ExportService.remove(ctxOf(req), req.params.expId));

  // ── privacy consent + delete my account ──
  consent = async (req, res) => res.json(await AccountLifecycleService.consent(ctxOf(req)));

  acceptConsent = async (req, res) => res.json(await AccountLifecycleService.acceptConsent(ctxOf(req)));

  deleteMe = async (req, res) => res.json(await AccountLifecycleService.deleteMe(ctxOf(req), req.body));

  // ── team analytics ──
  teamAnalytics = async (req, res) => res.json(await TeamService.analytics(ctxOf(req), req.params.teamId));
}

module.exports = new AccountController();
