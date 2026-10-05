-- Quick Call: dial from the browser (Chrome extension / dashboard) on the person's own phone.
-- A phone "links" itself and long-polls for commands; the browser posts a command.

CREATE TABLE "quick_call_devices" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_name" VARCHAR(120) NOT NULL,
    "linked_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(6),
    CONSTRAINT "quick_call_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quick_call_devices_user_id_device_name_key" ON "quick_call_devices"("user_id", "device_name");
ALTER TABLE "quick_call_devices" ADD CONSTRAINT "quick_call_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "quick_call_commands" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "phone_number" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120),
    "source" VARCHAR(30),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(6),
    CONSTRAINT "quick_call_commands_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_quick_call_pending" ON "quick_call_commands"("user_id", "delivered_at");
ALTER TABLE "quick_call_commands" ADD CONSTRAINT "quick_call_commands_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
