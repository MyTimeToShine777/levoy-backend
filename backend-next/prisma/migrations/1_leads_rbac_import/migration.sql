-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "external_id" VARCHAR(80),
ADD COLUMN     "import_batch_id" INTEGER,
ADD COLUMN     "lead_meta" JSONB,
ADD COLUMN     "received_at" TIMESTAMP(6);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "custom_role_id" INTEGER;

-- CreateTable
CREATE TABLE "role_permission_profiles" (
    "id" SERIAL NOT NULL,
    "role" VARCHAR(40) NOT NULL,
    "permissions" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permission_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_roles" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "base_role" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "permissions" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "permissions" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_import_batches" (
    "id" SERIAL NOT NULL,
    "filename" VARCHAR(255),
    "format" VARCHAR(10),
    "sheet" VARCHAR(120),
    "profile" VARCHAR(40),
    "totals" JSONB,
    "assignment" JSONB,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_profiles_role_key" ON "role_permission_profiles"("role");

-- CreateIndex
CREATE UNIQUE INDEX "custom_roles_key_key" ON "custom_roles"("key");

-- CreateIndex
CREATE INDEX "custom_roles_base_role_idx" ON "custom_roles"("base_role");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_profiles_user_id_key" ON "user_permission_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_lead_import_batches_created" ON "lead_import_batches"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_leads_external_id" ON "leads"("external_id");

-- CreateIndex
CREATE INDEX "idx_leads_import_batch" ON "leads"("import_batch_id");

-- CreateIndex
CREATE INDEX "users_custom_role_id_idx" ON "users"("custom_role_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_custom_role_id_fkey" FOREIGN KEY ("custom_role_id") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_permission_profiles" ADD CONSTRAINT "user_permission_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "lead_import_batches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lead_import_batches" ADD CONSTRAINT "lead_import_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

