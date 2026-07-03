import { createHmac } from 'crypto';

function hmacSign(data, secret) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function generateSignedToken(payload, secret, expiresInSeconds) {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const data = JSON.stringify({ ...payload, expiresAt });
  const encoded = Buffer.from(data).toString('base64url');
  const sig = hmacSign(encoded, secret);
  return `${encoded}.${sig}`;
}
