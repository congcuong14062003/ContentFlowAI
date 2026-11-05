import { IsInt, IsUUID, Matches, Max, Min } from 'class-validator';
export class CreateRunDto { @IsUUID() quoteId!: string; @Matches(/^[a-zA-Z0-9_-]{8,80}$/) idempotencyKey!: string; }
export class SaveVariationDto { @IsInt() @Min(0) @Max(4) variationIndex!: number; }
