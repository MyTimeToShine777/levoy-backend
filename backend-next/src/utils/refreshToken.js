'use strict';

const crypto = require('crypto');

// A refresh key looks like "c<company id>_<64 hex letters>". The company id is in the open so the server knows
// which company's database to look in before it has any other information about the caller.
const SHAPE = /^c(\d+)_[0-9a-f]{64}$/;

const newRefreshToken = customerId => `c${customerId}_${crypto.randomBytes(32).toString('hex')}`;

// Only this hash is stored, so a copy of the database cannot be used to sign in.
const hashRefreshToken = token => crypto.createHash('sha256').update(String(token)).digest('hex');

// The company id inside a refresh key, or null when it is not shaped like one.
function customerIdOfRefreshToken(token) {
  const m = SHAPE.exec(String(token || ''));
  return m ? parseInt(m[1]) : null;
}

module.exports = { newRefreshToken, hashRefreshToken, customerIdOfRefreshToken };
