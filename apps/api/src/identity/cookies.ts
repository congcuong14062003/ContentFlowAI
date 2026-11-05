import type { Request, Response } from 'express';
export const cookieOptions = (production: boolean) => ({ httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/api/v1/auth' });
export function readCookie(request: Request, name: string) {
  return request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
export function sessionResponse(response: Response, production: boolean, result: { accessToken: string; refreshToken: string; user: unknown }) {
  response.cookie('cf_refresh', result.refreshToken, { ...cookieOptions(production), maxAge: 30 * 86400000 });
  response.setHeader('Cache-Control', 'no-store');
  return { accessToken: result.accessToken, user: result.user };
}
