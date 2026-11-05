import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment';

const valid = {
  MAIL_ENCRYPTION_KEY: 'a'.repeat(64),
  WEB_ORIGIN: 'http://localhost:5173', DATABASE_URL: 'postgresql://test:long-test-password@localhost:5432/test',
  REDIS_URL: 'redis://:long-test-password@localhost:6379', S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1', S3_ACCESS_KEY: 'test-access', S3_SECRET_KEY: 'long-test-secret-key', S3_BUCKET: 'test-bucket'
};
describe('environment validation', () => {
  it('applies typed defaults without leaking supplied extras', () => {
    const env = validateEnvironment({ ...valid, EXTRA_SECRET: 'do-not-return' });
    expect(env.API_PORT).toBe(3000);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env).not.toHaveProperty('EXTRA_SECRET');
  });
  it('requires strong non-placeholder connection passwords', () => {
    expect(() => validateEnvironment({ ...valid, REDIS_URL: 'redis://localhost:6379' })).toThrow('REDIS_URL');
    expect(() => validateEnvironment({ ...valid, S3_SECRET_KEY: 'REPLACE_ME_WITH_A_PASSWORD' })).toThrow('S3_SECRET_KEY');
  });
  it('rejects unsafe production browser origins', () => {
    expect(() => validateEnvironment({ ...valid, NODE_ENV: 'production' })).toThrow('HTTPS');
  });
  it('sanitizes malformed URLs and rejects non-origin browser URLs', () => {
    expect(() => validateEnvironment({ ...valid, DATABASE_URL: 'postgresql://secret:%E0@localhost/db' })).toThrow('DATABASE_URL');
    expect(() => validateEnvironment({ ...valid, WEB_ORIGIN: 'http://localhost:5173/path' })).toThrow('WEB_ORIGIN');
    expect(() => validateEnvironment({ ...valid, REDIS_URL: 'sensitive-not-a-url' })).not.toThrow('sensitive-not-a-url');
  });
  it('does not disclose credentials in configuration errors', () => {
    try { validateEnvironment({ ...valid, S3_SECRET_KEY: 'sensitive-value' }); }
    catch (error) { expect(String(error)).not.toContain('sensitive-value'); return; }
    throw new Error('Expected invalid configuration');
  });
});
