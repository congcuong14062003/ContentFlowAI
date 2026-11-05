import { describe, expect, it, vi, afterEach } from 'vitest'; import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto'; import { GoogleOAuthService } from './oauth.service'; import type { RedisService } from '../platform/redis.service'; import { token } from './crypto';
afterEach(() => vi.unstubAllGlobals());
describe('Google adapter protocol contract (isolated provider fixture)', () => {
  it('binds PKCE and nonce to an expiring single-use state and verifies the exchanged identity', async () => {
    const { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } = await import('jose');
    const memory = new Map<string, string>();
    const set = vi.fn(async (key: string, value: string, mode: string, seconds: number) => { expect(mode).toBe('EX'); expect(seconds).toBe(300); memory.set(key, value); });
    const redis = { client: { set, getdel: async (key: string) => { const value = memory.get(key); memory.delete(key); return value; } } };
    const adapter = new GoogleOAuthService(new ConfigService({ GOOGLE_CLIENT_ID: 'contract-client', GOOGLE_CLIENT_SECRET: token(), GOOGLE_REDIRECT_URI: 'https://api.example.invalid/api/v1/auth/google/callback' }), redis as unknown as RedisService);
    const start = await adapter.start(); const parameters = new URL(start.url).searchParams; const saved = JSON.parse(memory.get(`oauth:${start.state}`)!) as { verifier: string; nonce: string };
    expect(parameters.get('code_challenge_method')).toBe('S256'); expect(parameters.get('code_challenge')).toBe(createHash('sha256').update(saved.verifier).digest('base64url')); expect(parameters.get('nonce')).toBe(saved.nonce);
    const pair = await generateKeyPair('RS256'); const key = await exportJWK(pair.publicKey); key.kid = 'fixture';
    Object.defineProperty(adapter, 'jwks', { value: createLocalJWKSet({ keys: [key] }) });
    const signed = await new SignJWT({ email: 'oauth@example.invalid', email_verified: true, nonce: saved.nonce }).setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).setIssuer('https://accounts.google.com').setAudience('contract-client').setSubject('provider-subject').setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
    const exchange = vi.fn(async (url: string, init: RequestInit) => { expect(url).toBe('https://oauth2.googleapis.com/token'); const body = init.body as URLSearchParams; expect(body.get('code_verifier')).toBe(saved.verifier); expect(body.get('grant_type')).toBe('authorization_code'); return Response.json({ id_token: signed }); });
    vi.stubGlobal('fetch', exchange);
    expect((await adapter.callback('fixture-code', start.state)).subject).toBe('provider-subject'); expect(exchange).toHaveBeenCalledOnce();
    await expect(adapter.callback('fixture-code', start.state)).rejects.toThrow('Expired OAuth state');
  });
});
