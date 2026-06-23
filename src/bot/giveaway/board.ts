import { ChannelType, Guild, TextChannel } from "discord.js";
import type { Giveaway } from "@prisma/client";
import { client } from "../client.js";
import { getGuildConfig, updateGuildConfig } from "../../services/guildConfig.js";
import { getActiveGiveaway, topReferrers, entryStats, listReferralCodes } from "../../services/giveaways.js";
import { giveawayRankingBoard, winnersRecordMessage, giveawayKickoffMessage } from "./render.js";

const CH = {
  active: "sorteios-ativos",
  guests: "convidados",
  ranking: "ranking",
  winners: "ganhadores",
} as const;

async function fetchTextChannel(id: string | null): Promise<TextChannel | null> {
  if (!id) return null;
  const ch = await client.channels.fetch(id).catch(() => null);
  return ch && ch.type === ChannelType.GuildText ? (ch as TextChannel) : null;
}

export interface GiveawayChannels {
  categoryId: string;
  activeId: string;
  guestsId: string;
  rankingId: string;
  winnersId: string;
}

// Cria (ou reusa) a categoria "🎉 Sorteios" + 3 salas e grava no GuildConfig.
export async function provisionGiveawayChannels(guild: Guild): Promise<GiveawayChannels> {
  const cfg = await getGuildConfig(guild.id);
  let categoryId = cfg.giveawayCategoryId;
  const existingCat = categoryId ? await guild.channels.fetch(categoryId).catch(() => null) : null;
  if (!existingCat || existingCat.type !== ChannelType.GuildCategory) {
    const cat = await guild.channels.create({ name: "🎉 Sorteios", type: ChannelType.GuildCategory });
    categoryId = cat.id;
  }

  const ensure = async (id: string | null, name: string): Promise<string> => {
    const existing = id ? await guild.channels.fetch(id).catch(() => null) : null;
    if (existing && existing.type === ChannelType.GuildText && existing.parentId === categoryId) return existing.id;
    const ch = await guild.channels.create({ name, type: ChannelType.GuildText, parent: categoryId! });
    return ch.id;
  };

  const activeId = await ensure(cfg.giveawayActiveChannelId, CH.active);
  const guestsId = await ensure(cfg.giveawayGuestsChannelId, CH.guests);
  const rankingId = await ensure(cfg.giveawayRankingChannelId, CH.ranking);
  const winnersId = await ensure(cfg.giveawayWinnersChannelId, CH.winners);

  await updateGuildConfig(guild.id, {
    giveawayCategoryId: categoryId,
    giveawayActiveChannelId: activeId,
    giveawayGuestsChannelId: guestsId,
    giveawayRankingChannelId: rankingId,
    giveawayWinnersChannelId: winnersId,
  });
  await refreshGiveawayRanking(guild.id);
  return { categoryId: categoryId!, activeId, guestsId, rankingId, winnersId };
}

// Atualiza a mensagem mantida de ranking no canal do sorteio.
export async function refreshGiveawayRanking(guildId: string): Promise<void> {
  const cfg = await getGuildConfig(guildId);
  const ch = await fetchTextChannel(cfg.giveawayRankingChannelId);
  if (!ch) return;
  const giveaway = await getActiveGiveaway(guildId);
  const rows = giveaway ? await topReferrers(giveaway.id) : [];
  const payload = giveawayRankingBoard(giveaway, rows);
  if (cfg.giveawayRankingMessageId) {
    const msg = await ch.messages.fetch(cfg.giveawayRankingMessageId).catch(() => null);
    if (msg) {
      await msg.edit(payload);
      return;
    }
  }
  const sent = await ch.send(payload);
  await updateGuildConfig(guildId, { giveawayRankingMessageId: sent.id });
}

// Revoga (deleta) os convites do Discord criados para o sorteio — os links param de funcionar.
export async function revokeGiveawayInvites(guild: Guild, giveawayId: string): Promise<number> {
  const codes = await listReferralCodes(giveawayId);
  let removed = 0;
  for (const rc of codes) {
    try {
      await guild.invites.delete(rc.code);
      removed++;
    } catch {
      /* convite já inexistente */
    }
  }
  return removed;
}

// Apaga as mensagens do bot num canal do sorteio.
async function clearBotMessages(channelId: string | null): Promise<void> {
  const ch = await fetchTextChannel(channelId);
  if (!ch) return;
  const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
  if (!msgs) return;
  for (const msg of msgs.values()) {
    if (msg.author.id === client.user?.id) await msg.delete().catch(() => {});
  }
}

// Limpa o painel de abertura (sorteios-ativos).
export async function clearGiveawayActive(guildId: string): Promise<void> {
  const cfg = await getGuildConfig(guildId);
  await clearBotMessages(cfg.giveawayActiveChannelId);
}

// Limpa o feed de convidados.
export async function clearGiveawayGuests(guildId: string): Promise<void> {
  const cfg = await getGuildConfig(guildId);
  await clearBotMessages(cfg.giveawayGuestsChannelId);
}

// Re-renderiza a mensagem de abertura do sorteio ativo (após editar textos).
export async function refreshActiveKickoff(): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const cfg = await getGuildConfig(guild.id);
    const ch = await fetchTextChannel(cfg.giveawayActiveChannelId);
    if (!ch) continue;
    const giveaway = await getActiveGiveaway(guild.id);
    if (!giveaway) continue;
    const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    if (!msgs) continue;
    for (const msg of msgs.values()) {
      if (msg.author.id !== client.user?.id) continue;
      const isKickoff = msg.components.some((row) =>
        ((row as { components?: { customId?: string | null }[] }).components ?? []).some((c) =>
          c.customId?.startsWith("gv:link"),
        ),
      );
      if (isKickoff) {
        await msg.edit(giveawayKickoffMessage(giveaway)).catch(() => {});
        break;
      }
    }
  }
}

// Posta o registro de um sorteio encerrado no canal ganhadores.
export async function postWinnersRecord(guildId: string, giveaway: Giveaway, winners: string[]): Promise<void> {
  const cfg = await getGuildConfig(guildId);
  const ch = await fetchTextChannel(cfg.giveawayWinnersChannelId);
  if (!ch) return;
  const stats = await entryStats(giveaway.id);
  await ch.send(winnersRecordMessage(giveaway, winners, stats));
}
