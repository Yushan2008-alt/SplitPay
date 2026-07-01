// Email templates untuk notification system
// All templates use escapeHtml() to prevent XSS attacks

// ─── HELPERS ──────────────────────────────────────────────────────────────

/**
 * Escape HTML characters to prevent XSS.
 * Converts: < > & " ' to HTML entities.
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format number to Rupiah currency string.
 * Example: 10000 → "Rp 10.000"
 */
export function formatRupiah(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `Rp ${num.toLocaleString('id-ID')}`;
}

/**
 * Generate urgency text based on days until due.
 * - 3: "3 hari lagi"
 * - 1: "besok"
 * - 0: "hari ini"
 * - -1: "1 hari yang lalu"
 */
export function getUrgencyText(daysUntilDue: number): string {
  if (daysUntilDue > 1) {
    return `${daysUntilDue} hari lagi`;
  }
  if (daysUntilDue === 1) {
    return 'besok';
  }
  if (daysUntilDue === 0) {
    return 'hari ini';
  }
  if (daysUntilDue === -1) {
    return 'kemarin';
  }
  return `${Math.abs(daysUntilDue)} hari yang lalu`;
}

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────────────

/**
 * Payment reminder email template.
 * Includes signed URL button for one-click payment confirmation.
 */
export function buildReminderEmailHtml(params: {
  memberName: string;
  serviceName: string;
  hostName: string;
  amountDue: string;
  dueDate: string;
  daysUntilDue: number;
  confirmUrl: string;
}): string {
  const {
    memberName,
    serviceName,
    hostName,
    amountDue,
    dueDate,
    daysUntilDue,
    confirmUrl,
  } = params;

  // Escape all user-provided content
  const safeMemberName = escapeHtml(memberName);
  const safeServiceName = escapeHtml(serviceName);
  const safeHostName = escapeHtml(hostName);
  const safeDueDate = escapeHtml(dueDate);

  const urgencyText = getUrgencyText(daysUntilDue);
  const urgencyColor = daysUntilDue <= 1 ? '#dc2626' : '#ea580c';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reminder Pembayaran</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f3f4f6">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;padding:32px">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px">
      <h1 style="color:#1f2937;font-size:24px;margin:0">Reminder Pembayaran</h1>
      <p style="color:#6b7280;font-size:14px;margin:8px 0 0 0">SplitPay</p>
    </div>

    <!-- Main Content -->
    <div style="margin-bottom:24px">
      <p style="color:#374151;font-size:16px;line-height:1.5;margin:0 0 16px 0">
        Hai <strong>${safeMemberName}</strong>,
      </p>
      <p style="color:#374151;font-size:16px;line-height:1.5;margin:0 0 16px 0">
        Ini pengingat untuk pembayaran langganan <strong>${safeServiceName}</strong> 
        dari grup <strong>${safeHostName}</strong>.
      </p>
    </div>

    <!-- Payment Details Card -->
    <div style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="margin-bottom:12px">
        <span style="color:#6b7280;font-size:14px">Jumlah Tagihan:</span>
        <div style="color:#1f2937;font-size:24px;font-weight:bold;margin-top:4px">
          ${formatRupiah(amountDue)}
        </div>
      </div>
      <div style="margin-bottom:12px">
        <span style="color:#6b7280;font-size:14px">Jatuh Tempo:</span>
        <div style="color:#1f2937;font-size:16px;margin-top:4px">${safeDueDate}</div>
      </div>
      <div style="background-color:${urgencyColor};color:#ffffff;padding:8px 12px;border-radius:4px;text-align:center;font-weight:bold">
        ${escapeHtml(urgencyText.toUpperCase())}
      </div>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:24px">
      <a href="${escapeHtml(confirmUrl)}" 
         style="display:inline-block;background-color:#10b981;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:16px">
        Sudah Bayar
      </a>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px">
      <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0">
        Jika sudah melakukan pembayaran, klik tombol "Sudah Bayar" di atas untuk konfirmasi.
        Host akan otomatis menerima notifikasi.
      </p>
      <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:8px 0 0 0">
        Jika mengalami kesulitan, silakan hubungi host grup Anda.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Payment confirmed email template (untuk host).
 * Notifikasi bahwa member sudah mengkonfirmasi pembayaran.
 */
export function buildConfirmedEmailHtml(params: {
  hostName: string;
  memberName: string;
  serviceName: string;
  amountPaid: string;
  confirmedAt: string;
}): string {
  const { hostName, memberName, serviceName, amountPaid, confirmedAt } = params;

  const safeHostName = escapeHtml(hostName);
  const safeMemberName = escapeHtml(memberName);
  const safeServiceName = escapeHtml(serviceName);
  const safeConfirmedAt = escapeHtml(
    new Date(confirmedAt).toLocaleString('id-ID', {
      dateStyle: 'long',
      timeStyle: 'short',
    }),
  );

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pembayaran Terkonfirmasi</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f3f4f6">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;padding:32px">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px">
      <div style="background-color:#10b981;width:64px;height:64px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center">
        <span style="color:#ffffff;font-size:32px">✓</span>
      </div>
      <h1 style="color:#1f2937;font-size:24px;margin:0">Pembayaran Terkonfirmasi</h1>
      <p style="color:#6b7280;font-size:14px;margin:8px 0 0 0">SplitPay</p>
    </div>

    <!-- Main Content -->
    <div style="margin-bottom:24px">
      <p style="color:#374151;font-size:16px;line-height:1.5;margin:0 0 16px 0">
        Hai <strong>${safeHostName}</strong>,
      </p>
      <p style="color:#374151;font-size:16px;line-height:1.5;margin:0 0 16px 0">
        Kabar baik! <strong>${safeMemberName}</strong> telah mengkonfirmasi pembayaran 
        untuk langganan <strong>${safeServiceName}</strong>.
      </p>
    </div>

    <!-- Payment Details Card -->
    <div style="background-color:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="margin-bottom:12px">
        <span style="color:#166534;font-size:14px">Jumlah:</span>
        <div style="color:#1f2937;font-size:24px;font-weight:bold;margin-top:4px">
          ${formatRupiah(amountPaid)}
        </div>
      </div>
      <div>
        <span style="color:#166534;font-size:14px">Waktu Konfirmasi:</span>
        <div style="color:#1f2937;font-size:14px;margin-top:4px">${safeConfirmedAt}</div>
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px">
      <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0">
        Status pembayaran telah diperbarui di dashboard Anda. Jika ada pertanyaan, 
        silakan hubungi member terkait.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Overdue alert email template.
 * Notifikasi untuk member yang terlambat bayar.
 */
export function buildOverdueAlertHtml(params: {
  memberName: string;
  serviceName: string;
  hostName: string;
  amountDue: string;
  dueDate: string;
  daysOverdue: number;
  confirmUrl: string;
}): string {
  const {
    memberName,
    serviceName,
    hostName,
    amountDue,
    dueDate,
    daysOverdue,
    confirmUrl,
  } = params;

  const safeMemberName = escapeHtml(memberName);
  const safeServiceName = escapeHtml(serviceName);
  const safeHostName = escapeHtml(hostName);
  const safeDueDate = escapeHtml(dueDate);

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pembayaran Terlambat</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f3f4f6">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;padding:32px">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px">
      <div style="background-color:#dc2626;width:64px;height:64px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center">
        <span style="color:#ffffff;font-size:32px">!</span>
      </div>
      <h1 style="color:#dc2626;font-size:24px;margin:0">Pembayaran Terlambat</h1>
      <p style="color:#6b7280;font-size:14px;margin:8px 0 0 0">SplitPay</p>
    </div>

    <!-- Main Content -->
    <div style="margin-bottom:24px">
      <p style="color:#374151;font-size:16px;line-height:1.5;margin:0 0 16px 0">
        Hai <strong>${safeMemberName}</strong>,
      </p>
      <p style="color:#374151;font-size:16px;line-height:1.5;margin:0 0 16px 0">
        Pembayaran Anda untuk langganan <strong>${safeServiceName}</strong> 
        dari grup <strong>${safeHostName}</strong> telah melewati jatuh tempo.
      </p>
    </div>

    <!-- Payment Details Card -->
    <div style="background-color:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="margin-bottom:12px">
        <span style="color:#991b1b;font-size:14px">Jumlah Tagihan:</span>
        <div style="color:#1f2937;font-size:24px;font-weight:bold;margin-top:4px">
          ${formatRupiah(amountDue)}
        </div>
      </div>
      <div style="margin-bottom:12px">
        <span style="color:#991b1b;font-size:14px">Jatuh Tempo:</span>
        <div style="color:#1f2937;font-size:16px;margin-top:4px">${safeDueDate}</div>
      </div>
      <div style="background-color:#dc2626;color:#ffffff;padding:8px 12px;border-radius:4px;text-align:center;font-weight:bold">
        TERLAMBAT ${daysOverdue} HARI
      </div>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:24px">
      <a href="${escapeHtml(confirmUrl)}" 
         style="display:inline-block;background-color:#dc2626;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:16px">
        Konfirmasi Sekarang
      </a>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px">
      <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0">
        Mohon segera melakukan pembayaran dan konfirmasi untuk menghindari masalah 
        dengan host grup. Hubungi host jika Anda memerlukan bantuan.
      </p>
    </div>
  </div>
</body>
</html>`;
}
