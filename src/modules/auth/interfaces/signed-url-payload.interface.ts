// src/modules/auth/interfaces/signed-url-payload.interface.ts
export interface SignedUrlPayload {
  paymentId?: string;
  memberId?: string;
  groupId?: string;
  expiresAt: number; // Unix ms timestamp
  [key: string]: unknown;
}
