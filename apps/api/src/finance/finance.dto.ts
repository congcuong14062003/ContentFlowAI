import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class FinanceQuery {
  @IsISO8601({ strict: true }) from!: string;
  @IsISO8601({ strict: true }) to!: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9_-]{1,50}$/) provider?: string;
}
export class CostEntryDto {
  @IsIn(['STORAGE','INFRASTRUCTURE']) category!: 'STORAGE' | 'INFRASTRUCTURE';
  @IsString() @Matches(/^(0|[1-9]\d{0,15})$/) amountMicros!: string;
  @IsISO8601({strict:true}) incurredAt!: string;
  @IsString() @MinLength(4) @MaxLength(120) sourceKey!: string;
  @IsString() @MinLength(4) @MaxLength(500) note!: string;
  @IsOptional() @IsUUID() workspaceId?: string;
}
