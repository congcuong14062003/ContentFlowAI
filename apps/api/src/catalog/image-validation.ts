import { BadRequestException } from '@nestjs/common';
export interface ImageUpload { buffer: Buffer; originalname: string; mimetype: string; size: number }
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
/** Reject active formats, MIME/extension mismatch, truncated headers and excessive dimensions. */
export function validateImage(file?: ImageUpload) {
  const invalid = () => new BadRequestException('Invalid image. Use PNG, JPEG or WebP, at most 5 MB and 4096 × 4096 pixels.');
  if (!file || !file.size || file.size > MAX_IMAGE_SIZE || file.size !== file.buffer.length) throw invalid();
  const b = file.buffer; let width = 0; let height = 0; let mime = ''; let extension = '';
  try {
    if (b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
      if (b.readUInt32BE(8) !== 13 || b.toString('ascii', 12, 16) !== 'IHDR' || b.toString('ascii', b.length - 8, b.length - 4) !== 'IEND') throw invalid();
      width = b.readUInt32BE(16); height = b.readUInt32BE(20); mime = 'image/png'; extension = 'png';
    } else if (b[0] === 255 && b[1] === 216 && b.at(-2) === 255 && b.at(-1) === 217) {
      let offset = 2;
      while (offset < b.length - 4) {
        if (b[offset++] !== 255) throw invalid();
        while (b[offset] === 255) offset++;
        const marker = b[offset++]; if (marker === undefined || marker === 218 || marker === 217) break;
        const length = b.readUInt16BE(offset); if (length < 2 || offset + length > b.length) throw invalid();
        if ([192, 193, 194].includes(marker)) { height = b.readUInt16BE(offset + 3); width = b.readUInt16BE(offset + 5); break; }
        offset += length;
      }
      mime = 'image/jpeg'; extension = 'jpg';
    } else if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' && b.readUInt32LE(4) + 8 === b.length) {
      const kind = b.toString('ascii', 12, 16);
      if (kind === 'VP8X') { if (b[20]! & 2) throw invalid(); width = b.readUIntLE(24, 3) + 1; height = b.readUIntLE(27, 3) + 1; }
      else if (kind === 'VP8L' && b[20] === 47) { const bits = b.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
      else if (kind === 'VP8 ' && b.subarray(23, 26).equals(Buffer.from([157, 1, 42]))) { width = b.readUInt16LE(26) & 0x3fff; height = b.readUInt16LE(28) & 0x3fff; }
      mime = 'image/webp'; extension = 'webp';
    }
  } catch { throw invalid(); }
  const suffix = file.originalname.toLowerCase().split('.').at(-1);
  if (!mime || mime !== file.mimetype || !(extension === 'jpg' ? ['jpg', 'jpeg'] : [extension]).includes(suffix ?? '') || width < 1 || height < 1 || width > 4096 || height > 4096) throw invalid();
  return { mimeType: mime, extension, width, height, originalName: file.originalname.replace(/[^\p{L}\p{N} ._-]/gu, '_').slice(-200) };
}
