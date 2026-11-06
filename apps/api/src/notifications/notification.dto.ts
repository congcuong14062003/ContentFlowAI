import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { PageQuery } from '../common/pagination';
export const eventTypes = ['TEAM_INVITATION','CONTENT_REVIEW_REQUESTED','CONTENT_APPROVED','CONTENT_REJECTED','COMMENT_MENTION','CREDIT_LOW','PAYMENT_FAILED','SUBSCRIPTION_EXPIRING','SCHEDULED_REMINDER','PUBLISHING_ERROR','SUPPORT_REPLY','CONTENT_ASSIGNED'] as const;
export type EventType = typeof eventTypes[number];
export class NotificationQuery extends PageQuery {
  @IsOptional() @IsIn(['all','unread','archived']) filter?: 'all'|'unread'|'archived';
}
export class NotificationPreferenceDto {
  @IsBoolean() emailEnabled!: boolean;
  @IsArray() @ArrayMaxSize(eventTypes.length) @ArrayUnique() @IsIn(eventTypes,{each:true}) mutedTypes!: EventType[];
  @IsOptional() @IsString() @Matches(/^(0|[1-9]\d{0,15})$/) lowCreditThreshold?:string;
}
