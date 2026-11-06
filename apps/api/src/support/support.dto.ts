import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
export class TicketQuery {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED']) status?: string;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority?: string;
  @IsOptional() @IsUUID() workspaceId?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
}
export class CreateTicketDto {
  @IsString() @MinLength(3) @MaxLength(200) subject!: string;
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
  @IsIn(['SUPPORT','FEEDBACK']) kind!: 'SUPPORT' | 'FEEDBACK';
}
export class ReplyDto {
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
  @IsOptional() @IsBoolean() internal?: boolean;
}
export class UpdateTicketDto {
  @IsOptional() @IsIn(['OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED']) status?: string;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
}
