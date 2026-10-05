'use strict';

const { migratePlatform } = require('../platform/migrate');
const Tenants = require('../platform/TenantService');

// Startup database preparation: the platform schema first, then every customer's own schema
// (Prisma migrations + reference data), so one deploy upgrades all customers.
async function initDB() {
  await migratePlatform();
  await Tenants.ensureDefaultPlans();
  await Tenants.ensurePlatformAdmins();
  await Tenants.ensureDefaultCustomer();
  await Tenants.prepareAll();
  console.log('DB initialized');
}

module.exports = { initDB };
