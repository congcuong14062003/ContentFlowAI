import type { JWTVerifyGetKey } from 'jose';
export async function verifyGoogleIdentity(idToken: string, key: JWTVerifyGetKey, audience: string, nonce: string) {
  const { jwtVerify } = await import('jose');
  const { payload } = await jwtVerify(idToken, key, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'email', 'nonce'] });
  if (payload.nonce !== nonce || payload.email_verified !== true || typeof payload.email !== 'string' || !payload.sub) throw new Error('Invalid Google identity');
  return { subject: payload.sub, email: payload.email.toLowerCase(), name: typeof payload.name === 'string' ? payload.name : payload.email };
}
