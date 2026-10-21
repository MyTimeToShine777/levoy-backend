'use strict';

const StripeService = require('../services/StripeService');
const PushService = require('../services/PushService');
const PlanCatalog = require('../platform/PlanCatalogService');
const { ctxOf } = require('../utils/audit');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Small standalone page the browser lands on after Stripe. It must work with no login: the phone's browser
// and the dashboard are different "apps" — the result is verified with Stripe, not trusted from the URL.
function page(title, message, ok, backUrl, backLabel) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#191a1e;color:#fff;font:16px system-ui,sans-serif}
main{max-width:380px;padding:32px;text-align:center}.i{width:72px;height:72px;margin:0 auto 20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:36px;background:${ok ? '#2e9e2e' : '#d6341c'}}
h1{font-size:22px;margin:0 0 10px}p{color:#a6a7ad;line-height:1.5}a{display:inline-block;margin-top:22px;padding:14px 26px;border-radius:14px;background:#fdbc00;color:#222328;font-weight:700;text-decoration:none}</style></head>
<body><main><div class="i">${ok ? '✓' : '!'}</div><h1>${esc(title)}</h1><p>${esc(message)}</p>${backUrl ? `<a href="${esc(backUrl)}">${esc(backLabel)}</a>` : ''}</main></body></html>`;
}

class PaymentController {
  checkout = async (req, res) => res.status(201).json(await StripeService.checkout(ctxOf(req), req.body || {}, req));

  confirm = async (req, res) => res.json(await StripeService.confirm((req.body || {}).session_id));

  payments = async (req, res) => res.json(await StripeService.history(ctxOf(req)));

  webhook = async (req, res) => res.json(await StripeService.webhook(req.body, req.get('stripe-signature')));

  success = async (req, res) => {
    const back = StripeService.safeReturn(req, req.query.r);
    try {
      const r = await StripeService.inCustomer(req.query.c, () => StripeService.confirm(req.query.session_id));
      if (r.status === 'paid') {
        const plan = await StripeService.inCustomer(req.query.c, () => PlanCatalog.get(r.plan));
        const name = plan ? plan.name : 'Your plan';
        return res.type('html').send(page('Payment received', `${name} is now active. You can go back to Callio.`, true, back, 'Back to Callio'));
      }
      return res.type('html').send(page('Payment not completed yet', 'Stripe has not confirmed this payment. If you were charged, it will activate on its own within a few minutes.', false, back, 'Back to Callio'));
    } catch (e) {
      return res.status(e.status || 400).type('html').send(page('Could not confirm the payment', e.message || 'Please try again from Callio.', false, back, 'Back to Callio'));
    }
  };

  cancel = async (req, res) => {
    const back = StripeService.safeReturn(req, req.query.r);
    res.type('html').send(page('Payment cancelled', 'Nothing was charged.', false, back, 'Back to Callio'));
  };

  // ── push tokens ──
  registerPush = async (req, res) => res.json(await PushService.register(ctxOf(req), req.body || {}));

  unregisterPush = async (req, res) => res.json(await PushService.unregister(ctxOf(req), (req.body || {}).token || req.query.token));

  testPush = async (req, res) => {
    const ctx = ctxOf(req);
    const tokens = await PushService.tokensOf(parseInt(ctx.userId));
    const r = await PushService.send(parseInt(ctx.userId), { title: 'Callio', body: 'Push notifications are working on this phone.', data: { type: 'test' } });
    res.json({ devices: tokens.length, push_enabled: PushService.enabled(), ...r });
  };
}

module.exports = new PaymentController();
