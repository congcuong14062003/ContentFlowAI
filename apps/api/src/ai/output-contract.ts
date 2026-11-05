import type { Prisma } from '@prisma/client';
/** Trusted backend parser only; callers cannot submit executable validators through HTTP. */
export interface GenerationOutputContract { key: string; validate(output: unknown): Prisma.InputJsonValue }
