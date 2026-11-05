import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { TaskType } from './ai.config';
export class EstimateDto {
  @IsIn(['TEXT_GENERATION', 'SUMMARIZE', 'TRANSLATE', 'IMAGE_GENERATION']) taskType!: TaskType;
  @IsString() @MinLength(1) @MaxLength(50000) prompt!: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(32000) maxOutputTokens?: number;
}
export class GenerationInputDto extends EstimateDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{8,80}$/) idempotencyKey!: string;
}
export class ReconcileGenerationDto {
  @IsIn(['UNBILLED', 'BILLED']) outcome!: 'UNBILLED' | 'BILLED';
  @IsOptional() @IsInt() @Min(0) @Max(1000000) inputTokens?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) outputTokens?: number;
  @IsString() @MinLength(10) @MaxLength(500) evidence!: string;
}
