'use strict';

const CallHistoryService = require('../services/CallHistoryService');
const ReminderService = require('../services/ReminderService');
const CallExportService = require('../services/CallExportService');
const ExportService = require('../services/ExportService');
const { ValidationError } = require('../exceptions');
const { ctxOf } = require('../utils/audit');

const idOf = (v, what = 'id') => {
  const n = parseInt(v);
  if (!Number.isInteger(n)) throw new ValidationError(`${what} must be an integer`);
  return n;
};

// Call history (tabs, filters, notes/tags), missed-call reminders and the Excel/backup exports.
class CallHistoryController {
  list = async (req, res) => res.json(await CallHistoryService.list(ctxOf(req), req.query));

  tags = async (req, res) => res.json(await CallHistoryService.tags());

  people = async (req, res) => res.json(await CallHistoryService.people(ctxOf(req)));

  annotate = async (req, res) => res.json(await CallHistoryService.annotate(ctxOf(req), idOf(req.params.callId, 'callId'), req.body));

  // ── reminders ──
  listReminders = async (req, res) => res.json(await ReminderService.list(ctxOf(req), req.query));

  createReminder = async (req, res) => res.status(201).json(await ReminderService.create(ctxOf(req), req.body || {}));

  updateReminder = async (req, res) => res.json(await ReminderService.update(ctxOf(req), idOf(req.params.reminderId), req.body || {}));

  deleteReminder = async (req, res) => res.json(await ReminderService.remove(ctxOf(req), idOf(req.params.reminderId)));

  // ── exports ──
  callReport = async (req, res) => res.status(201).json(await CallExportService.callReport(ctxOf(req), { ...req.query, ...(req.body || {}) }));

  contactReport = async (req, res) => res.status(201).json(await CallExportService.contactReport(ctxOf(req), { ...req.query, ...(req.body || {}) }));

  workingHoursReport = async (req, res) => res.status(201).json(await CallExportService.workingHoursReport(ctxOf(req), { ...req.query, ...(req.body || {}) }));

  backup = async (req, res) => {
    const data = await CallExportService.backup(ctxOf(req));
    res.set('Content-Disposition', `attachment; filename="levoy-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(data);
  };

  restore = async (req, res) => res.json(await CallExportService.restore(ctxOf(req), req.body));

  // Only the caller's own export files.
  exportFile = async (req, res) => {
    const fp = await ExportService.fileFor(ctxOf(req), idOf(req.params.expId, 'expId'));
    res.download(fp);
  };
}

module.exports = new CallHistoryController();
