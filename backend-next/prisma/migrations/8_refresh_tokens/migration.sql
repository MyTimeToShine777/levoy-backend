-- Long-lived sign-in keys (refresh tokens). Only a hash of each key is stored. A key is used once: each use hands out a new key
-- in the same family ("family_id" = one sign-in on one device). An old key shown again means it was copied, so its family is cancelled.
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "family_id" VARCHAR(36) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "revoked_at" TIMESTAMP(6),
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens"("user_id");
CREATE INDEX "idx_refresh_tokens_family" ON "refresh_tokens"("family_id");
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
