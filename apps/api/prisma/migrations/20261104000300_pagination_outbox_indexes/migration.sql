CREATE INDEX "Session_userId_revokedAt_createdAt_id_idx" ON "Session"("userId", "revokedAt", "createdAt", "id");
CREATE INDEX "Membership_userId_createdAt_id_idx" ON "Membership"("userId", "createdAt", "id");
CREATE INDEX "Membership_workspaceId_createdAt_id_idx" ON "Membership"("workspaceId", "createdAt", "id");
CREATE INDEX "Invitation_workspaceId_createdAt_id_idx" ON "Invitation"("workspaceId", "createdAt", "id");
CREATE INDEX "OutboxEvent_topic_publishedAt_createdAt_id_idx" ON "OutboxEvent"("topic", "publishedAt", "createdAt", "id");
