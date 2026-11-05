import { describe, expect, it } from 'vitest';
import { normalizeBrandKit, parseBrandKit } from './catalog.dto';
import { requireCatalogWriter } from './catalog.service';
import { validateImage } from './image-validation';
import { emptyBrandKit } from '../../../../packages/shared/src/catalog';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=', 'base64');
describe('catalog policy and context', () => {
  it('validates the shared context and rejects unversioned/unknown instructions', () => {
    expect(parseBrandKit(emptyBrandKit()).schemaVersion).toBe(1);
    expect(normalizeBrandKit({})).toEqual(emptyBrandKit());
    expect(() => parseBrandKit({ ...emptyBrandKit(), systemRole: 'SUPER_ADMIN' })).toThrow();
    expect(() => parseBrandKit({ ...emptyBrandKit(), colors: ['red'] })).toThrow();
    expect(() => parseBrandKit({ ...emptyBrandKit(), languages: [] })).toThrow();
  });
  it('permits editors to edit but reserves destructive brand operations for managers', () => {
    expect(() => requireCatalogWriter('EDITOR')).not.toThrow();
    expect(() => requireCatalogWriter('VIEWER')).toThrow();
    expect(() => requireCatalogWriter('EDITOR', true)).toThrow();
    expect(() => requireCatalogWriter('ADMIN', true)).not.toThrow();
  });
});
describe('private image validation', () => {
  const file = { buffer: png, size: png.length, originalname: 'logo.png', mimetype: 'image/png' };
  it('accepts a bounded PNG with matching MIME and extension', () => expect(validateImage(file).mimeType).toBe('image/png'));
  it('rejects missing files, disguised SVG, MIME mismatch, oversized files and excessive dimensions', () => {
    expect(() => validateImage()).toThrow();
    expect(() => validateImage({ ...file, buffer: Buffer.from('<svg onload="alert(1)"/>') })).toThrow();
    expect(() => validateImage({ ...file, mimetype: 'image/jpeg' })).toThrow();
    expect(() => validateImage({ ...file, originalname: 'logo.svg' })).toThrow();
    expect(() => validateImage({ ...file, size: 5242881 })).toThrow();
    const huge = Buffer.from(png); huge.writeUInt32BE(100000, 16);
    expect(() => validateImage({ ...file, buffer: huge })).toThrow();
    expect(() => validateImage({ ...file, buffer: png.subarray(0, 20), size: 20 })).toThrow();
  });
});
