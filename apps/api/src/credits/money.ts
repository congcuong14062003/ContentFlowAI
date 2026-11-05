import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
export const MAX_UNITS = 1_000_000_000_000_000_000n;
export function units(value: string, allowZero = false): bigint {
  if (!/^(0|[1-9]\d{0,18})$/.test(value)) throw new BadRequestException('Integer decimal string required');
  const amount = BigInt(value);
  if (amount > MAX_UNITS || (!allowZero && amount === 0n)) throw new BadRequestException('Amount out of range');
  return amount;
}
export function ceilDiv(value: bigint, divisor: bigint) { return (value + divisor - 1n) / divisor; }
export function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function financeError(code: string, status = 409): never { throw new HttpException({ code, message: code }, status); }
export function sameOperation(expected: string, actual: string | null) { if (expected !== actual) throw new ConflictException('Idempotency key belongs to a different operation'); }
