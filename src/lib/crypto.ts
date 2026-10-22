import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
export function generateToken() {
  return randomBytes(32).toString('base64url');
}
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value))
    throw new Error('TOKEN_ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux.');
  return Buffer.from(value, 'hex');
}
export function encryptToken(token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function decryptToken(value: string) {
  const data = Buffer.from(value, 'base64url'),
    decipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
export function secretMatches(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function baseUrl() {
  const url = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
    throw new Error('NEXTAUTH_URL doit utiliser HTTPS.');
  return url.origin;
}
