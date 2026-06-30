// src/common/utils/crypto.util.ts
// [SECURITY] HMAC-SHA256 signed URL generation & OTP utilities
import { createHmac, randomInt, timingSafeEqual } from 'crypto';

/**
 * Generate a signed URL token.
 * Format: base64url(payload:expiresAt):signature
 */
export function generateSignedToken(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number,
): string {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const data = JSON.stringify({ ...payload, expiresAt });
  const encoded = Buffer.from(data).toString('base64url');
  const sig = hmacSign(encoded, secret);
  return `${encoded}.${sig}`;
}

/**
 * Validate a signed token.
 * Returns parsed payload if valid & not expired, null otherwise.
 */
export function validateSignedToken(
  token: string,
  secret: string,
): Record<string, unknown> | null {
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) return null;

  const encoded = token.slice(0, dotIdx);
  const receivedSig = token.slice(dotIdx + 1);
  const expectedSig = hmacSign(encoded, secret);

  // [SECURITY] Constant-time comparison to prevent timing attacks
  if (!constantTimeEqual(receivedSig, expectedSig)) return null;

  try {
    const data = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (typeof data.expiresAt === 'number' && Date.now() > data.expiresAt) {
      return null; // expired
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Generate a cryptographically secure OTP of N digits.
 * Default 6 digits.
 */
export function generateOTP(digits = 6): string {
  const max = Math.pow(10, digits);
  const code = randomInt(0, max);
  return String(code).padStart(digits, '0');
}

// ── Private helpers ────────────────────────────────────────────────────────

function hmacSign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  // Ensure equal length buffers to use timingSafeEqual
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
