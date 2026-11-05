import { IsEmail, IsIn, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
export class WorkspaceDto { @IsString() @Length(1, 100) @Matches(/\S/) name: string; }
export class RoleDto { @IsIn(['ADMIN', 'EDITOR', 'VIEWER']) role: 'ADMIN' | 'EDITOR' | 'VIEWER'; }
export class InvitationDto extends RoleDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @Length(5, 320) email: string;
}
