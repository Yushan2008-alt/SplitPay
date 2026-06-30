import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CreateAllTables
 *
 * Initial migration that creates the complete SplitPay database schema.
 * Follows PRD-B01 exactly: all tables, constraints, indexes, and partial indexes.
 *
 * Tables created (in dependency order):
 *   1. users
 *   2. otp_codes
 *   3. refresh_tokens
 *   4. groups
 *   5. group_members
 *   6. payment_periods
 *   7. payment_records
 *   8. notification_logs
 *   9. push_subscriptions
 */
export class CreateAllTables1751204400000 implements MigrationInterface {
  name = 'CreateAllTables1751204400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ──────────────────────────────────────────────────────────────
    // EXTENSIONS
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ──────────────────────────────────────────────────────────────
    // ENUM TYPES (PostgreSQL native enums for strict type safety)
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."split_method_enum" AS ENUM (
          'equal', 'custom_percentage', 'custom_nominal', 'pro_rata'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."billing_frequency_enum" AS ENUM (
          'monthly', 'yearly', 'weekly'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."group_status_enum" AS ENUM (
          'active', 'paused', 'cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."member_role_enum" AS ENUM (
          'host', 'payer'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."member_status_enum" AS ENUM (
          'active', 'inactive', 'removed'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."notification_preference_enum" AS ENUM (
          'email', 'push', 'both', 'none'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."period_status_enum" AS ENUM (
          'upcoming', 'active', 'completed', 'overdue'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."payment_status_enum" AS ENUM (
          'pending', 'paid', 'overdue', 'waived'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."notification_type_enum" AS ENUM (
          'reminder_3d', 'reminder_1d', 'reminder_0d',
          'payment_confirmed', 'overdue_alert'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."notification_channel_enum" AS ENUM (
          'email', 'push', 'sms'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."notification_status_enum" AS ENUM (
          'pending', 'sent', 'failed'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    // ──────────────────────────────────────────────────────────────
    // TABLE 1: users
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "email"             VARCHAR(255) NOT NULL,
        "name"              VARCHAR(100) NOT NULL,
        "phone"             VARCHAR(255),
        "is_email_verified" BOOLEAN     NOT NULL DEFAULT false,
        "last_login_at"     TIMESTAMPTZ,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"        TIMESTAMPTZ,
        CONSTRAINT "users_pkey"         PRIMARY KEY ("id"),
        CONSTRAINT "users_email_unique" UNIQUE ("email")
      )
    `);

    // Partial index: only active (non-deleted) users
    await queryRunner.query(`
      CREATE INDEX "idx_users_email"
        ON "users" ("email")
        WHERE "deleted_at" IS NULL
    `);

    // ──────────────────────────────────────────────────────────────
    // TABLE 2: otp_codes
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "otp_codes" (
        "id"         UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "email"      VARCHAR(255) NOT NULL,
        "code_hash"  VARCHAR(255) NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "is_used"    BOOLEAN     NOT NULL DEFAULT false,
        "attempts"   INT         NOT NULL DEFAULT 0,
        "ip_address" INET,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
      )
    `);

    // Composite index for efficient OTP lookup
    await queryRunner.query(`
      CREATE INDEX "idx_otp_email"
        ON "otp_codes" ("email", "is_used", "expires_at")
    `);

    // ──────────────────────────────────────────────────────────────
    // TABLE 3: refresh_tokens
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"          UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"     UUID        NOT NULL,
        "token_hash"  VARCHAR(255) NOT NULL,
        "expires_at"  TIMESTAMPTZ NOT NULL,
        "is_revoked"  BOOLEAN     NOT NULL DEFAULT false,
        "family_id"   VARCHAR(255),
        "device_info" VARCHAR(255),
        "user_agent"  TEXT,
        "ip_address"  INET,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "refresh_tokens_pkey"       PRIMARY KEY ("id"),
        CONSTRAINT "refresh_tokens_hash_unique" UNIQUE ("token_hash"),
        CONSTRAINT "refresh_tokens_user_fk"    FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Partial indexes: only active (non-revoked) tokens
    await queryRunner.query(`
      CREATE INDEX "idx_refresh_token_hash"
        ON "refresh_tokens" ("token_hash")
        WHERE "is_revoked" = false
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_refresh_token_user"
        ON "refresh_tokens" ("user_id")
        WHERE "is_revoked" = false
    `);

    // ──────────────────────────────────────────────────────────────
    // TABLE 4: groups
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "groups" (
        "id"                UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "host_id"           UUID        NOT NULL,
        "name"              VARCHAR(100) NOT NULL,
        "service_name"      VARCHAR(100) NOT NULL,
        "description"       TEXT,
        "total_amount"      DECIMAL(15,2) NOT NULL,
        "frequency"         "public"."billing_frequency_enum" NOT NULL,
        "due_day"           SMALLINT    NOT NULL,
        "split_method"      "public"."split_method_enum" NOT NULL,
        "grace_period_days" SMALLINT    NOT NULL DEFAULT 3,
        "status"            "public"."group_status_enum" NOT NULL DEFAULT 'active',
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"        TIMESTAMPTZ,
        CONSTRAINT "groups_pkey"          PRIMARY KEY ("id"),
        CONSTRAINT "groups_total_amount_check"     CHECK ("total_amount" > 0),
        CONSTRAINT "groups_due_day_check"          CHECK ("due_day" BETWEEN 1 AND 28),
        CONSTRAINT "groups_grace_period_check"     CHECK ("grace_period_days" >= 0),
        CONSTRAINT "groups_host_fk" FOREIGN KEY ("host_id")
          REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_groups_host_id"
        ON "groups" ("host_id")
        WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_groups_status"
        ON "groups" ("status")
        WHERE "deleted_at" IS NULL
    `);

    // ──────────────────────────────────────────────────────────────
    // TABLE 5: group_members
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "group_members" (
        "id"                      UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "group_id"                UUID         NOT NULL,
        "user_id"                 UUID,
        "email"                   VARCHAR(255) NOT NULL,
        "display_name"            VARCHAR(100) NOT NULL,
        "role"                    "public"."member_role_enum" NOT NULL,
        "share_amount"            DECIMAL(15,2) NOT NULL,
        "share_percentage"        DECIMAL(5,2),
        "notification_preference" "public"."notification_preference_enum" NOT NULL DEFAULT 'both',
        "status"                  "public"."member_status_enum" NOT NULL DEFAULT 'active',
        "joined_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "created_at"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "deleted_at"              TIMESTAMPTZ,
        CONSTRAINT "group_members_pkey"          PRIMARY KEY ("id"),
        CONSTRAINT "group_members_share_check"   CHECK ("share_amount" >= 0),
        CONSTRAINT "group_members_pct_check"     CHECK ("share_percentage" BETWEEN 0 AND 100),
        CONSTRAINT "group_members_unique_email"  UNIQUE ("group_id", "email")
          DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT "group_members_group_fk" FOREIGN KEY ("group_id")
          REFERENCES "groups"("id") ON DELETE CASCADE,
        CONSTRAINT "group_members_user_fk" FOREIGN KEY ("user_id")
          REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_group_members_group"
        ON "group_members" ("group_id", "status")
        WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_group_members_user"
        ON "group_members" ("user_id")
        WHERE "deleted_at" IS NULL
    `);

    // ──────────────────────────────────────────────────────────────
    // TABLE 6: payment_periods
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "payment_periods" (
        "id"              UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "group_id"        UUID         NOT NULL,
        "period_start"    DATE         NOT NULL,
        "period_end"      DATE         NOT NULL,
        "due_date"        DATE         NOT NULL,
        "status"          "public"."period_status_enum" NOT NULL DEFAULT 'upcoming',
        "total_collected" DECIMAL(15,2) NOT NULL DEFAULT 0,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "payment_periods_pkey"   PRIMARY KEY ("id"),
        CONSTRAINT "payment_periods_unique" UNIQUE ("group_id", "period_start"),
        CONSTRAINT "payment_periods_group_fk" FOREIGN KEY ("group_id")
          REFERENCES "groups"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_payment_periods_group"
        ON "payment_periods" ("group_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_payment_periods_due_date"
        ON "payment_periods" ("due_date", "status")
    `);

    // ──────────────────────────────────────────────────────────────
    // TABLE 7: payment_records
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "payment_records" (
        "id"                      UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "period_id"               UUID         NOT NULL,
        "member_id"               UUID         NOT NULL,
        "amount_due"              DECIMAL(15,2) NOT NULL,
        "amount_paid"             DECIMAL(15,2),
        "status"                  "public"."payment_status_enum" NOT NULL DEFAULT 'pending',
        "confirmed_at"            TIMESTAMPTZ,
        "confirmation_token_hash" VARCHAR(255),
        "token_expires_at"        TIMESTAMPTZ,
        "token_used"              BOOLEAN      NOT NULL DEFAULT false,
        "payment_method"          VARCHAR(100),
        "payment_note"            TEXT,
        "confirmed_by"            VARCHAR(20),
        "created_at"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "payment_records_pkey"         PRIMARY KEY ("id"),
        CONSTRAINT "payment_records_amount_due_check"  CHECK ("amount_due" >= 0),
        CONSTRAINT "payment_records_amount_paid_check" CHECK ("amount_paid" >= 0),
        CONSTRAINT "payment_records_confirmed_by_check"
          CHECK ("confirmed_by" IN ('self', 'host', 'webhook')),
        CONSTRAINT "payment_records_unique" UNIQUE ("period_id", "member_id"),
        CONSTRAINT "payment_records_period_fk" FOREIGN KEY ("period_id")
          REFERENCES "payment_periods"("id") ON DELETE CASCADE,
        CONSTRAINT "payment_records_member_fk" FOREIGN KEY ("member_id")
          REFERENCES "group_members"("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_payment_records_period"
        ON "payment_records" ("period_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_payment_records_member"
        ON "payment_records" ("member_id", "status")
    `);

    // [SECURITY] Partial index for unused token lookup
    // Note: NOW() is STABLE (not IMMUTABLE), so it cannot be used in partial index predicates.
    // Expiration is enforced at the application level.
    await queryRunner.query(`
      CREATE INDEX "idx_payment_records_token"
        ON "payment_records" ("confirmation_token_hash")
        WHERE "token_used" = false
    `);

    // ──────────────────────────────────────────────────────────────
    // TABLE 8: notification_logs
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "notification_logs" (
        "id"        UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "member_id" UUID         NOT NULL,
        "period_id" UUID,
        "type"      "public"."notification_type_enum"    NOT NULL,
        "channel"   "public"."notification_channel_enum" NOT NULL,
        "status"    "public"."notification_status_enum"  NOT NULL DEFAULT 'pending',
        "sent_at"   TIMESTAMPTZ,
        "metadata"  JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "notification_logs_member_fk" FOREIGN KEY ("member_id")
          REFERENCES "group_members"("id"),
        CONSTRAINT "notification_logs_period_fk" FOREIGN KEY ("period_id")
          REFERENCES "payment_periods"("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_notif_logs_member"
        ON "notification_logs" ("member_id", "type", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_notif_logs_period"
        ON "notification_logs" ("period_id")
    `);

    // [SECURITY] Partial unique index: prevents duplicate notifications
    // Only applies to successfully SENT notifications
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_notif_logs_no_dup"
        ON "notification_logs" ("member_id", "period_id", "type", "channel")
        WHERE "status" = 'sent'
    `);

    // ──────────────────────────────────────────────────────────────
    // TABLE 9: push_subscriptions
    // ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "push_subscriptions" (
        "id"         UUID NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    UUID NOT NULL,
        "endpoint"   TEXT NOT NULL,
        "p256dh"     TEXT NOT NULL,
        "auth"       TEXT NOT NULL,
        "user_agent" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "push_subscriptions_pkey"            PRIMARY KEY ("id"),
        CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE ("endpoint"),
        CONSTRAINT "push_subscriptions_user_fk" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_push_sub_user"
        ON "push_subscriptions" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse dependency order

    await queryRunner.query(
      `DROP TABLE IF EXISTS "push_subscriptions" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_logs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_records" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_periods" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "group_members" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "groups" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "otp_codes" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);

    // Drop enum types
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."notification_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."notification_channel_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."notification_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."payment_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."period_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."notification_preference_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."member_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."member_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."group_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."billing_frequency_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."split_method_enum"`);
  }
}
