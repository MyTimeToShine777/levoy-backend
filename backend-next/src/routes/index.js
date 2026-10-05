'use strict';

// Route registry. Each domain exposes an express Router; routers are mounted
// at the application root because the existing URLs ("/api/leads", "/health",
// ...) must not change.
//
// ORDER MATTERS: literal paths (/api/leads/import/*, /api/leads/call-queue,
// /api/leads/pipeline ...) must be registered before the parameterised
// /api/leads/:leadId routes, or ":leadId" would swallow them.
module.exports = function mountRoutes(app) {
  // Identity, access control, people
  app.use(require('./authRoutes'));
  app.use(require('./platformRoutes'));      // the platform owner's Customers console (platform sessions only)
  app.use(require('./rbacRoutes'));
  app.use(require('./userRoutes'));
  app.use(require('./teamRoutes'));

  // Leads domain — literal paths first, /:leadId last.
  app.use(require('./leadImportRoutes'));
  app.use(require('./leadConfigRoutes'));
  app.use(require('./analyticsRoutes'));
  app.use(require('./pipelineRoutes'));
  app.use(require('./assignmentRoutes'));
  app.use(require('./followUpRoutes'));
  app.use(require('./leadRoutes'));

  // Calls, quality, self-service
  app.use(require('./callRoutes'));
  app.use(require('./callInsightRoutes'));
  app.use(require('./qualityRoutes'));
  app.use(require('./accountRoutes'));
  app.use(require('./integrationRoutes'));

  // Liveness, landing pages, static avatars
  app.use(require('./systemRoutes'));
};
