'use strict';

// In-memory rate limiter: a Map of key -> {count, resetAt}, swept lazily.
// Per-process, which is the right trade for a single-instance node server.
// Keys are composed by the caller so one limiter can enforce both a per-IP and
// a per-email budget.
function rateLimit({ windowMs, max, keyFn, code = 'rate_limited', message }) {
  const hits = new Map();
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  };
  return (req, res, next) => {
    sweep();
    const key = keyFn(req);
    const now = Date.now();
    let b = hits.get(key);
    if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + windowMs }; hits.set(key, b); }
    b.count += 1;
    const remaining = Math.max(0, max - b.count);
    res.set('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
    res.set('X-RateLimit-Remaining', String(remaining));
    if (b.count > max) {
      return res.status(429).json({ detail: message || code, retry_after_seconds: Math.ceil((b.resetAt - now) / 1000) });
    }
    next();
  };
}

module.exports = rateLimit;
