import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { PageQuery } from '../common/pagination';
const text = (max = 500) => z.string().trim().max(max);
const list = (max = 30) => z.array(text()).max(max);
export const brandKitSchema = z.strictObject({
  schemaVersion: z.literal(1), colors: z.array(z.string().regex(/^#[a-fA-F0-9]{6}$/)).max(12),
  industry: text(150), businessDescription: text(10000), targetAudiences: list(), voice: text(1000), tone: list(),
  keywords: list(100), forbiddenPhrases: list(100), preferredCta: text(1000),
  languages: z.array(z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)).min(1).max(20),
  socialPlatforms: z.array(z.enum(['facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'x', 'threads', 'website'])).max(8),
  aiInstructions: text(10000)
});
export function parseBrandKit(value: unknown) {
  const result = brandKitSchema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid brand context', details: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
  return result.data;
}
export function normalizeBrandKit(value: unknown) {
  const defaults = { schemaVersion: 1, colors: [], industry: '', businessDescription: '', targetAudiences: [], voice: '', tone: [], keywords: [], forbiddenPhrases: [], preferredCta: '', languages: ['vi'], socialPlatforms: [], aiInstructions: '' };
  const stored = typeof value === 'object' && value !== null ? value : {};
  return parseBrandKit({ ...defaults, ...stored });
}
export class BrandDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsObject() guidelines!: Record<string, unknown>;
}
export class LogoDto { @IsOptional() @IsUUID() assetId?: string | null; }
export class ProductDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @IsString() @MaxLength(10000) description!: string;
  @IsString() @MaxLength(200) priceReference!: string;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(500, { each: true }) features!: string[];
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(500, { each: true }) benefits!: string[];
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(500, { each: true }) audiences!: string[];
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(100, { each: true }) categories!: string[];
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(100, { each: true }) tags!: string[];
  @IsIn(['ACTIVE', 'ARCHIVED']) status!: 'ACTIVE' | 'ARCHIVED';
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID(undefined, { each: true }) brandIds!: string[];
}
export class CatalogQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(150) search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status?: 'ACTIVE' | 'ARCHIVED';
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(100) tag?: string;
}
