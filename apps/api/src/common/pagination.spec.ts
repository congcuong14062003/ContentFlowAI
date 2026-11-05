import { describe, expect, it } from 'vitest'; import { cursorPage, pageRange, PageQuery } from './pagination'; import { randomUUID } from 'node:crypto';
describe('scoped keyset pagination', () => {
  it('uses time and id boundaries and rejects cross-scope or malformed cursors', () => {
    const rows = [1, 2, 3].map((n) => ({ id: randomUUID(), createdAt: new Date(1700000000000 + n) })); const query = Object.assign(new PageQuery(), { limit: 2 });
    const page = cursorPage(rows, query, 'members:tenant-a'); expect(page.items).toHaveLength(2); expect(page.nextCursor).toBeTruthy();
    expect(pageRange({ ...query, cursor: page.nextCursor! }, 'members:tenant-a')).toHaveProperty('OR');
    expect(() => pageRange({ ...query, cursor: page.nextCursor! }, 'members:tenant-b')).toThrow();
    expect(() => pageRange({ ...query, cursor: 'invalid' }, 'members:tenant-a')).toThrow();
    expect(cursorPage(rows.slice(0, 1), query, 'members:tenant-a').nextCursor).toBeNull();
  });
});
