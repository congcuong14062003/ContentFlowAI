import { describe, expect, it } from 'vitest'; import { digest, hashPassword, token, verifyPassword } from './crypto';
describe('password and opaque token security', () => {
  it('uses salted scrypt and constant-length random tokens', async () => { const password = 'a secure test password'; const first = await hashPassword(password); const second = await hashPassword(password); expect(first).not.toBe(second); expect(await verifyPassword(password, first)).toBe(true); expect(await verifyPassword('wrong', first)).toBe(false); expect(first).not.toContain(password); const raw = token(); expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(digest(raw)).toHaveLength(64); expect(digest(raw)).not.toContain(raw); });
});
