import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const amount = /^(0|[1-9]\d{0,15})$/;
export class PlanCreateDto {
  @IsString() @Matches(/^(FREE|STARTER|PRO|TEAM)_(MONTHLY|YEARLY)_V[1-9]\d{0,5}$/) code!: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsIn(['FREE', 'STARTER', 'PRO', 'TEAM']) tier!: string;
  @IsIn(['MONTHLY', 'YEARLY']) cadence!: string;
  @IsString() @Matches(amount) priceMinor!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsInt() @Min(1) @Max(10000) memberLimit!: number;
  @IsInt() @Min(0) @Max(1000) brandLimit!: number;
  @IsString() @Matches(amount) storageLimitBytes!: string;
  @IsString() @Matches(amount) periodCredits!: string;
  @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsString({ each: true }) @MaxLength(50, { each: true }) features!: string[];
  @IsBoolean() active!: boolean;
}

export class PlanActivationDto {
  @IsBoolean() active!: boolean;
}

export class SubscribeDto {
  @IsUUID() planId!: string;
  @IsString() @Matches(/^[a-zA-Z0-9_-]{8,80}$/) idempotencyKey!: string;
}

export class ManualConfirmDto {
  @IsString() @MinLength(20) @MaxLength(500) evidence!: string;
}

export class CancelSubscriptionDto {
  @IsOptional() @IsBoolean() atPeriodEnd?: boolean;
}
