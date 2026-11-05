/** Future explicit provider integration; manual publishing never invokes this port. */
export interface SocialPublishingAdapter {
  readonly platform: string;
  publish(input: { workspaceId: string; contentId: string; approvedVersion: number; scheduledAt: Date }): Promise<{ providerPostId: string; publishedAt: Date }>;
}
