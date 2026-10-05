#!/usr/bin/env node
/*
 * Stand-in for medivoy.api's email-OTP endpoints, used by the test harness so
 * tests never email anyone or touch Medivoy's user database.
 *
 *   POST /api/auth/send-otp    {email}        -> 200, remembers the address
 *   POST /api/auth/verify-otp  {email, otp}   -> 200 when otp is 123456 and a code
 *                                                was "sent" to that address, else 400
 *   GET  /__sent                              -> every address a code was sent to
 *   POST /__reset                             -> forget them
 *
 * Special addresses: down-*@ answers 503 (outage), limited-*@ answers 429.
 */
const http = require('http');

const CODE = '123456';

function start(port = 3190) {
  const sent = [];
  const pending = new Set();
  const server = http.createServer((req, res) => {
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      let b = {};
      try { b = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
      const email = String(b.email || '').toLowerCase().trim();
      if (req.method === 'GET' && req.url === '/__sent') return json(200, { sent });
      if (req.method === 'POST' && req.url === '/__reset') { sent.length = 0; pending.clear(); return json(200, { ok: true }); }
      if (req.method === 'POST' && (req.url === '/api/auth/send-otp' || req.url === '/api/auth/verify-otp')) {
        if (email.startsWith('down-')) return json(503, { success: false, message: 'Service unavailable' });
        if (email.startsWith('limited-')) return json(429, { success: false, message: 'Too many requests' });
        if (req.url === '/api/auth/send-otp') {
          if (!email) return json(400, { success: false, message: 'Email or phone is required' });
          sent.push(email); pending.add(email);
          return json(200, { success: true, message: 'OTP sent' });
        }
        if (pending.has(email) && String(b.otp) === CODE) {
          return json(200, { success: true, data: { accessToken: 'fake-medivoy-token', user: { email } } });
        }
        return json(400, { success: false, message: 'Invalid or expired OTP' });
      }
      return json(404, { success: false, message: 'not found' });
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ port, sent, close: () => new Promise(r => server.close(r)) }));
  });
}

module.exports = { start, CODE };

if (require.main === module) {
  start(parseInt(process.env.FAKE_MEDIVOY_PORT) || 3190).then(s => console.log(`fake medivoy.api on http://127.0.0.1:${s.port} (code ${CODE})`));
}
