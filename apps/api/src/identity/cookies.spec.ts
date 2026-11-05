import { describe, expect, it } from 'vitest'; import { cookieOptions } from './cookies';
describe('refresh cookie policy', () => {
  it('requires HTTPS in production and restricts script and cross-site access', () => { expect(cookieOptions(true)).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/auth' }); expect(cookieOptions(false).httpOnly).toBe(true); });
});
