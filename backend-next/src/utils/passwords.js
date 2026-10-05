'use strict';

const crypto = require('crypto');

const randomToken = () => crypto.randomBytes(32).toString('hex');

// Sign-in is by emailed code only. users.password_hash is a legacy NOT NULL column; this marker can never
// match a bcrypt hash, so no account can be entered by password even if some old client still tried.
const OTP_ONLY_HASH = '!otp-only';

module.exports = { randomToken, OTP_ONLY_HASH };
