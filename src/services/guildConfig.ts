import { prisma } from "../db.js";
import type { GuildConfig } from "@prisma/client";

type ConfigPatch = Partial<
  Pick<
    GuildConfig,
    | "vipTier1RoleId"
    | "vipTier2RoleId"
    | "staffChannelId"
    | "logChannelId"
    | "disputeChannelId"
    | "giveawayCategoryId"
    | "giveawayActiveChannelId"
    | "giveawayGuestsChannelId"
    | "giveawayRankingChannelId"
    | "giveawayWinnersChannelId"
    | "giveawayRankingMessageId"
  >
>;

// Lê a config do servidor, criando o registro vazio na primeira vez.
export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  return prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId },
    update: {},
  });
}

export async function updateGuildConfig(guildId: string, patch: ConfigPatch): Promise<GuildConfig> {
  return prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, ...patch },
    update: patch,
  });
}
