'use strict';

const Customers = require('../platform/CustomerAdminService');
const Subscriptions = require('../platform/SubscriptionService');
const Catalog = require('../platform/PlanCatalogService');
const Refunds = require('../platform/RefundService');
const { ValidationError } = require('../exceptions');

const who = req => req.platformAdmin.email;
const id = req => parseInt(req.params.id);
const body = req => req.body || {};

// The platform owner's console API. Every handler is behind platformMW (platform sessions only).
class PlatformController {
  overview = async (req, res) => res.json(await Customers.overview());

  // ── customers ──
  listCustomers = async (req, res) => res.json(await Customers.list());
  createCustomer = async (req, res) => res.status(201).json(await Customers.create(who(req), body(req)));
  getCustomer = async (req, res) => res.json(await Customers.detail(id(req)));
  updateCustomer = async (req, res) => res.json(await Customers.update(who(req), id(req), body(req)));
  suspend = async (req, res) => res.json(await Customers.setStatus(who(req), id(req), 'suspended'));
  resume = async (req, res) => res.json(await Customers.setStatus(who(req), id(req), 'active'));
  enter = async (req, res) => res.json(await Customers.enter(req.platformAdmin, id(req), body(req).as));
  removeCustomer = async (req, res) => res.json(await Customers.remove(who(req), id(req), body(req).confirm));

  // ── one customer's subscription ──
  grant = async (req, res) => res.json(await Subscriptions.grant(id(req), who(req), body(req)));
  extend = async (req, res) => res.json(await Subscriptions.extend(id(req), who(req), body(req)));
  endDate = async (req, res) => res.json(await Subscriptions.setEndDate(id(req), who(req), body(req)));
  changePlan = async (req, res) => res.json(await Subscriptions.changePlan(id(req), who(req), body(req)));
  trial = async (req, res) => res.json(await Subscriptions.startTrial(id(req), who(req), body(req)));
  cancel = async (req, res) => res.json(await Subscriptions.cancel(id(req), who(req), body(req)));
  keep = async (req, res) => res.json(await Subscriptions.keep(id(req), who(req), body(req)));
  refund = async (req, res) => res.json(await Refunds.refund(who(req), id(req), body(req)));

  // ── the plan catalog ──
  listPlans = async (req, res) => res.json({ plans: await Catalog.all(), features: Catalog.featureDefs() });
  createPlan = async (req, res) => res.status(201).json(await Catalog.create(body(req)));
  updatePlan = async (req, res) => {
    if (!req.params.key) throw new ValidationError('plan key required');
    res.json(await Catalog.update(req.params.key, body(req)));
  };
  deletePlan = async (req, res) => res.json(await Catalog.remove(req.params.key));
}

module.exports = new PlatformController();
