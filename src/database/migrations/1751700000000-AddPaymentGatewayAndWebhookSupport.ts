import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentGatewayAndWebhookSupport1751700000000
  implements MigrationInterface
{
  name = 'AddPaymentGatewayAndWebhookSupport1751700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."gateway_provider_enum" AS ENUM ('midtrans', 'xendit');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "groups"
      ADD COLUMN IF NOT EXISTS "payment_provider" "public"."gateway_provider_enum"
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."payment_status_enum" RENAME TO "payment_status_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."payment_status_enum" AS ENUM (
        'pending',
        'awaiting_gateway',
        'paid',
        'failed',
        'expired',
        'pending_host_review',
        'refunded'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_records"
      ALTER COLUMN "status"
      TYPE "public"."payment_status_enum"
      USING (
        CASE
          WHEN status::text = 'overdue' THEN 'failed'
          WHEN status::text = 'waived' THEN 'refunded'
          ELSE status::text
        END
      )::"public"."payment_status_enum"
    `);
    await queryRunner.query(`DROP TYPE "public"."payment_status_enum_old"`);

    await queryRunner.query(`
      ALTER TABLE "payment_records"
      ADD COLUMN IF NOT EXISTS "gateway_provider" "public"."gateway_provider_enum",
      ADD COLUMN IF NOT EXISTS "gateway_reference_id" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "gateway_transaction_id" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "version" INT NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_records"
      DROP CONSTRAINT IF EXISTS "payment_records_confirmed_by_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_records"
      ADD CONSTRAINT "payment_records_confirmed_by_check"
      CHECK (
        "confirmed_by" IS NULL OR
        "confirmed_by" IN ('SYSTEM_WEBHOOK', 'MEMBER_SELF_REPORT', 'HOST_MANUAL')
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_payment_records_gateway_tx_unique"
      ON "payment_records" ("gateway_provider", "gateway_transaction_id")
      WHERE "gateway_transaction_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_webhook_logs" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "provider" "public"."gateway_provider_enum" NOT NULL,
        "event_type" VARCHAR(100) NOT NULL,
        "payload" JSONB NOT NULL,
        "signature_valid" BOOLEAN NOT NULL,
        "payment_id" VARCHAR(255),
        "processed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "payment_webhook_logs_pkey" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_webhook_logs"`);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_payment_records_gateway_tx_unique"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_records"
      DROP COLUMN IF EXISTS "gateway_provider",
      DROP COLUMN IF EXISTS "gateway_reference_id",
      DROP COLUMN IF EXISTS "gateway_transaction_id",
      DROP COLUMN IF EXISTS "paid_at",
      DROP COLUMN IF EXISTS "version"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_records"
      DROP CONSTRAINT IF EXISTS "payment_records_confirmed_by_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_records"
      ADD CONSTRAINT "payment_records_confirmed_by_check"
      CHECK ("confirmed_by" IN ('self', 'host', 'webhook'))
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."payment_status_enum" RENAME TO "payment_status_enum_new"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."payment_status_enum" AS ENUM ('pending', 'paid', 'overdue', 'waived')
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_records"
      ALTER COLUMN "status"
      TYPE "public"."payment_status_enum"
      USING (
        CASE
          WHEN status::text = 'failed' THEN 'overdue'
          WHEN status::text = 'expired' THEN 'overdue'
          WHEN status::text = 'awaiting_gateway' THEN 'pending'
          WHEN status::text = 'pending_host_review' THEN 'pending'
          WHEN status::text = 'refunded' THEN 'waived'
          ELSE status::text
        END
      )::"public"."payment_status_enum"
    `);
    await queryRunner.query(`DROP TYPE "public"."payment_status_enum_new"`);
    await queryRunner.query(`
      ALTER TABLE "groups" DROP COLUMN IF EXISTS "payment_provider"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."gateway_provider_enum"`);
  }
}
