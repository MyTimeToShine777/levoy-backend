'use strict';

// Wrap an async route handler so a rejected promise reaches the error handler.
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
