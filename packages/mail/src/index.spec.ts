import { describe, expect, it } from 'vitest';
import { createDecipheriv, randomBytes } from 'node:crypto'; import { encryptMail, startMailWorker } from './index';
describe('encrypted email queue payloads', () => {
  it('refuses local delivery in production and incomplete SMTP configuration', () => { const key = randomBytes(32).toString('hex'); expect(() => startMailWorker({ MAIL_ENCRYPTION_KEY: key, NODE_ENV: 'production', MAIL_MODE: 'local' })).toThrow('SMTP'); expect(() => startMailWorker({ MAIL_ENCRYPTION_KEY: key, MAIL_MODE: 'smtp', REDIS_URL: 'redis://localhost' })).toThrow('SMTP'); });
  it('hides token links and authenticates payloads at rest', () => {
    const key = randomBytes(32).toString('hex'); const message = { to: 'test@example.invalid', subject: 'Verify', text: 'https://example.invalid/#token=private-token' };
    const first = encryptMail(message, key); const second = encryptMail(message, key);
    expect(JSON.stringify(first)).not.toContain('private-token'); expect(first.iv).not.toBe(second.iv);
    const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(first.iv, 'hex')); cipher.setAuthTag(Buffer.from(first.tag, 'hex'));
    expect(JSON.parse(Buffer.concat([cipher.update(Buffer.from(first.ciphertext, 'base64')), cipher.final()]).toString('utf8'))).toEqual(message);
    const tampered = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(first.iv, 'hex')); tampered.setAuthTag(Buffer.alloc(16)); tampered.update(Buffer.from(first.ciphertext, 'base64')); expect(() => tampered.final()).toThrow();
  });
});
