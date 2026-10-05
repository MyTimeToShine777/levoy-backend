-- Push notifications (Firebase Cloud Messaging), Stripe payments for plans, and a trigger that tells the API
-- process about every new notification so it can be pushed to the person's phones.

CREATE TABLE "push_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "platform" VARCHAR(20) NOT NULL DEFAULT 'android',
    "device_name" VARCHAR(120),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");
CREATE INDEX "idx_push_tokens_user" ON "push_tokens"("user_id");
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "plan_payments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "plan" VARCHAR(20) NOT NULL,
    "months" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "stripe_session_id" VARCHAR(255) NOT NULL,
    "stripe_payment_intent" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(6),
    CONSTRAINT "plan_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_payments_status_check" CHECK ("status" IN ('pending', 'paid', 'expired', 'failed'))
);
CREATE UNIQUE INDEX "plan_payments_stripe_session_id_key" ON "plan_payments"("stripe_session_id");
ALTER TABLE "plan_payments" ADD CONSTRAINT "plan_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Every new row in notifications (lead assigned, reminder due, …) is announced on a channel; the API listens
-- and pushes it to the person's phones. A trigger covers every place that inserts a notification.
CREATE OR REPLACE FUNCTION notify_new_notification() RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM pg_notify('levoy_notification', json_build_object(
      'id', NEW.id, 'user_id', NEW.user_id, 'type', NEW.type, 'title', left(NEW.title, 200), 'message', left(COALESCE(NEW.message, ''), 500),
      'data', CASE WHEN length(COALESCE(NEW.data::text, '')) < 1500 THEN NEW.data ELSE NULL END)::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notifications_notify AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION notify_new_notification();
