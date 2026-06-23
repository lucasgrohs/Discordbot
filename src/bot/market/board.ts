import { ChannelType, Guild, TextChannel } from "discord.js";
import type { Game, Listing } from "@prisma/client";
import { TradeRole } from "@prisma/client";
import { client } from "../client.js";
import { getGame, updateGame, listGames } from "../../services/games.js";
import { getServer } from "../../services/servers.js";
import { getListing, setBoardMessage, activeSellersForGame, listAllActiveListings } from "../../services/listings.js";
import { refreshActiveKickoff } from "../giveaway/board.js";
import { getReputation } from "../../services/reputation.js";
import { MKT, panelMessage, sellCardMessage, buyCardMessage, gameRankingMessage } from "./render.js";

const CH = {
  negocie: "negocie",
  sell: "anuncios-de-venda",
  buy: "anuncios-de-compra",
  ranking: "ranking",
  chat: "chat-livre",
} as const;

async function fetchTextChannel(id: string | null): Promise<TextChannel | null> {
  if (!id) return null;
  const ch = await client.channels.fetch(id).catch(() => null);
  return ch && ch.type === ChannelType.GuildText ? (ch as TextChannel) : null;
}

// Cria (ou reusa) a categoria + 5 salas do jogo e grava os IDs.
export async function provisionGameChannels(guild: Guild, game: Game): Promise<Game> {
  let categoryId = game.categoryId;
  const existingCat = categoryId ? await guild.channels.fetch(categoryId).catch(() => null) : null;
  if (!existingCat || existingCat.type !== ChannelType.GuildCategory) {
    const cat = await guild.channels.create({
      name: `${game.emoji ? game.emoji + " " : ""}${game.name}`,
      type: ChannelType.GuildCategory,
    });
    categoryId = cat.id;
  }

  const ensure = async (id: string | null, name: string): Promise<{ id: string; created: boolean }> => {
    const existing = id ? await guild.channels.fetch(id).catch(() => null) : null;
    // Só reaproveita se o canal existe E está dentro da categoria do jogo.
    if (existing && existing.type === ChannelType.GuildText && existing.parentId === categoryId) {
      return { id: existing.id, created: false };
    }
    const ch = await guild.channels.create({ name, type: ChannelType.GuildText, parent: categoryId! });
    return { id: ch.id, created: true };
  };

  const negocie = await ensure(game.channelId, CH.negocie);
  const sell = await ensure(game.sellChannelId, CH.sell);
  const buy = await ensure(game.buyChannelId, CH.buy);
  const ranking = await ensure(game.rankingChannelId, CH.ranking);
  const chat = await ensure(game.chatChannelId, CH.chat);

  const updated = await updateGame(game.id, {
    categoryId,
    channelId: negocie.id,
    sellChannelId: sell.id,
    buyChannelId: buy.id,
    rankingChannelId: ranking.id,
    chatChannelId: chat.id,
  });

  if (negocie.created) {
    const ch = await fetchTextChannel(negocie.id);
    if (ch) await ch.send(panelMessage(updated));
  }
  await refreshRanking(updated.id);
  return updated;
}

async function editOrRepost(listing: Listing): Promise<void> {
  const game = await getGame(listing.gameId);
  if (!game) return;
  const channelId = listing.type === "SELL" ? game.sellChannelId : game.buyChannelId;
  const ch = await fetchTextChannel(channelId);
  if (!ch) return;
  const server = await getServer(listing.serverId);
  const payload =
    listing.type === "SELL"
      ? sellCardMessage(listing, game, server?.name ?? "—")
      : buyCardMessage(listing, game, server?.name ?? "—");

  if (listing.boardMessageId) {
    const msg = await ch.messages.fetch(listing.boardMessageId).catch(() => null);
    if (msg) {
      await msg.edit(payload);
      return;
    }
  }
  const sent = await ch.send(payload);
  await setBoardMessage(listing.id, sent.id);
}

export async function removeListingCard(listing: Listing): Promise<void> {
  if (!listing.boardMessageId) return;
  const game = await getGame(listing.gameId);
  const channelId = game ? (listing.type === "SELL" ? game.sellChannelId : game.buyChannelId) : null;
  const ch = await fetchTextChannel(channelId);
  if (ch) {
    const msg = await ch.messages.fetch(listing.boardMessageId).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  }
  await setBoardMessage(listing.id, null);
}

// Posta/atualiza/remove o card conforme o estado atual do anúncio.
export async function syncListingCard(listingId: string): Promise<void> {
  const listing = await getListing(listingId);
  if (!listing) return;
  // Sem quantidade disponível também some (ex.: reservado/vendido).
  if (listing.status !== "ACTIVE" || listing.quantityAvailable <= 0) {
    await removeListingCard(listing);
    return;
  }
  await editOrRepost(listing);
}

// Limpa a sala "negocie": mantém apenas o painel COMPRO/VENDO e apaga as demais
// mensagens do bot — resolvidas (sem botões) ou antigas (> 30 min), como
// solicitações de negociação que caíram aqui por DM fechada.
const NEGOCIE_MSG_TTL_MS = 30 * 60 * 1000;

export async function cleanupNegocie(game: Game): Promise<number> {
  const ch = await fetchTextChannel(game.channelId);
  if (!ch) return 0;
  const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return 0;
  const now = Date.now();
  let removed = 0;
  for (const msg of msgs.values()) {
    if (msg.author.id !== client.user?.id) continue; // só mensagens do bot
    // Mantém o painel (botão COMPRO com custom_id mkt:buy:...).
    const isPanel = msg.components.some((row) => {
      const comps = (row as { components?: { customId?: string | null }[] }).components ?? [];
      return comps.some((c) => c.customId?.startsWith(`${MKT}:buy:`));
    });
    if (isPanel) continue;
    const resolved = msg.components.length === 0;
    const old = now - msg.createdTimestamp > NEGOCIE_MSG_TTL_MS;
    if (resolved || old) {
      await msg.delete().catch(() => {});
      removed++;
    }
  }
  return removed;
}

// Acha e re-renderiza o painel COMPRO/VENDO no canal do jogo.
async function editPanel(game: { id: string; channelId: string | null }): Promise<boolean> {
  const ch = await fetchTextChannel(game.channelId);
  if (!ch) return false;
  const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return false;
  const full = await getGame(game.id);
  if (!full) return false;
  for (const msg of msgs.values()) {
    if (msg.author.id !== client.user?.id) continue;
    const isPanel = msg.components.some((row) =>
      ((row as { components?: { customId?: string | null }[] }).components ?? []).some((c) =>
        c.customId?.startsWith(`${MKT}:buy:`),
      ),
    );
    if (isPanel) {
      await msg.edit(panelMessage(full)).catch(() => {});
      return true;
    }
  }
  return false;
}

// Re-renderiza painéis, cards e a abertura do sorteio (após editar textos no painel web).
export async function refreshAll(): Promise<{ panels: number; cards: number }> {
  let panels = 0;
  let cards = 0;
  for (const g of await listGames()) {
    if (g.channelId && (await editPanel(g))) panels++;
  }
  for (const l of await listAllActiveListings()) {
    await syncListingCard(l.id);
    cards++;
  }
  await refreshActiveKickoff().catch(() => {});
  return { panels, cards };
}

// Atualiza a mensagem de ranking da sala do jogo.
export async function refreshRanking(gameId: string): Promise<void> {
  const game = await getGame(gameId);
  if (!game) return;
  const ch = await fetchTextChannel(game.rankingChannelId);
  if (!ch) return;

  const sellers = await activeSellersForGame(gameId);
  const entries = [];
  for (const s of sellers) {
    const rep = await getReputation(s.userId, TradeRole.SELLER);
    entries.push({
      userId: s.userId,
      ratingSum: rep?.ratingSum ?? 0,
      ratingCount: rep?.ratingCount ?? 0,
      completedTrades: rep?.completedTrades ?? 0,
      activeListings: s.listings,
    });
  }
  entries.sort((a, b) => {
    const ar = a.ratingCount ? a.ratingSum / a.ratingCount : 0;
    const br = b.ratingCount ? b.ratingSum / b.ratingCount : 0;
    return br - ar || b.completedTrades - a.completedTrades;
  });

  const payload = gameRankingMessage(game, entries.slice(0, 10));
  if (game.rankingMessageId) {
    const msg = await ch.messages.fetch(game.rankingMessageId).catch(() => null);
    if (msg) {
      await msg.edit(payload);
      return;
    }
  }
  const sent = await ch.send(payload);
  await updateGame(gameId, { rankingMessageId: sent.id });
}
