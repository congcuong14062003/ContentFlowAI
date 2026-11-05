import { z } from 'zod';
import { parseProviderConfig } from '../ai/ai.config';

const secret = z.string().min(16).refine((value) => !/REPLACE_ME|changeme/i.test(value), 'Replace placeholder secrets');
export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.url().refine((value) => {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && url.origin === value; }
    catch { return false; }
  }, 'A canonical HTTP(S) origin without path or credentials is required'),
  DATABASE_URL: z.url().refine((v) => /^postgres(ql)?:/.test(v), 'PostgreSQL URL required'),
  REDIS_URL: z.url().refine((v) => /^rediss?:/.test(v), 'Redis URL required'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DEFAULT_BRAND_LIMIT: z.coerce.number().int().min(0).max(1000).default(1),
  AI_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  AI_ROUTING_CONFIG: z.string().max(40000).default('{"providers":[],"models":[]}'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(120000).default(30000),
  AI_CREDIT_MICROS_PER_ATOM: z.string().regex(/^[1-9]\d{0,8}$/).default('1'),
  MAIL_MODE: z.enum(['local', 'smtp']).default('local'),
  MAIL_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/, '32 random hex bytes required'),
  RATE_LIMIT_PREFIX: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).default('contentflow'),
  MAIL_LOCAL_DIR: z.string().default('.local/mail'),
  MAIL_FROM: z.email().optional(), SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).optional(), SMTP_CA_FILE: z.string().optional(),
  SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(), GOOGLE_CLIENT_SECRET: z.string().optional(), GOOGLE_REDIRECT_URI: z.url().optional(),
  S3_ENDPOINT: z.url(), S3_REGION: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(3), S3_SECRET_KEY: secret,
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true')
}).superRefine((env, ctx) => {
  try { parseProviderConfig(env.AI_ROUTING_CONFIG, env.NODE_ENV); } catch { ctx.addIssue({ code: 'custom', path: ['AI_ROUTING_CONFIG'], message: 'Invalid model/provider routing configuration' }); }
  for (const key of ['DATABASE_URL', 'REDIS_URL'] as const) {
    if (env.NODE_ENV === 'test') {
      try { if (['localhost', '127.0.0.1'].includes(new URL(env[key]).hostname)) continue; } catch { /* invalid URL is handled below */ }
    }
    let validPassword = false;
    try { validPassword = secret.safeParse(decodeURIComponent(new URL(env[key]).password)).success; }
    catch { /* Malformed URLs and percent escapes are invalid; never include the input. */ }
    if (!validPassword) ctx.addIssue({ code: 'custom', path: [key], message: 'URL requires a non-placeholder password of at least 16 characters' });
  }
  if (env.NODE_ENV === 'production' && !env.WEB_ORIGIN.startsWith('https://')) {
    ctx.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'Production origin requires HTTPS' });
  }
  if (env.NODE_ENV === 'production' && env.MAIL_MODE !== 'smtp') ctx.addIssue({ code: 'custom', path: ['MAIL_MODE'], message: 'Production requires SMTP delivery' });
  if (env.MAIL_MODE === 'smtp' && (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.MAIL_FROM)) ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'Complete SMTP configuration required' });
  if (env.GOOGLE_CLIENT_ID && (!env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI)) ctx.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_ID'], message: 'Complete Google OAuth configuration required' });
  if (env.GOOGLE_REDIRECT_URI) {
    try { const uri = new URL(env.GOOGLE_REDIRECT_URI); if (uri.pathname !== '/api/v1/auth/google/callback' || uri.search || uri.hash || uri.username || uri.password || !['https:', ...(env.NODE_ENV === 'production' ? [] : ['http:'])].includes(uri.protocol)) throw new Error(); }
    catch { ctx.addIssue({ code: 'custom', path: ['GOOGLE_REDIRECT_URI'], message: 'Valid API callback URL required; production requires HTTPS' }); }
  }
});
export type Environment = z.infer<typeof environmentSchema>;
export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    // Do not include supplied values, connection strings or credentials in errors.
    throw new Error(`Invalid environment: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return result.data;
}
