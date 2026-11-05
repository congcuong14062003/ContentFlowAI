import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
export class EmailDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @Length(5, 320) email: string;
}
export class LoginDto extends EmailDto {
  @IsString() @Length(1, 128) password: string;
}
export class RegisterDto extends EmailDto {
  @IsString() @Length(1, 100) @Matches(/\S/) displayName: string;
  @IsString() @Length(12, 128) password: string;
  @IsOptional() @IsIn(['vi', 'en']) language?: string;
}
export class TokenDto { @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token: string; }
export class ResetDto extends TokenDto { @IsString() @Length(12, 128) password: string; }
export class ProfileDto {
  @IsOptional() @IsString() @Length(1, 100) @Matches(/\S/) displayName?: string;
  @IsOptional() @IsIn(['vi', 'en']) language?: string;
}
export class PasswordDto {
  @IsString() @Length(1, 128) currentPassword: string;
  @IsString() @Length(12, 128) password: string;
}
