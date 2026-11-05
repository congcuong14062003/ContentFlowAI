import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class MediaQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(150) search?: string;
  @IsOptional() @IsString() @MaxLength(50) tag?: string;
  @IsOptional() @IsUUID() folderId?: string;
}

export class FolderDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
}

export class MediaEditDto {
  @IsOptional() @IsUUID() folderId?: string | null;
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) @MaxLength(50, { each: true }) tags!: string[];
}
