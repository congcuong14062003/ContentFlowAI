import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class AdminUsersQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['active', 'suspended', 'all']) status?: 'active' | 'suspended' | 'all';
}

export class AccountStatusDto {
  @IsIn(['suspend', 'restore']) action!: 'suspend' | 'restore';
  @IsString() @MinLength(20) @MaxLength(500) reason!: string;
}

export class AdminAiUsageQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(50) provider?: string;
  @IsOptional() @IsIn(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'CANCELLED']) status?: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | 'CANCELLED';
}
