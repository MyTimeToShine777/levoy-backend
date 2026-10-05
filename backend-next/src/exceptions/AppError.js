'use strict';

// An error that knows its HTTP status. Services throw these; the central
// errorHandler turns them into the API's `{ detail }` body.
class AppError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} detail human-readable message (becomes `detail`)
   * @param {object} [extra] extra top-level fields merged into the body
   */
  constructor(status, detail, extra) {
    super(detail);
    this.name = this.constructor.name;
    this.status = status;
    this.detail = detail;
    this.extra = extra || null;
  }
}

class ValidationError extends AppError { constructor(detail = 'Validation failed', extra) { super(400, detail, extra); } }
class AuthenticationError extends AppError { constructor(detail = 'Not authenticated', extra) { super(401, detail, extra); } }
class ForbiddenError extends AppError { constructor(detail = 'Forbidden', extra) { super(403, detail, extra); } }
class NotFoundError extends AppError { constructor(detail = 'Not found', extra) { super(404, detail, extra); } }
class ConflictError extends AppError { constructor(detail = 'Conflict', extra) { super(409, detail, extra); } }

module.exports = { AppError, ValidationError, AuthenticationError, ForbiddenError, NotFoundError, ConflictError };
