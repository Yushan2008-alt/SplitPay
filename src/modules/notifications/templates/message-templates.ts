// WhatsApp message templates (PLAIN TEXT only, no HTML)
// All user input MUST be sanitized to prevent injection

import { formatRupiah } from './email-templates.js';

/**
 * Sanitize user input for WhatsApp messages.
 * Removes potentially harmful characters and normalizes whitespace.
 */
export function sanitizeText(unsafe: string): string {
  return unsafe
    .replace(/[\r\n\t]+/g, ' ') // Normalize whitespace
    .replace(/[*_~`<>]/g, '') // Remove markdown markers and HTML angle brackets
    .trim();
}

/**
 * Build WhatsApp payment reminder message.
 * Plain text with emoji, service info, amount, and signed URL.
 */
export function buildWAReminder(params: {
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

  // Sanitize all user inputs
  const safeMemberName = sanitizeText(memberName);
  const safeServiceName = sanitizeText(serviceName);
  const safeHostName = sanitizeText(hostName);
  const safeDueDate = sanitizeText(dueDate);

  const urgencyEmoji = daysUntilDue <= 1 ? '🚨' : '📅';
  const urgencyText =
    daysUntilDue === 0
      ? 'HARI INI'
      : daysUntilDue === 1
        ? 'BESOK'
        : `${daysUntilDue} HARI LAGI`;

  return `${urgencyEmoji} *REMINDER PEMBAYARAN*

Hai ${safeMemberName},

Ini pengingat untuk pembayaran langganan *${safeServiceName}* dari grup ${safeHostName}.

💰 *Jumlah Tagihan:* ${formatRupiah(amountDue)}
📆 *Jatuh Tempo:* ${safeDueDate}
⏰ *Status:* ${urgencyText}

Jika sudah melakukan pembayaran, klik link di bawah untuk konfirmasi:
👉 ${confirmUrl}

Host akan otomatis menerima notifikasi setelah Anda konfirmasi.

_Pesan otomatis dari SplitPay_`;
}

/**
 * Build WhatsApp payment confirmed message (for host).
 * Plain text notification that member has paid.
 */
export function buildWAConfirmed(params: {
  hostName: string;
  memberName: string;
  serviceName: string;
  amountPaid: string;
}): string {
  const { hostName, memberName, serviceName, amountPaid } = params;

  // Sanitize all user inputs
  const safeHostName = sanitizeText(hostName);
  const safeMemberName = sanitizeText(memberName);
  const safeServiceName = sanitizeText(serviceName);

  return `✅ *PEMBAYARAN TERKONFIRMASI*

Hai ${safeHostName},

Kabar baik! *${safeMemberName}* telah mengkonfirmasi pembayaran untuk langganan ${safeServiceName}.

💰 *Jumlah:* ${formatRupiah(amountPaid)}
✅ *Status:* LUNAS

Pembayaran telah diperbarui di dashboard Anda.

_Pesan otomatis dari SplitPay_`;
}

/**
 * Build WhatsApp overdue alert message.
 * Plain text notification for overdue payment.
 */
export function buildWAOverdue(params: {
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

  // Sanitize all user inputs
  const safeMemberName = sanitizeText(memberName);
  const safeServiceName = sanitizeText(serviceName);
  const safeHostName = sanitizeText(hostName);
  const safeDueDate = sanitizeText(dueDate);

  return `⚠️ *PEMBAYARAN TERLAMBAT*

Hai ${safeMemberName},

Pembayaran Anda untuk langganan *${safeServiceName}* dari grup ${safeHostName} telah melewati jatuh tempo.

💰 *Jumlah Tagihan:* ${formatRupiah(amountDue)}
📆 *Jatuh Tempo:* ${safeDueDate}
⏰ *Terlambat:* ${daysOverdue} HARI

Mohon segera melakukan pembayaran dan konfirmasi:
👉 ${confirmUrl}

Hubungi host jika Anda memerlukan bantuan.

_Pesan otomatis dari SplitPay_`;
}
