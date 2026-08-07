-- CreateIndex
CREATE INDEX "CanvasItem_roomId_deletedAt_createdAt_idx" ON "CanvasItem"("roomId", "deletedAt", "createdAt");
