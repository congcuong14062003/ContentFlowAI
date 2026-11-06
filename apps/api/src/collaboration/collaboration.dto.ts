import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';
export class AssignmentDto { @IsInt() @Min(1) expectedVersion!:number; @IsUUID() assigneeId!:string; @IsOptional() @IsUUID() ownerId?:string; }
export class CommentDto { @IsString() @MinLength(1) @MaxLength(5000) body!:string; @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID(undefined,{each:true}) mentions!:string[]; }
export class ActivityQuery extends PageQuery { @IsOptional() @IsString() @MaxLength(100) action?:string; }
