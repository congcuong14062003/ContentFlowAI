import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PageQuery {
  @IsOptional() @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(512) cursor?: string;
}
export function pageRange(query: PageQuery, scope: string, descending = false) {
  if (!query.cursor) return {};
  try {
    const value = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as { id: string; at: string; scope: string };
    if (value.scope !== scope || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id) || new Date(value.at).toISOString() !== value.at) throw new Error();
    const date = new Date(value.at);
    return { OR: [{ createdAt: descending ? { lt: date } : { gt: date } }, { createdAt: date, id: descending ? { lt: value.id } : { gt: value.id } }] };
  } catch { throw new BadRequestException('Invalid pagination cursor'); }
}
export function cursorPage<T extends { id: string; createdAt: Date }>(rows: T[], query: PageQuery, scope: string) {
  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > query.limit && last ? Buffer.from(JSON.stringify({ id: last.id, at: last.createdAt.toISOString(), scope })).toString('base64url') : null };
}
