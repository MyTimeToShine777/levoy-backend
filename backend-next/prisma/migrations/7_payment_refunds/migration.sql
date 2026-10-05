-- Refunds: how much of a payment has been given back, when, and the Stripe refund id.
ALTER TABLE "plan_payments" DROP CONSTRAINT "plan_payments_status_check";
ALTER TABLE "plan_payments" ADD CONSTRAINT "plan_payments_status_check"
  CHECK ("status" IN ('pending', 'paid', 'expired', 'failed', 'refunded', 'partially_refunded'));
ALTER TABLE "plan_payments"
  ADD COLUMN "refunded_amount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_at" TIMESTAMP(6),
  ADD COLUMN "stripe_refund_id" VARCHAR(255),
  ADD COLUMN "refund_note" TEXT;
