import {
  MessageFlags,
  ChannelType,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  AttachmentBuilder,
} from "discord.js";
import { registerComponent } from "../router.js";
import { client } from "../client.js";
import { syncListingCard, refreshRanking } from "./board.js";
import { getTranscript } from "../../services/transcripts.js";
import { getGame } from "../../services/games.js";
import { listServers, getServer } from "../../services/servers.js";
import {
  createListing,
  getListing,
  pauseListing,
  renewListing,
  closeListing,
  closeIfEmpty,
  setStock,
} from "../../services/listings.js";
import { matchSellers, type SortMode } from "../../services/matching.js";
import {
  createTrade,
  getTrade,
  acceptTrade,
  refuseTrade,
  markComplete,
  cancelTrade,
  openDispute,
  setTicketChannel,
  clearTicketChannel,
} from "../../services/trades.js";
import { getGuildConfig } from "../../services/guildConfig.js";
import { submitReview, reviewCount } from "../../services/reputation.js";
import { isBanned, isBlocked } from "../../services/moderation.js";
import { text } from "../../services/texts.js";
import {
  MKT,
  panelMessage,
  serverSelectRow,
  sellModal,
  buyModal,
  resultsMessage,
  listingMgmtMessage,
  stockModal,
  requestMessage,
  restockReminder,
  ticketMessage,
  ticketCompletedMessage,
  ticketCancelledMessage,
  ticketDisputedMessage,
  disputeAlert,
  rateCommentModal,
  buyPublishModal,
  cardNegoModal,
  fmtQty,
  parseUnits,
  parseMoney,
} from "./render.js";
import { ListingType, TradeRole } from "@prisma/client";

const EPH = MessageFlags.Ephemeral;
const BANNED_MSG = "Você está impedido de usar o marketplace.";

// Cria a solicitação de negociação e avisa o vendedor. Usado tanto pelos
// resultados do COMPRO quanto pelos cards no canal de anúncios.
async function startNegotiation(
  i: MessageComponentInteraction | ModalSubmitInteraction,
  listingId: string,
  requestedQty: number,
): Promise<void> {
  const listing = await getListing(listingId);
  if (!listing || listing.status !== "ACTIVE") {
    await i.reply({ content: "Este anúncio não está mais disponível.", flags: EPH });
    return;
  }
  if (listing.userId === i.user.id) {
    await i.reply({ content: "Você não pode negociar com o seu próprio anúncio.", flags: EPH });
    return;
  }
  if (await isBanned(i.user.id)) {
    await i.reply({ content: BANNED_MSG, flags: EPH });
    return;
  }
  if (await isBlocked(i.user.id, listing.userId)) {
    await i.reply({ content: "Não é possível negociar: há um bloqueio entre vocês.", flags: EPH });
    return;
  }
  if (!i.guildId) return;
  if (listing.quantityAvailable < listing.minPerTrade) {
    await i.reply({
      content: `Este vendedor está sem estoque suficiente no momento (mínimo de ${fmtQty(listing.minPerTrade)}).`,
      flags: EPH,
    });
    return;
  }
  if (requestedQty < listing.minPerTrade) {
    await i.reply({
      content: `Este vendedor só negocia a partir de **${fmtQty(listing.minPerTrade)}** por vez.`,
      flags: EPH,
    });
    return;
  }
  const cap = listing.maxPerTrade ? Math.min(listing.quantityAvailable, listing.maxPerTrade) : listing.quantityAvailable;
  const negQty = Math.min(requestedQty, cap);
  const game = await getGame(listing.gameId);
  const server = await getServer(listing.serverId);
  if (!game || !server) return;

  // Papéis: quem clica é o iniciador; o dono do anúncio é quem aceita.
  // SELL → iniciador é comprador; BUY → iniciador é vendedor.
  const ownerId = listing.userId;
  const isSell = listing.type === "SELL";
  const buyerId = isSell ? i.user.id : ownerId;
  const sellerId = isSell ? ownerId : i.user.id;

  const trade = await createTrade({
    guildId: i.guildId,
    listingId: listing.id,
    buyerId,
    sellerId,
    gameId: listing.gameId,
    serverId: listing.serverId,
    quantity: negQty,
    pricePer1k: Number(listing.pricePer1k),
    currency: listing.currency,
  });

  const req = requestMessage(trade, game, server.name, listing.itemName, ownerId);
  let delivered = false;
  try {
    const owner = await client.users.fetch(ownerId);
    await owner.send(req);
    delivered = true;
  } catch {
    try {
      const ch = game.channelId ? await client.channels.fetch(game.channelId) : null;
      if (ch && ch.type === ChannelType.GuildText) {
        await ch.send(req);
        delivered = true;
      }
    } catch {
      /* sem canal disponível */
    }
  }
  await i.reply({
    content: delivered
      ? "✅ Solicitação enviada ao vendedor. Você entra no ticket assim que ele aceitar."
      : "⚠️ Não consegui avisar o vendedor (DM fechada e canal indisponível). Tente outro vendedor.",
    flags: EPH,
  });
}

registerComponent(MKT, async (i, args, action) => {
  // ---------- VENDO / COMPRO: passo 1 (escolher servidor) ----------
  if ((action === "buy" || action === "sell") && i.isButton()) {
    const game = await getGame(args[0]);
    if (!game || !game.marketplaceEnabled || game.marketStatus !== "ENABLED") {
      await i.reply({ content: "O mercado deste jogo não está disponível no momento.", flags: EPH });
      return;
    }
    if (await isBanned(i.user.id)) {
      await i.reply({ content: BANNED_MSG, flags: EPH });
      return;
    }
    const servers = await listServers(game.id, { onlyActive: true });
    if (servers.length === 0) {
      await i.reply({ content: "Este jogo ainda não tem servidores cadastrados.", flags: EPH });
      return;
    }
    await i.reply({
      content: action === "sell" ? "Onde você quer anunciar?" : "Em qual servidor você procura?",
      components: [serverSelectRow(game, servers, action === "sell" ? "sellsrv" : "buysrv")],
      flags: EPH,
    });
    return;
  }

  // ---------- passo 2 (servidor escolhido → abre o modal) ----------
  if (action === "sellsrv" && i.isStringSelectMenu()) {
    const game = await getGame(args[0]);
    if (!game) return;
    await i.showModal(sellModal(game, i.values[0]));
    return;
  }
  if (action === "buysrv" && i.isStringSelectMenu()) {
    const game = await getGame(args[0]);
    if (!game) return;
    await i.showModal(buyModal(game, i.values[0]));
    return;
  }

  // ---------- VENDO: criar anúncio ----------
  if (action === "sellmodal" && i.isModalSubmit()) {
    const [gameId, serverId] = args;
    const game = await getGame(gameId);
    if (!game) return;
    if (await isBanned(i.user.id)) {
      await i.reply({ content: BANNED_MSG, flags: EPH });
      return;
    }
    const qty = parseUnits(i.fields.getTextInputValue("qty"), game.baseQuantity);
    const price = parseMoney(i.fields.getTextInputValue("price"));
    if (!qty || !price) {
      await i.reply({ content: "Quantidade ou preço inválido. Quantidade em unidades (ex.: `30`), preço (ex.: `2,50`).", flags: EPH });
      return;
    }
    const itemName = game.tradeUnit === "ITEM" ? i.fields.getTextInputValue("item") : null;

    const created = await createListing({
      type: ListingType.SELL,
      userId: i.user.id,
      gameId,
      serverId,
      itemName,
      quantity: qty,
      pricePer1k: price,
      minPerTrade: 1000, // sistema define 1k como mínimo por negociação
      currency: game.currency,
      ttlHours: game.listingTtlHours,
    });
    await syncListingCard(created.id);
    await i.reply({
      content: [
        `✅ Anúncio publicado! Estoque **${fmtQty(qty)}** a **${game.currency} ${price.toFixed(2)}**/1k.`,
        "",
        text("vip_pitch"),
        "",
        "Gerencie seus anúncios em `/anuncios`.",
      ].join("\n"),
      flags: EPH,
    });
    return;
  }

  // ---------- COMPRO: buscar vendedores ----------
  if (action === "buymodal" && i.isModalSubmit()) {
    const [gameId, serverId] = args;
    const game = await getGame(gameId);
    const server = await getServer(serverId);
    if (!game || !server) return;
    const qty = parseUnits(i.fields.getTextInputValue("qty"), game.baseQuantity);
    if (!qty) {
      await i.reply({ content: "Quantidade inválida.", flags: EPH });
      return;
    }
    await i.deferReply({ flags: EPH });
    const results = await matchSellers({ gameId, serverId, quantity: qty, sort: "recommended" });
    await i.editReply(resultsMessage(game, server, qty, results, "recommended"));
    return;
  }

  // ---------- reordenar resultados ----------
  if (action === "sort" && i.isButton()) {
    const [gameId, serverId, qtyStr, mode] = args;
    const game = await getGame(gameId);
    const server = await getServer(serverId);
    if (!game || !server) return;
    const qty = Number(qtyStr);
    const results = await matchSellers({ gameId, serverId, quantity: qty, sort: mode as SortMode });
    await i.update(resultsMessage(game, server, qty, results, mode as SortMode));
    return;
  }

  // ---------- gerência: escolher anúncio ----------
  if (action === "mylist" && i.isStringSelectMenu()) {
    const listing = await getListing(i.values[0]);
    if (!listing || listing.userId !== i.user.id) {
      await i.reply({ content: "Anúncio não encontrado.", flags: EPH });
      return;
    }
    await i.update(listingMgmtMessage(listing));
    return;
  }

  // ---------- gerência: ações de um anúncio ----------
  if (["lpause", "lrenew", "lclose", "lstock"].includes(action) && (i.isButton() || i.isStringSelectMenu())) {
    const listing = await getListing(args[0]);
    if (!listing || listing.userId !== i.user.id) {
      await i.reply({ content: "Anúncio não encontrado.", flags: EPH });
      return;
    }
    if (action === "lstock" && i.isButton()) {
      const game = await getGame(listing.gameId);
      await i.showModal(stockModal(listing.id, listing.quantityAvailable, game?.baseQuantity ?? 1000));
      return;
    }
    let updated = listing;
    if (action === "lpause") {
      if (listing.status === "PAUSED") {
        const game = await getGame(listing.gameId); // reativar = renovar com o TTL do jogo
        updated = await renewListing(listing.id, game?.listingTtlHours ?? 48);
      } else {
        updated = await pauseListing(listing.id);
      }
    } else if (action === "lrenew") {
      const game = await getGame(listing.gameId);
      updated = await renewListing(listing.id, game?.listingTtlHours ?? 48);
    } else if (action === "lclose") {
      updated = await closeListing(listing.id);
    }
    await syncListingCard(updated.id);
    await i.update(listingMgmtMessage(updated));
    return;
  }

  // ---------- gerência: salvar novo estoque ----------
  if (action === "lstockmodal" && i.isModalSubmit()) {
    const listing = await getListing(args[0]);
    if (!listing || listing.userId !== i.user.id) {
      await i.reply({ content: "Anúncio não encontrado.", flags: EPH });
      return;
    }
    const game = await getGame(listing.gameId);
    const qty = parseUnits(i.fields.getTextInputValue("qty"), game?.baseQuantity ?? 1000);
    if (qty === null) {
      await i.reply({ content: "Quantidade inválida.", flags: EPH });
      return;
    }
    await setStock(listing.id, qty);
    await syncListingCard(listing.id);
    await i.reply({ content: `✅ Estoque atualizado para **${qty.toLocaleString("pt-BR")}**.`, flags: EPH });
    return;
  }

  // ---------- Negociar: a partir dos resultados do COMPRO ----------
  if (action === "nego" && i.isButton()) {
    const [listingId, qtyStr] = args;
    await startNegotiation(i, listingId, Number(qtyStr) || 1);
    return;
  }

  // ---------- Negociar: a partir de um card no canal de anúncios ----------
  if (action === "cardnego" && i.isButton()) {
    const listing = await getListing(args[0]);
    const game = listing ? await getGame(listing.gameId) : null;
    await i.showModal(cardNegoModal(args[0], game?.baseQuantity ?? 1000));
    return;
  }
  if (action === "cardnegomodal" && i.isModalSubmit()) {
    const listing = await getListing(args[0]);
    const game = listing ? await getGame(listing.gameId) : null;
    const qty = parseUnits(i.fields.getTextInputValue("qty"), game?.baseQuantity ?? 1000);
    if (!qty) {
      await i.reply({ content: "Quantidade inválida.", flags: EPH });
      return;
    }
    await startNegotiation(i, args[0], qty);
    return;
  }

  // ---------- Publicar pedido de compra no canal de anúncios ----------
  if (action === "pubbuy" && i.isButton()) {
    const game = await getGame(args[0]);
    if (!game) return;
    await i.showModal(buyPublishModal(args[0], args[1], game));
    return;
  }
  if (action === "pubbuymodal" && i.isModalSubmit()) {
    const [gameId, serverId] = args;
    const game = await getGame(gameId);
    if (!game) return;
    if (await isBanned(i.user.id)) {
      await i.reply({ content: BANNED_MSG, flags: EPH });
      return;
    }
    const qty = parseUnits(i.fields.getTextInputValue("qty"), game.baseQuantity);
    const price = parseMoney(i.fields.getTextInputValue("price"));
    if (!qty || !price) {
      await i.reply({ content: "Quantidade ou preço inválido.", flags: EPH });
      return;
    }
    const listing = await createListing({
      type: ListingType.BUY,
      userId: i.user.id,
      gameId,
      serverId,
      quantity: qty,
      pricePer1k: price,
      currency: game.currency,
      ttlHours: game.listingTtlHours,
    });
    await syncListingCard(listing.id);
    await i.reply({
      content: ["✅ Pedido de compra publicado no canal de anúncios.", "", text("vip_pitch")].join("\n"),
      flags: EPH,
    });
    return;
  }

  // ---------- Vendedor aceita → reserva estoque + abre ticket ----------
  if (action === "accept" && i.isButton()) {
    const trade = await getTrade(args[0]);
    if (!trade) {
      await i.reply({ content: "Negociação não encontrada.", flags: EPH });
      return;
    }
    const listing = await getListing(trade.listingId);
    if (!listing || i.user.id !== listing.userId) {
      await i.reply({ content: "Apenas o dono do anúncio pode aceitar.", flags: EPH });
      return;
    }
    if (trade.state !== "PENDING") {
      await i.reply({ content: "Esta negociação não está mais pendente.", flags: EPH });
      return;
    }
    const guild = await client.guilds.fetch(trade.guildId).catch(() => null);
    const game = await getGame(trade.gameId);
    const channel = guild && game?.channelId ? await guild.channels.fetch(game.channelId).catch(() => null) : null;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await i.reply({
        content: "Não foi possível abrir o ticket: o canal do jogo não está configurado (`/jogo canal`).",
        flags: EPH,
      });
      return;
    }

    await i.deferUpdate();
    const res = await acceptTrade(trade.id, i.user.id);
    if (!res.ok) {
      await i.followUp({ content: res.reason, flags: EPH });
      return;
    }

    let thread;
    try {
      thread = await channel.threads.create({
        name: `negociacao-${trade.id.slice(-6)}`,
        type: ChannelType.PrivateThread,
        invitable: false,
      });
    } catch {
      thread = await channel.threads.create({ name: `negociacao-${trade.id.slice(-6)}` });
    }
    await thread.members.add(trade.buyerId).catch(() => {});
    await thread.members.add(trade.sellerId).catch(() => {});
    const server = await getServer(trade.serverId);
    await thread.send(ticketMessage(res.trade, game!, server?.name ?? "—"));
    await setTicketChannel(trade.id, thread.id);
    await syncListingCard(trade.listingId);
    await i.message.delete().catch(() => {}); // remove a solicitação (sem deixar lixo)
    await i.followUp({ content: `✅ Negociação aceita! Entre no ticket: <#${thread.id}>`, flags: EPH });
    return;
  }

  // ---------- Vendedor recusa ----------
  if (action === "refuse" && i.isButton()) {
    await i.deferUpdate();
    const res = await refuseTrade(args[0], i.user.id);
    if (!res.ok) {
      await i.followUp({ content: res.reason, flags: EPH });
      return;
    }
    await i.message.delete().catch(() => {}); // remove a solicitação
    await i.followUp({ content: "✖️ Solicitação recusada.", flags: EPH });
    return;
  }

  // ---------- Concluir (conclusão mútua) ----------
  if (action === "complete" && i.isButton()) {
    const res = await markComplete(args[0], i.user.id);
    if (!res.ok) {
      await i.reply({ content: res.reason, flags: EPH });
      return;
    }
    if (res.justCompleted) {
      const closed = await closeIfEmpty(res.trade.listingId);
      await syncListingCard(res.trade.listingId);
      await refreshRanking(res.trade.gameId);
      await i.update(ticketCompletedMessage(res.trade.id));
      // Estoque do vendedor esgotou → lembra de renovar (DM elaborada).
      if (closed && closed.type === "SELL") {
        const game = await getGame(closed.gameId);
        const server = await getServer(closed.serverId);
        const owner = await client.users.fetch(closed.userId).catch(() => null);
        if (game && owner) await owner.send(restockReminder(closed, game, server?.name ?? "—")).catch(() => {});
      }
    } else {
      const game = await getGame(res.trade.gameId);
      const server = await getServer(res.trade.serverId);
      await i.update(ticketMessage(res.trade, game!, server?.name ?? "—"));
      await i.followUp({ content: "✅ Você confirmou. Aguardando o outro lado.", flags: EPH });
    }
    return;
  }

  // ---------- Cancelar ----------
  if (action === "cancel" && i.isButton()) {
    const res = await cancelTrade(args[0], i.user.id);
    if (!res.ok) {
      await i.reply({ content: res.reason, flags: EPH });
      return;
    }
    await syncListingCard(res.trade.listingId);
    await i.reply({ content: "🚫 Negociação cancelada. O estoque reservado foi devolvido.", flags: EPH });
    if (res.trade.ticketChannelId) {
      const ch = await client.channels.fetch(res.trade.ticketChannelId).catch(() => null);
      if (ch?.isThread()) await ch.delete().catch(() => {});
      await clearTicketChannel(res.trade.id);
    }
    return;
  }

  // ---------- Abrir disputa ----------
  if (action === "dispute" && i.isButton()) {
    const res = await openDispute(args[0], i.user.id);
    if (!res.ok) {
      await i.reply({ content: res.reason, flags: EPH });
      return;
    }
    await i.update(ticketDisputedMessage());
    const game = await getGame(res.trade.gameId);
    const cfg = await getGuildConfig(res.trade.guildId);
    const staffChannelId = cfg.disputeChannelId ?? cfg.staffChannelId;

    // Reaproveita a própria thread da negociação (preserva a conversa) — só renomeia.
    if (res.trade.ticketChannelId) {
      const thread = await client.channels.fetch(res.trade.ticketChannelId).catch(() => null);
      if (thread?.isThread()) {
        await thread.setName(`disputa-${res.trade.id.slice(-6)}`).catch(() => {});
        await thread.send(`⚠️ <@${i.user.id}> abriu uma **disputa**. A equipe vai avaliar esta conversa.`);
      }
    }

    // Avisa a staff com o link para o ticket existente.
    if (game && staffChannelId) {
      const ch = await client.channels.fetch(staffChannelId).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        const link = res.trade.ticketChannelId ? `\nTicket: <#${res.trade.ticketChannelId}> — entrem para resolver.` : "";
        const transcript = await getTranscript(res.trade.id);
        const files = transcript
          ? [new AttachmentBuilder(Buffer.from(transcript, "utf8"), { name: `transcript-${res.trade.id.slice(-6)}.txt` })]
          : [];
        await ch.send({ content: `⚠️ Nova disputa aberta.${link}`, ...disputeAlert(res.trade, game), files });
      }
    } else {
      await i.followUp({
        content: "⚠️ Disputa registrada, mas não há canal de staff/disputa configurado (`/config canais`).",
        flags: EPH,
      });
    }
    return;
  }

  // ---------- Avaliação: escolher estrelas ----------
  if (action === "rate" && i.isButton()) {
    const [tradeId, ratingStr] = args;
    const trade = await getTrade(tradeId);
    if (!trade || trade.state !== "COMPLETED") {
      await i.reply({ content: "Avaliação indisponível.", flags: EPH });
      return;
    }
    if (i.user.id !== trade.buyerId && i.user.id !== trade.sellerId) {
      await i.reply({ content: "Você não faz parte desta negociação.", flags: EPH });
      return;
    }
    await i.showModal(rateCommentModal(tradeId, Number(ratingStr)));
    return;
  }

  // ---------- Avaliação: salvar nota + comentário ----------
  if (action === "ratemodal" && i.isModalSubmit()) {
    const [tradeId, ratingStr] = args;
    const trade = await getTrade(tradeId);
    if (!trade || trade.state !== "COMPLETED") {
      await i.reply({ content: "Avaliação indisponível.", flags: EPH });
      return;
    }
    const isBuyer = i.user.id === trade.buyerId;
    const isSeller = i.user.id === trade.sellerId;
    if (!isBuyer && !isSeller) {
      await i.reply({ content: "Você não faz parte desta negociação.", flags: EPH });
      return;
    }
    const rateeId = isBuyer ? trade.sellerId : trade.buyerId;
    const rateeRole = isBuyer ? TradeRole.SELLER : TradeRole.BUYER;
    const rating = Math.max(1, Math.min(5, Number(ratingStr)));
    const comment = i.fields.getTextInputValue("comment") || null;
    const res = await submitReview({ tradeId, raterId: i.user.id, rateeId, rateeRole, rating, comment });
    await i.reply({
      content: res.ok ? `✅ Avaliação de **${rating}★** registrada. Obrigado!` : `⚠️ ${res.reason}`,
      flags: EPH,
    });
    if (res.ok) {
      await refreshRanking(trade.gameId);
      // Os dois avaliaram → apaga o ticket (a conversa fica nas logs).
      if ((await reviewCount(tradeId)) >= 2 && trade.ticketChannelId) {
        const ch = await client.channels.fetch(trade.ticketChannelId).catch(() => null);
        if (ch?.isThread()) await ch.delete().catch(() => {});
        await clearTicketChannel(tradeId);
      }
    }
    return;
  }
});

export { panelMessage };
