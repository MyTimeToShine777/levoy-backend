'use strict';

const { currentTenant } = require('../config/db');

// Files from every customer share one storage area (the local uploads folder, or one R2 bucket). Names that are
// generated from something that repeats across customers — a user id, a millisecond timestamp — are prefixed with
// the customer, so two customers can never write to (or read) the same file.
// Uploads with random names (avatars, recordings) are already unique and do not need it.
function tenantTag() {
  const t = currentTenant();
  if (!t) throw new Error('No customer context for a storage path');
  return `c${t.id}-`;
}

module.exports = { tenantTag };
