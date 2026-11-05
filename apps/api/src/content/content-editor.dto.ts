import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
export class SaveContentDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @IsString() @MinLength(1) @MaxLength(250) title!: string;
  @IsString() @MaxLength(100000) text!: string;
}
export class RestoreContentDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @IsInt() @Min(1) @Max(2147483646) version!: number;
}
