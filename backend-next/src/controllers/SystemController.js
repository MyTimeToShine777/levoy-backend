'use strict';

// Liveness + the friendly landing pages. No auth, no database.
class SystemController {
  health = (req, res) => res.json({ status: 'ok' });

  // Bare "/" is a friendly landing page rather than a one-line JSON blob, so
  // hitting the API host in a browser shows something useful. Browsers asking for
  // HTML get HTML; API clients still get JSON.
  root = (req, res) => {
    if (!req.accepts('html')) {
      return res.json({ name: 'Callio Clone API', version: '1.0.0', status: 'running' });
    }
    res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Callio API</title>
<style>
 body{margin:0;padding:3rem 1.5rem;font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;
      background:#f5f6fa;color:#0b1220;display:flex;justify-content:center}
 .w{max-width:640px;width:100%}
 .pill{display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;
       padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700}
 h1{margin:14px 0 4px;font-size:26px;letter-spacing:-.02em}
 code{background:#fff;border:1px solid #e6e8f0;border-radius:6px;padding:1px 6px;font-size:13px}
 pre{background:#fff;border:1px solid #e6e8f0;border-radius:12px;padding:14px;overflow:auto;font-size:13px}
 ul{padding-left:18px} a{color:#4f46e5}
</style></head><body><div class="w">
<span class="pill">API is running</span>
<h1>Callio Clone API</h1>
<p>The JSON service behind the dashboard. The dashboard itself is the web app on port&nbsp;3000.</p>
<pre>GET  /health          liveness probe</pre>
<p>Everything under <code>/api</code> requires a bearer token:</p>
<pre>POST /api/auth/send-otp    {"email":"..."}            emails a 6-digit code
POST /api/auth/verify-otp  {"email":"...","otp":"123456"}  returns the token
Authorization: Bearer &lt;token&gt;</pre>
<p>Full endpoint reference: the <code>/api-doc</code> page on the dashboard host.</p>
</div></body></html>`);
  };

  // Hitting /api bare used to 404 with Express's HTML error page.
  api = (req, res) =>
    res.json({
      name: 'Callio Clone API',
      version: '1.0.0',
      hint: 'Sign in with POST /api/auth/send-otp then /api/auth/verify-otp, then send "Authorization: Bearer <token>".',
      docs: '/api-doc (on the dashboard host)',
    });

  // Uploaded FILES are not served statically. Recordings go through the
  // authenticated endpoint only; avatars are exposed under /uploads/avatars
  // because they appear in other users' rows.
  uploadsDisabled = (req, res) =>
    res.status(404).json({ detail: 'Direct file access is disabled. Use the authenticated API endpoints.' });
}

module.exports = new SystemController();
