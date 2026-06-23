-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorTag" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketMessage_tradeId_createdAt_idx" ON "TicketMessage"("tradeId", "createdAt");
