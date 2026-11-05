import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
export class GrantDto {
  @IsIn(['SUBSCRIPTION', 'PURCHASE', 'PROMOTIONAL', 'ADMIN']) source!: 'SUBSCRIPTION' | 'PURCHASE' | 'PROMOTIONAL' | 'ADMIN';
  @IsString() @Matches(/^[1-9]\d{0,18}$/) amount!: string;
  @IsOptional() @IsISO8601({ strict: true }) expiresAt?: string;
  @IsString() @MinLength(3) @MaxLength(200) reference!: string;
  @IsString() @Matches(/^[a-zA-Z0-9_-]{8,80}$/) idempotencyKey!: string;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
export class AdjustmentDto {
  @IsString() @Matches(/^-?[1-9]\d{0,18}$/) amount!: string;
  @IsString() @Matches(/^[a-zA-Z0-9_-]{8,80}$/) idempotencyKey!: string;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
export class EvidenceDto { @IsString() @MinLength(10) @MaxLength(500) evidence!: string; }
export class PolicyDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @Matches(/^(0|[1-9]\d{0,18})$/) dailyCapMicros!: string;
  @IsInt() @Min(1) @Max(1000) requestsPerMinute!: number;
  @IsInt() @Min(1) @Max(20) maxConcurrent!: number;
}
