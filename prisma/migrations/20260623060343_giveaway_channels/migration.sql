-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN     "giveawayActiveChannelId" TEXT,
ADD COLUMN     "giveawayCategoryId" TEXT,
ADD COLUMN     "giveawayRankingChannelId" TEXT,
ADD COLUMN     "giveawayRankingMessageId" TEXT,
ADD COLUMN     "giveawayWinnersChannelId" TEXT;
