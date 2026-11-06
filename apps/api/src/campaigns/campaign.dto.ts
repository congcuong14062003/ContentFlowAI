import { IsArray, ArrayMaxSize, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';
export class CampaignDto {
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @IsString() @MaxLength(2000) objective!: string;
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(200, { each: true }) audiences!: string[];
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsIn(['PLANNED','ACTIVE','COMPLETED','ARCHIVED']) status!: string;
  @IsOptional() @IsInt() @Min(1) expectedVersion?: number;
}
export class CampaignQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(150) search?: string;
  @IsOptional() @IsIn(['PLANNED','ACTIVE','COMPLETED','ARCHIVED']) status?: string;
  @IsOptional() @IsUUID() brandId?: string;
}
export class AttachContentDto { @IsUUID() contentId!: string; @IsInt() @Min(1) expectedVersion!: number; }
export class TransitionDto { @IsInt() @Min(1) expectedVersion!: number; @IsIn(['IDEA','DRAFT','IN_REVIEW','APPROVED','REJECTED','SCHEDULED','PUBLISHED','FAILED','ARCHIVED']) status!: string; @IsOptional() @IsString() @MaxLength(1000) reason?: string; @IsOptional() @IsUUID() reviewerId?: string; }
export class ScheduleDto { @IsInt() @Min(1) expectedVersion!: number; @IsString() scheduledAt!: string; }
export class CalendarQuery { @IsString() from!: string; @IsString() to!: string; @IsOptional() @IsUUID() brandId?: string; @IsOptional() @IsIn(['IDEA','DRAFT','IN_REVIEW','APPROVED','REJECTED','SCHEDULED','PUBLISHED','FAILED','ARCHIVED']) status?: string; }
