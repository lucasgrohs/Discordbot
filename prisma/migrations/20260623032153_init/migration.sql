-- CreateEnum
CREATE TYPE "TradeUnit" AS ENUM ('DIAMOND', 'GOLD', 'ITEM', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketCurrency" AS ENUM ('BRL', 'USD');

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('ENABLED', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('SELL', 'BUY');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TradeState" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TradeRole" AS ENUM ('BUYER', 'SELLER');

-- CreateEnum
CREATE TYPE "VipTier" AS ENUM ('KICK', 'NITRO');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SanctionType" AS ENUM ('WARNING', 'SUSPENSION', 'BAN');

-- CreateEnum
CREATE TYPE "SanctionScope" AS ENUM ('GAME', 'GLOBAL');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "GiveawayStatus" AS ENUM ('DRAFT', 'RUNNING', 'ENDED');

-- CreateEnum
CREATE TYPE "GiveawayMode" AS ENUM ('TOP1', 'TOP3', 'TOP10', 'RANDOM_VALID', 'TOP30_RANDOM', 'MIXED');

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "marketplaceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "marketStatus" "MarketStatus" NOT NULL DEFAULT 'ENABLED',
    "tradeUnit" "TradeUnit" NOT NULL DEFAULT 'DIAMOND',
    "baseQuantity" INTEGER NOT NULL DEFAULT 1000,
    "currency" "MarketCurrency" NOT NULL DEFAULT 'BRL',
    "channelId" TEXT,
    "riskNotice" TEXT,
    "listingTtlHours" INTEGER NOT NULL DEFAULT 48,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameServer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "type" "ListingType" NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "itemName" TEXT,
    "quantityTotal" INTEGER NOT NULL,
    "quantityAvailable" INTEGER NOT NULL,
    "minPerTrade" INTEGER NOT NULL DEFAULT 1,
    "maxPerTrade" INTEGER,
    "pricePer1k" DECIMAL(12,2) NOT NULL,
    "currency" "MarketCurrency" NOT NULL DEFAULT 'BRL',
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "renewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "pricePer1k" DECIMAL(12,2) NOT NULL,
    "currency" "MarketCurrency" NOT NULL DEFAULT 'BRL',
    "state" "TradeState" NOT NULL DEFAULT 'PENDING',
    "ticketChannelId" TEXT,
    "buyerCompleted" BOOLEAN NOT NULL DEFAULT false,
    "sellerCompleted" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeEvent" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromState" "TradeState",
    "toState" "TradeState" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "rateeId" TEXT NOT NULL,
    "rateeRole" "TradeRole" NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserReputation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TradeRole" NOT NULL,
    "completedTrades" INTEGER NOT NULL DEFAULT 0,
    "cancelledTrades" INTEGER NOT NULL DEFAULT 0,
    "disputes" INTEGER NOT NULL DEFAULT 0,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "denialCount" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserReputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VipGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "VipTier" NOT NULL,
    "source" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "VipGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KickLink" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "kickUserId" TEXT NOT NULL,
    "kickUsername" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KickLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedId" TEXT NOT NULL,
    "tradeId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sanction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SanctionType" NOT NULL,
    "scope" "SanctionScope" NOT NULL DEFAULT 'GLOBAL',
    "gameId" TEXT,
    "reason" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Sanction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "reason" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "proofUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "mode" "GiveawayMode" NOT NULL DEFAULT 'TOP10',
    "status" "GiveawayStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "winnerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minAccountAgeDays" INTEGER NOT NULL DEFAULT 7,
    "minStayDays" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "inviteCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralEntry" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE INDEX "GameServer_gameId_idx" ON "GameServer"("gameId");

-- CreateIndex
CREATE INDEX "Listing_gameId_serverId_type_status_idx" ON "Listing"("gameId", "serverId", "type", "status");

-- CreateIndex
CREATE INDEX "Listing_userId_idx" ON "Listing"("userId");

-- CreateIndex
CREATE INDEX "Listing_status_expiresAt_idx" ON "Listing"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Trade_buyerId_idx" ON "Trade"("buyerId");

-- CreateIndex
CREATE INDEX "Trade_sellerId_idx" ON "Trade"("sellerId");

-- CreateIndex
CREATE INDEX "Trade_state_idx" ON "Trade"("state");

-- CreateIndex
CREATE INDEX "Trade_listingId_idx" ON "Trade"("listingId");

-- CreateIndex
CREATE INDEX "TradeEvent_tradeId_idx" ON "TradeEvent"("tradeId");

-- CreateIndex
CREATE INDEX "Review_rateeId_idx" ON "Review"("rateeId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_tradeId_raterId_key" ON "Review"("tradeId", "raterId");

-- CreateIndex
CREATE INDEX "UserReputation_role_score_idx" ON "UserReputation"("role", "score");

-- CreateIndex
CREATE UNIQUE INDEX "UserReputation_userId_role_key" ON "UserReputation"("userId", "role");

-- CreateIndex
CREATE INDEX "VipGrant_active_tier_idx" ON "VipGrant"("active", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "VipGrant_userId_tier_key" ON "VipGrant"("userId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "KickLink_discordUserId_key" ON "KickLink"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "KickLink_kickUserId_key" ON "KickLink"("kickUserId");

-- CreateIndex
CREATE INDEX "Block_blockerId_idx" ON "Block"("blockerId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_blockerId_blockedId_key" ON "Block"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "Report_reportedId_idx" ON "Report"("reportedId");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Sanction_userId_active_idx" ON "Sanction"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_tradeId_key" ON "Dispute"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_giveawayId_ownerId_key" ON "ReferralCode"("giveawayId", "ownerId");

-- CreateIndex
CREATE INDEX "ReferralEntry_giveawayId_referrerId_status_idx" ON "ReferralEntry"("giveawayId", "referrerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralEntry_giveawayId_invitedUserId_key" ON "ReferralEntry"("giveawayId", "invitedUserId");

-- AddForeignKey
ALTER TABLE "GameServer" ADD CONSTRAINT "GameServer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "GameServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "GameServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeEvent" ADD CONSTRAINT "TradeEvent_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEntry" ADD CONSTRAINT "ReferralEntry_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
