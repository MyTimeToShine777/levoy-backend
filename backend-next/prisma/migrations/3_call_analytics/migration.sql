-- Call analytics, contacts, premium features, device health.
--
-- NOT expressible in Prisma (kept here only, like the earlier CHECK constraints):
--   • the trigger that fills call_events.phone_key from phone_number
--   • CHECK constraints on call_events.source and workspace_plan.plan / status

-- ───────────── call_events: SIM, source (SIM vs WhatsApp), a normalised phone key
ALTER TABLE "call_events"
  ADD COLUMN "sim_slot"  INTEGER,
  ADD COLUMN "sim_label" VARCHAR(100),
  ADD COLUMN "source"    VARCHAR(20) NOT NULL DEFAULT 'sim',
  ADD COLUMN "phone_key" VARCHAR(10);

ALTER TABLE "call_events" ADD CONSTRAINT "call_events_source_check" CHECK ("source" IN ('sim', 'whatsapp'));

-- The last 10 digits identify a person across "+91 98765 43210", "09876543210" and "9876543210".
UPDATE "call_events" SET "phone_key" = right(regexp_replace("phone_number", '\D', '', 'g'), 10);

CREATE FUNCTION call_events_set_phone_key() RETURNS trigger AS $$
BEGIN
  NEW.phone_key := right(regexp_replace(COALESCE(NEW.phone_number, ''), '\D', '', 'g'), 10);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_events_phone_key_trg
  BEFORE INSERT OR UPDATE OF "phone_number" ON "call_events"
  FOR EACH ROW EXECUTE FUNCTION call_events_set_phone_key();

CREATE INDEX "idx_calls_user_ts" ON "call_events"("user_id", "timestamp" DESC);
CREATE INDEX "idx_calls_phone_key" ON "call_events"("phone_key");

-- ───────────── tags on a call (reuses the shared tags table)
CREATE TABLE "call_event_tags" (
    "call_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,
    CONSTRAINT "call_event_tags_pkey" PRIMARY KEY ("call_id", "tag_id")
);
ALTER TABLE "call_event_tags" ADD CONSTRAINT "call_event_tags_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "call_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "call_event_tags" ADD CONSTRAINT "call_event_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
CREATE INDEX "idx_call_event_tags_tag" ON "call_event_tags"("tag_id");

-- ───────────── contact groups (Premium Plus)
CREATE TABLE "contact_groups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "color" VARCHAR(20) DEFAULT '#f59e0b',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contact_groups_name_key" ON "contact_groups"("name");
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE "contact_group_members" (
    "group_id" INTEGER NOT NULL,
    "phone_key" VARCHAR(10) NOT NULL,
    "added_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_group_members_pkey" PRIMARY KEY ("group_id", "phone_key")
);
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "contact_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
CREATE INDEX "idx_group_members_phone" ON "contact_group_members"("phone_key");

-- ───────────── missed-call reminders
CREATE TABLE "call_reminders" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "phone_number" VARCHAR(50) NOT NULL,
    "note" TEXT NOT NULL,
    "remind_at" TIMESTAMP(6),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "notified_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "call_reminders_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "call_reminders" ADD CONSTRAINT "call_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
CREATE INDEX "idx_call_reminders_user" ON "call_reminders"("user_id", "done", "remind_at");

-- ───────────── SIM numbers and their verification
CREATE TABLE "user_sims" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "label" VARCHAR(100),
    "number" VARCHAR(30),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verify_method" VARCHAR(20),
    "verified_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_sims_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_sims_user_id_slot_key" ON "user_sims"("user_id", "slot");
ALTER TABLE "user_sims" ADD CONSTRAINT "user_sims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ───────────── what the phone app reports about itself (permissions, battery, last sync)
CREATE TABLE "user_devices" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_name" VARCHAR(120) NOT NULL,
    "app_version" VARCHAR(30),
    "last_sync_at" TIMESTAMP(6),
    "permissions" JSONB,
    "battery_optimized" BOOLEAN,
    "default_dialer" BOOLEAN,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_devices_user_id_device_name_key" ON "user_devices"("user_id", "device_name");
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ───────────── the workspace's plan (one row) and generic workspace settings
CREATE TABLE "workspace_plan" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "plan" VARCHAR(20) NOT NULL DEFAULT 'free',
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "trial_started_at" TIMESTAMP(6),
    "trial_ends_at" TIMESTAMP(6),
    "current_period_end" TIMESTAMP(6),
    "changed_by" INTEGER,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_plan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_plan_single_row" CHECK ("id" = 1),
    CONSTRAINT "workspace_plan_plan_check" CHECK ("plan" IN ('free', 'premium', 'premium_plus', 'biz')),
    CONSTRAINT "workspace_plan_status_check" CHECK ("status" IN ('active', 'trial', 'expired', 'cancelled'))
);
INSERT INTO "workspace_plan" ("id") VALUES (1);

CREATE TABLE "workspace_settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" TEXT,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("key")
);
