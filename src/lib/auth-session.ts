import { createHmac, timingSafeEqual } from 'node:crypto';

// A reset changes the bcrypt hash, immediately revoking previously issued sessions.
// Never put the password hash itself in a cookie or session response.
export function passwordVersion(passwordHash: string, secret: string) {
  return createHmac('sha256', secret).update(passwordHash).digest('hex');
}
export function passwordVersionMatches(value: unknown, passwordHash: string, secret: string) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return false;
  return timingSafeEqual(
    Buffer.from(value, 'hex'),
    Buffer.from(passwordVersion(passwordHash, secret), 'hex'),
  );
}
