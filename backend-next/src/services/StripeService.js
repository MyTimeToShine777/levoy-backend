'use strict';

const { q, tx, runInTenant, currentTenant } = require('../config/db');
const Registry = require('../platform/CustomerRegistry');
const integrations = require('../config/integrations');
const { ValidationError, ForbiddenError, NotFoundError, AppError } = require('../exceptions');
const PlanService = require('./PlanService');
const Catalog = require('../platform/PlanCatalogService');
const { audit } = require('../utils/audit');

const MONTHS = [1, 3, 6, 12];

// Paying for a plan with Stripe Checkout (a hosted page, so no card data ever touches this server).
//   1. POST /api/plan/checkout  → a Checkout Session; the person pays on Stripe's page
//   2. Stripe sends them to /pay/success?session_id=…, which asks Stripe whether it was really paid
//      (the browser is never trusted) and switches the plan on — once, however often the page is reloaded
//   3. a signed webhook (checkout.session.completed) does the same, as a safety net if they close the tab
class StripeService {
  enabled() { return integrations.stripe(); }

  client() {
    if (!this.enabled()) throw new AppError(503, 'Online payment is not set up on this server');
    if (!this._c && process.env.STRIPE_FAKE === '1' && process.env.NODE_ENV !== 'production') this._c = require('./fakeStripe');
    if (!this._c) {
      const Stripe = require('stripe');
      this._c = new Stripe(process.env.STRIPE_SECRET_KEY, process.env.STRIPE_API_VERSION ? { apiVersion: process.env.STRIPE_API_VERSION } : {});
    }
    return this._c;
  }

  // Where to send the browser after paying: only addresses we trust (the dashboard's own origin, or the app's deep link).
  // The success page and the webhook are public (no login), so the customer comes from the payment itself:
  // `c` in the return URL, or `customer_id` in the Stripe session metadata. Older sessions have neither and
  // belong to customer #1.
  async inCustomer(customerId, fn) {
    const id = parseInt(customerId) || await Registry.defaultId();
    const c = id ? await Registry.byId(id) : null;
    if (!c) throw new NotFoundError('Unknown payment');
    return runInTenant(Registry.toTenant(c), fn);
  }

  safeReturn(req, wanted) {
    const w = String(wanted || '');
    if (/^levoy:\/\//.test(w)) return w;
    const allowed = new Set([req.get('origin'), ...String(process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()), process.env.APP_URL].filter(Boolean).map(s => s.replace(/\/$/, '')));
    try { const u = new URL(w); if (allowed.has(u.origin)) return u.toString(); } catch { /* not a URL */ }
    return '';
  }

  async checkout(ctx, body, req) {
    if (ctx.role !== 'admin') throw new ForbiddenError('Only an admin can buy a plan for the workspace');
    const plan = body && body.plan;
    const months = parseInt(body && body.months) || 1;
    const P = await Catalog.get(plan);
    if (!P || !P.is_active || plan === 'free') throw new ValidationError('choose a paid plan');
    if (P.price_monthly === null) throw new ValidationError(`${P.name} is priced per team — contact us`);
    if (!MONTHS.includes(months)) throw new ValidationError(`months must be one of ${MONTHS.join(', ')}`);
    const stripe = this.client();
    const amount = Math.round(P.price_monthly * months * 100);               // minor units (paise)
    const currency = P.currency.toLowerCase();
    const base = integrations.publicApiUrl(req);
    const back = this.safeReturn(req, body.return_url);
    const qs = back ? `&r=${encodeURIComponent(back)}` : '';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency, unit_amount: amount, product_data: { name: `Levoy ${P.name} — ${months} month${months === 1 ? '' : 's'}` } } }],
      success_url: `${base}/pay/success?session_id={CHECKOUT_SESSION_ID}&c=${currentTenant().id}${qs}`,
      cancel_url: `${base}/pay/cancel?x=1${qs}`,
      client_reference_id: `levoy:${ctx.userId}`,
      metadata: { app: 'levoy', plan, months: String(months), user_id: String(ctx.userId), customer_id: String(currentTenant().id) },
    });
    await q('INSERT INTO plan_payments (user_id, plan, months, amount, currency, stripe_session_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [parseInt(ctx.userId), plan, months, amount, currency.toUpperCase(), session.id]);
    await audit(null, ctx, 'plan.checkout_started', 'plan_payment', null, { plan, months, amount });
    return { url: session.url, session_id: session.id, amount, currency: currency.toUpperCase() };
  }

  // Ask Stripe what happened to a session and, if it is paid, switch the plan on. Safe to call any number of times.
  async confirm(sessionId) {
    const id = String(sessionId || '');
    if (!/^cs_[A-Za-z0-9_]+$/.test(id)) throw new ValidationError('invalid session id');
    const row = (await q('SELECT * FROM plan_payments WHERE stripe_session_id = $1', [id])).rows[0];
    if (!row) throw new NotFoundError('Unknown payment');
    if (row.status === 'paid') return { status: 'paid', plan: row.plan, months: row.months, already: true };
    const s = await this.client().checkout.sessions.retrieve(id);
    if (!s.metadata || s.metadata.app !== 'levoy') throw new NotFoundError('Unknown payment');
    if (s.payment_status === 'paid') {
      const flipped = await tx(async ({ q: tq }) => {
        // only the request that flips pending → paid grants the plan; a parallel one finds it already paid
        const u = await tq(`UPDATE plan_payments SET status = 'paid', stripe_payment_intent = $2, paid_at = (NOW() AT TIME ZONE 'UTC') WHERE id = $1 AND status <> 'paid' RETURNING id`,
          [row.id, typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent && s.payment_intent.id) || null]);
        return u.rows.length === 1;
      });
      if (flipped) {
        await PlanService.grant(row.user_id, row.plan, row.months);
        const planName = ((await Catalog.get(row.plan)) || {}).name || row.plan;
        await q(`INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, 'plan_activated', $2, $3, $4)`,
          [row.user_id, `${planName} is active`, `Your payment was received. ${planName} is on for ${row.months} month${row.months === 1 ? '' : 's'}.`, JSON.stringify({ plan: row.plan })]);
      }
      return { status: 'paid', plan: row.plan, months: row.months };
    }
    if (s.status === 'expired') { await q(`UPDATE plan_payments SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [row.id]); return { status: 'expired' }; }
    return { status: 'pending' };
  }

  async webhook(rawBody, signature) {
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new AppError(503, 'Webhook secret is not configured');
    let event;
    try { event = this.client().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET); }
    catch { throw new ValidationError('Bad webhook signature'); }
    const obj = event.data && event.data.object;
    // the account is shared with other products: ignore anything that is not ours
    if (!obj || !obj.metadata || obj.metadata.app !== 'levoy') return { ignored: true };
    const completed = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
    const expired = event.type === 'checkout.session.expired';
    if (!completed && !expired) return { ignored: true };
    // The payment belongs to one customer: handle it inside that customer's context.
    return this.inCustomer(obj.metadata.customer_id, async () => {
      if (completed) return this.confirm(obj.id);
      await q(`UPDATE plan_payments SET status = 'expired' WHERE stripe_session_id = $1 AND status = 'pending'`, [obj.id]);
      return { expired: true };
    });
  }

  async history(ctx) {
    if (ctx.role !== 'admin') throw new ForbiddenError('Admin only');
    const r = await q(
      `SELECT p.id, p.plan, p.months, p.amount, p.currency, p.status, to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              to_char(p.paid_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS paid_at, u.name AS by
         FROM plan_payments p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 50`);
    return r.rows;
  }

  // Pending sessions that Stripe has long since expired.
  async sweepPending() {
    const r = await q(`UPDATE plan_payments SET status = 'expired' WHERE status = 'pending' AND created_at < (NOW() AT TIME ZONE 'UTC') - interval '2 days'`);
    return r.rowCount;
  }
}

module.exports = new StripeService();
