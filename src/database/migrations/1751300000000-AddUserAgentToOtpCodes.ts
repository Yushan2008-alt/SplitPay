import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddUserAgentToOtpCodes
 *
 * Adds user_agent column to otp_codes table for device tracking.
 * PRD-B01 §5: Track device/user-agent for anomaly detection.
 */
export class AddUserAgentToOtpCodes1751300000000 implements MigrationInterface {
  name = 'AddUserAgentToOtpCodes1751300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "otp_codes"
        ADD COLUMN "user_agent" TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "otp_codes"
        DROP COLUMN "user_agent"
    `);
  }
}
