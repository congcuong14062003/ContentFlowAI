import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { RedisService } from '../platform/redis.service';
import { token } from './crypto';
import { verifyGoogleIdentity } from './google-identity';

@Injectable()
export class GoogleOAuthService {
  private jwks?: ReturnType<typeof import('jose').createRemoteJWKSet>;
  constructor(@Inject(ConfigService) private readonly config: ConfigService, @Inject(RedisService) private readonly redis: RedisService) {}
  enabled() { return !!this.config.get<string>('GOOGLE_CLIENT_ID'); }
  async start() {
    if (!this.enabled()) throw new ServiceUnavailableException('Google sign-in is not configured');
    const state = token(); const verifier = token(); const nonce = token();
    await this.redis.client.set(`oauth:${state}`, JSON.stringify({ verifier, nonce }), 'EX', 300);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: this.config.getOrThrow('GOOGLE_CLIENT_ID'), redirect_uri: this.config.getOrThrow('GOOGLE_REDIRECT_URI'), response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
    return { state, url: url.toString() };
  }
  async callback(code: string, state: string) {
    if (!this.enabled() || !/^[A-Za-z0-9_-]{43}$/.test(state) || code.length > 4096) throw new BadRequestException('Invalid OAuth callback');
    const saved = await this.redis.client.getdel(`oauth:${state}`);
    if (!saved) throw new BadRequestException('Expired OAuth state');
    const { verifier, nonce } = JSON.parse(saved) as { verifier: string; nonce: string };
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: this.config.getOrThrow('GOOGLE_CLIENT_ID'), client_secret: this.config.getOrThrow('GOOGLE_CLIENT_SECRET'), redirect_uri: this.config.getOrThrow('GOOGLE_REDIRECT_URI'), grant_type: 'authorization_code', code_verifier: verifier }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Exchange failed');
      const body = await response.json() as { id_token?: string };
      if (!body.id_token) throw new Error('Missing identity');
      const { createRemoteJWKSet } = await import('jose');
      this.jwks ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
      return await verifyGoogleIdentity(body.id_token, this.jwks, this.config.getOrThrow('GOOGLE_CLIENT_ID'), nonce);
    } catch { throw new BadRequestException('Google sign-in failed'); }
  }
}
