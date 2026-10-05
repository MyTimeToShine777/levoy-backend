'use strict';

// Express's default 404 is an HTML page; the API answers JSON.
function notFound(req, res) {
  res.status(404).json({ detail: 'Not found' });
}

module.exports = notFound;
