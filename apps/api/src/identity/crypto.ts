import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
function derive(password: string, salt: string) { return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key))); }
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt$32768$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [scheme, cost, salt, expected] = hash.split('$');
  if (scheme !== 'scrypt' || cost !== '32768' || !salt || !expected) return false;
  const key = await derive(password, salt);
  const bytes = Buffer.from(expected, 'hex');
  return bytes.length === key.length && timingSafeEqual(bytes, key);
}
