# Payments Module

Payment confirmation flow dengan self-report, host manual actions, dan payment history.

## Features

✅ **Signed URL Confirmation** - One-click payment confirmation dari email  
✅ **Idempotency** - Prevent double confirmation dengan Redis  
✅ **Host Manual Actions** - Mark paid / waive payment  
✅ **Payment State Machine** - Strict state transition enforcement  
✅ **Role-based Filtering** - Host lihat semua, payer hanya milik sendiri  
✅ **BullMQ Integration** - Notification queue untuk host

---

## API Endpoints

### 1. Confirm Payment (Public)

**POST** `/api/v1/payments/confirm`

Konfirmasi pembayaran via signed URL token dari email.

```json
// Request
{
  "token": "eyJyZWNvcmRJZCI6IjEyMyIsImV4cGlyZXNBdCI6MTcyMH0.abc123def"
}

// Response 200
{
  "id": "record-123",
  "status": "paid",
  "confirmedBy": "self",
  "confirmedAt": "2026-07-01T22:00:00Z",
  "amountDue": "10000",
  "amountPaid": "10000"
}
```

**GET** `/api/v1/payments/confirm?token=xxx`

Alternative endpoint untuk redirect dari email link.  
→ Redirect ke `{FRONTEND_URL}/payment/success` atau `/payment/error`

---

### 2. Host Mark Paid

**PATCH** `/api/v1/payments/records/:recordId/mark-paid`

Host secara manual menandai pembayaran sebagai lunas.

```json
// Request (optional body)
{
  "paymentMethod": "BCA Transfer",
  "paymentNote": "Sudah transfer ke rekening host"
}

// Response 200
{
  "id": "record-123",
  "status": "paid",
  "confirmedBy": "host",
  "paymentMethod": "BCA Transfer",
  "paymentNote": "Sudah transfer ke rekening host"
}
```

**Authorization:** Host only (403 untuk non-host)

---

### 3. Host Waive Payment

**PATCH** `/api/v1/payments/records/:recordId/waive`

Host membebaskan member dari kewajiban pembayaran.

```json
// No request body

// Response 200
{
  "id": "record-123",
  "status": "waived",
  "confirmedBy": "host",
  "confirmedAt": "2026-07-01T22:00:00Z"
}
```

**Authorization:** Host only

---

### 4. List Periods

**GET** `/api/v1/payments/groups/:groupId/periods`

List semua periode billing untuk grup.

```json
// Response 200
[
  {
    "period": {
      "id": "period-123",
      "groupId": "group-123",
      "periodStart": "2026-07-01",
      "periodEnd": "2026-07-31",
      "dueDate": "2026-07-10",
      "status": "active",
      "totalCollected": "50000"
    },
    "myRecord": {
      "id": "record-123",
      "status": "paid",
      "amountDue": "10000",
      "amountPaid": "10000"
    }
  }
]
```

**Authorization:** Member atau host grup

---

### 5. Period Detail

**GET** `/api/v1/payments/groups/:groupId/periods/:periodId`

Detail periode dengan payment records (filtered by role).

```json
// Response 200 (HOST)
{
  "period": { ... },
  "records": [
    { "id": "rec-1", "memberId": "mem-1", "status": "paid" },
    { "id": "rec-2", "memberId": "mem-2", "status": "pending" }
  ],
  "myRole": "host"
}

// Response 200 (PAYER)
{
  "period": { ... },
  "records": [
    { "id": "rec-1", "memberId": "mem-1", "status": "paid" }
  ],
  "myRole": "payer"
}
```

---

## Payment State Machine

```
PENDING → PAID (via confirm/host/webhook)
        ↓
     OVERDUE (via cron after grace period)
        ↓
      PAID (via confirm/host)

Any → WAIVED (host only, no restrictions)
```

**Invalid Transitions:**
- ❌ PAID → PENDING
- ❌ WAIVED → PAID (must stay waived)
- ❌ WAIVED → PENDING

---

## Signed URL Generation

### Usage in Notification Service

```typescript
import { SignedUrlService } from '@modules/payments/signed-url.service.js';

@Injectable()
export class NotificationService {
  constructor(
    private readonly signedUrlService: SignedUrlService,
    private readonly mailService: MailService,
  ) {}

  async sendPaymentReminder(recordId: string, memberEmail: string) {
    // Generate signed URL (valid for 72 hours)
    const confirmUrl = this.signedUrlService.generatePaymentConfirmUrl(recordId);

    await this.mailService.sendEmail({
      to: memberEmail,
      subject: 'Reminder Pembayaran',
      html: `
        <p>Jangan lupa bayar tagihan bulan ini!</p>
        <a href="${confirmUrl}">Sudah Bayar</a>
      `,
    });
  }
}
```

### Manual Token Generation (Testing)

```typescript
import { generateSignedToken } from '@common/utils/crypto.util.js';

const token = generateSignedToken(
  { recordId: 'record-123' },
  process.env.SIGNED_URL_SECRET,
  72 * 60 * 60, // 72 hours in seconds
);

console.log(`/api/v1/payments/confirm?token=${token}`);
```

---

## Security Features

### 1. Idempotency via Redis

```typescript
// First confirmation
POST /payments/confirm → 200 OK (updates DB)

// Replay attack (same token)
POST /payments/confirm → 400 Bad Request (token already used)

// BUT: If record already PAID, returns success (idempotent)
POST /payments/confirm → 200 OK (no DB change)
```

Redis key: `confirm:used:{recordId}` (TTL: 7 days)

### 2. Token Validation

- ✅ HMAC-SHA256 signature verification
- ✅ Expiry check (default 72 hours)
- ✅ Constant-time comparison (prevent timing attacks)
- ✅ One-time use enforcement

### 3. State Machine Enforcement

```typescript
// Invalid transition
record.status = 'waived';
paymentsService.hostMarkPaid(recordId, hostId, {});
// → Throws BadRequestException
```

---

## BullMQ Integration

### Notification Queue

```typescript
// Queue name: 'payment-notifications'
// Payload:
{
  recordId: string;
  groupId: string;
  memberId: string;
  type: 'payment_confirmed';
}
```

### Consumer Setup (in NotificationsModule)

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('payment-notifications')
export class PaymentNotificationConsumer extends WorkerHost {
  async process(job: Job) {
    const { recordId, groupId, memberId, type } = job.data;

    if (type === 'payment_confirmed') {
      // Send notification to host
      await this.notifyHost(groupId, memberId);
    }
  }
}
```

---

## Testing

### Unit Tests

```bash
pnpm test -- payments.spec
```

**Coverage:**
- ✅ Confirm payment (happy path, invalid token, replay attack)
- ✅ Host mark paid (ownership check, idempotent, state machine)
- ✅ Waive payment (host only, any status allowed)
- ✅ Period visibility (host sees all, payer sees own)
- ✅ State machine transitions

### E2E Tests

```bash
pnpm test:e2e -- payments.e2e-spec
```

**Flow:**
1. Generate signed URL token
2. Confirm payment via POST
3. Verify status updated to PAID
4. Verify notification queued
5. Check idempotency (second confirm succeeds)
6. Host mark paid
7. Host waive payment

---

## Environment Variables

```env
# Signed URL Configuration
SIGNED_URL_SECRET=<min 64 char random hex>
SIGNED_URL_EXPIRES_IN_HOURS=72

# Frontend URL (for redirect)
FRONTEND_URL=https://splitpay.vercel.app

# App Base URL (for signed URL generation)
APP_BASE_URL=https://api.splitpay.id
```

---

## Integration with Other Modules

### BillingCycleService

```typescript
// After payment confirmation
await billingService.updateCycleStatus(periodId);

// Logic:
// - All records PAID → Period COMPLETED
// - Due date passed + not all paid → Period OVERDUE
// - Some records paid → Period ACTIVE
```

### SchedulerService (Future)

```typescript
@Cron('0 8 * * *') // Every day at 8 AM
async checkOverduePayments() {
  const periods = await periodRepo.findActivePeriods();

  for (const period of periods) {
    const group = await groupRepo.findById(period.groupId);
    const overdueDate = new Date(period.dueDate);
    overdueDate.setDate(overdueDate.getDate() + group.gracePeriodDays);

    if (new Date() > overdueDate) {
      await paymentsService.markPeriodOverdue(period.id);
    }
  }
}
```

---

## Error Codes

| Code | Status | Message |
|------|--------|---------|
| `INVALID_OTP` | 400 | Token tidak valid atau sudah kadaluarsa |
| `VALIDATION_ERROR` | 400 | Tidak dapat mengkonfirmasi pembayaran dengan status X |
| `FORBIDDEN` | 403 | Anda bukan anggota grup ini |
| `NOT_GROUP_HOST` | 403 | Aksi ini hanya bisa dilakukan oleh host grup |
| `PERIOD_NOT_FOUND` | 404 | Payment record tidak ditemukan |

---

## Performance Optimizations

### Batch Queries

```typescript
// BAD: N+1 query
for (const period of periods) {
  const myRecord = await recordRepo.findByPeriodAndMember(period.id, memberId);
}

// GOOD: Batch load
const allRecords = await recordRepo.findByMemberId(memberId);
const recordMap = new Map(allRecords.map(r => [r.periodId, r]));
const results = periods.map(p => ({ period: p, myRecord: recordMap.get(p.id) }));
```

### Redis Caching

```typescript
// Check idempotency before hitting DB
const usedKey = `confirm:used:${recordId}`;
const isUsed = await redisService.get(usedKey);
if (isUsed) {
  // Early return, skip DB query
}
```

---

## Troubleshooting

### Token Invalid / Expired

**Problem:** `Token tidak valid atau sudah kadaluarsa`

**Solutions:**
1. Check `SIGNED_URL_SECRET` matches between services
2. Verify token not older than `SIGNED_URL_EXPIRES_IN_HOURS`
3. Ensure token format: `base64url(payload).signature`

### Notification Not Sent

**Problem:** Host tidak menerima notifikasi setelah payment confirmed

**Solutions:**
1. Check BullMQ queue `payment-notifications` running
2. Verify `notifQueue.add()` called successfully
3. Check consumer registered in NotificationsModule

### Idempotency Not Working

**Problem:** Double confirmation berhasil (seharusnya reject)

**Solutions:**
1. Verify Redis connection active
2. Check TTL set correctly (7 days)
3. Ensure `confirm:used:{recordId}` key format consistent

---

## Future Improvements

- [ ] Webhook integration untuk payment gateway (Midtrans/Xendit)
- [ ] Bulk mark paid (host marks multiple records at once)
- [ ] Payment proof upload (attach screenshot/receipt)
- [ ] Partial payment support (amountPaid < amountDue)
- [ ] Refund handling (PAID → REFUNDED)
- [ ] Payment analytics dashboard
