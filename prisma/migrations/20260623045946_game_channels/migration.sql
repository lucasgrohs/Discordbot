-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "buyChannelId" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "chatChannelId" TEXT,
ADD COLUMN     "rankingChannelId" TEXT,
ADD COLUMN     "rankingMessageId" TEXT,
ADD COLUMN     "sellChannelId" TEXT;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "boardMessageId" TEXT;
