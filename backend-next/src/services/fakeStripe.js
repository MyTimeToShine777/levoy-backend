'use strict';

// TEST STAND-IN for the Stripe SDK — used only when STRIPE_FAKE=1 and NODE_ENV is not "production" (see
// config/integrations.js and StripeService.client()). It lets the harness exercise checkout, the signed webhook
// and refunds without Stripe credentials or network. A session counts as paid only after a webhook event with
// signature "fake-signature" announces `checkout.session.completed` for it.

const sessions = new Map();
const completed = new Set();
let sessionSeq = 0;
let refundSeq = 0;

module.exports = {
  checkout: {
    sessions: {
      async create(params) {
        const id = `cs_fake_${++sessionSeq}`;
        const price = params.line_items && params.line_items[0] && params.line_items[0].price_data;
        sessions.set(id, { metadata: params.metadata || {}, amount: price ? price.unit_amount : 0 });
        return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
      },
      async retrieve(id) {
        const s = sessions.get(id);
        if (!s) { const e = new Error('No such checkout.session'); e.statusCode = 404; throw e; }
        const paid = completed.has(id);
        return {
          id, status: paid ? 'complete' : 'open', payment_status: paid ? 'paid' : 'unpaid',
          payment_intent: paid ? `pi_fake_${id}` : null, metadata: s.metadata,
        };
      },
    },
  },
  refunds: {
    async create({ payment_intent: pi, amount }) {
      if (!pi) throw new Error('payment_intent required');
      return { id: `re_fake_${++refundSeq}`, status: 'succeeded', amount, payment_intent: pi };
    },
  },
  webhooks: {
    constructEvent(raw, signature) {
      if (signature !== 'fake-signature') throw new Error('No signatures found matching the expected signature');
      const ev = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
      if (ev.type === 'checkout.session.completed' && ev.data && ev.data.object) completed.add(ev.data.object.id);
      return ev;
    },
  },
};
