import { describe, expect, it } from 'vitest'; import { verifyGoogleIdentity } from './google-identity';
describe('Google OAuth cryptographic identity contract', () => {
  it('validates signature, issuer, audience, nonce, expiry and verified email', async () => {
    const { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } = await import('jose');
    const pair = await generateKeyPair('RS256'); const jwk = await exportJWK(pair.publicKey); jwk.kid = 'test-key';
    const keys = createLocalJWKSet({ keys: [jwk] });
    const sign = (overrides: Record<string, unknown> = {}) => new SignJWT({ email: 'test@example.invalid', email_verified: true, nonce: 'expected', ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://accounts.google.com').setAudience('test-client').setSubject('google-subject').setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
    expect((await verifyGoogleIdentity(await sign(), keys, 'test-client', 'expected')).subject).toBe('google-subject');
    await expect(verifyGoogleIdentity(await sign(), keys, 'wrong-client', 'expected')).rejects.toThrow();
    await expect(verifyGoogleIdentity(await sign(), keys, 'test-client', 'wrong-nonce')).rejects.toThrow();
    await expect(verifyGoogleIdentity(await sign({ email_verified: false }), keys, 'test-client', 'expected')).rejects.toThrow();
    const expired = await new SignJWT({ email: 'test@example.invalid', email_verified: true, nonce: 'expected' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://accounts.google.com').setAudience('test-client').setSubject('sub').setIssuedAt().setExpirationTime(1).sign(pair.privateKey);
    await expect(verifyGoogleIdentity(expired, keys, 'test-client', 'expected')).rejects.toThrow();
    const alien = await generateKeyPair('RS256'); const wrongSignature = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(alien.privateKey);
    await expect(verifyGoogleIdentity(wrongSignature, keys, 'test-client', 'expected')).rejects.toThrow();
  });
});
