import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { GlobalExceptionFilter } from './http';

function capture(error: unknown) {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ id: 'request-123' }) }) };
  const logger = { error: vi.fn() };
  new GlobalExceptionFilter(logger as unknown as PinoLogger).catch(error, host as unknown as ArgumentsHost);
  return { response, logger };
}
describe('global errors', () => {
  it('conceals internal errors in responses and log messages', () => {
    const { response, logger } = capture(new Error('postgresql://secret:password@db'));
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: { code: 'INTERNAL_ERROR', message: 'Service temporarily unavailable' }, requestId: 'request-123' });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('password');
  });
  it('keeps structured validation messages and request ID', () => {
    const { response } = capture(new BadRequestException(['email must be valid']));
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json.mock.calls[0]?.[0]).toMatchObject({ error: { code: 'VALIDATION_ERROR', details: ['email must be valid'] }, requestId: 'request-123' });
  });
});
