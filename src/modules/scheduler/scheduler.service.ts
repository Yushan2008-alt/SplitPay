import { Injectable } from '@nestjs/common';
import { PaymentPeriodRepository } from '../../database/repositories/payment-period.repository.js';
import { PaymentRecordRepository } from '../../database/repositories/payment-record.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';

// ponytail: class skeleton kept for backward compat with scheduler.module imports.
// Duplicate cron was removed — DailyCheckService.checkPaymentReminders() (07:00 WIB, Redis-deduped) covers all reminder logic.
@Injectable()
export class SchedulerService {
  constructor(
    private readonly periodRepo: PaymentPeriodRepository,
    private readonly recordRepo: PaymentRecordRepository,
    private readonly notificationsService: NotificationsService,
  ) {}
}
