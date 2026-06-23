import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { Game, GameServer, Listing, MarketCurrency, Trade, TradeUnit, UserReputation } from "@prisma/client";
import { buildId } from "../customId.js";
import type { MatchResult, SortMode } from "../../services/matching.js";

export const MKT = "mkt";

const CURRENCY_SYMBOL: Record<MarketCurrency, string> = { BRL: "R$", USD: "US$" };
const UNIT_WORD: Record<TradeUnit, string> = { DIAMOND: "diamantes", GOLD: "gold", ITEM: "itens", OTHER: "unidades" };

export function fmtMoney(value: number, currency: MarketCurrency): string {
  return `${CURRENCY_SYMBOL[currency]} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtQty(value: number): string {
  return value.toLocaleString("pt-BR");
}

// Quantidade em UNIDADES da base do jogo: o número digitado é multiplicado pela
// unidade base (ex.: base 1.000 → digitar "30" = 30.000). Aceita decimais (1,5 = 1500).
export function parseUnits(raw: string, baseQuantity: number): number | null {
  const n = parseFloat(raw.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const total = Math.round(n * baseQuantity);
  return total > 0 ? total : null;
}

// Formata a unidade base para rótulos (ex.: 1000 → "1.000").
function baseLabel(baseQuantity: number): string {
  return baseQuantity.toLocaleString("pt-BR");
}

// Parse de dinheiro aceitando "1,50" (BR) ou "1.50".
export function parseMoney(raw: string): number | null {
  const s = raw.trim();
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Painel fixo COMPRO/VENDO de um jogo.
export function panelMessage(game: Game) {
  const embed = new EmbedBuilder()
    .setTitle(`${game.emoji ? game.emoji + " " : ""}${game.name} — Mercado`)
    .setColor(0x2b9348)
    .setDescription(
      [
        `Compre e venda **${UNIT_WORD[game.tradeUnit]}** com outros jogadores.`,
        "",
        "🛒 **COMPRO** — receba no privado os melhores vendedores para o que procura.",
        "🏷️ **VENDO** — anuncie seu estoque e apareça para os compradores.",
      ].join("\n"),
    )
    .setFooter({ text: "Negocie com segurança. Avaliações e reputação valem ponto." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildId(MKT, "buy", game.id)).setLabel("COMPRO").setStyle(ButtonStyle.Success).setEmoji("🛒"),
    new ButtonBuilder().setCustomId(buildId(MKT, "sell", game.id)).setLabel("VENDO").setStyle(ButtonStyle.Primary).setEmoji("🏷️"),
  );
  return { embeds: [embed], components: [row] };
}

// Select de servidor (passo antes do modal). `action` = "sellsrv" | "buysrv".
export function serverSelectRow(game: Game, servers: GameServer[], action: "sellsrv" | "buysrv") {
  const select = new StringSelectMenuBuilder()
    .setCustomId(buildId(MKT, action, game.id))
    .setPlaceholder("Selecione o servidor")
    .addOptions(
      servers.slice(0, 25).map((s) => ({
        label: s.name,
        value: s.id,
        description: s.region ?? undefined,
      })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export function sellModal(game: Game, serverId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(buildId(MKT, "sellmodal", game.id, serverId))
    .setTitle(`Anunciar venda — ${game.name}`.slice(0, 45));

  const rows: ActionRowBuilder<TextInputBuilder>[] = [];
  if (game.tradeUnit === "ITEM") {
    rows.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("item").setLabel("Nome do item").setStyle(TextInputStyle.Short).setRequired(true),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("qty")
        .setLabel(`Estoque (x${baseLabel(game.baseQuantity)})`)
        .setPlaceholder(`ex.: 30 = ${(30 * game.baseQuantity).toLocaleString("pt-BR")}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("price")
        .setLabel(`Valor por 1k (${game.currency})`)
        .setPlaceholder("ex.: 2,50")
        .setStyle(TextInputStyle.Short)
        .setRequired(true),
    ),
  );
  return modal.addComponents(...rows.slice(0, 5));
}

export function buyModal(game: Game, serverId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildId(MKT, "buymodal", game.id, serverId))
    .setTitle(`Procurar — ${game.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("qty")
          .setLabel(`Procura (x${baseLabel(game.baseQuantity)})`)
          .setPlaceholder(`ex.: 20 = ${(20 * game.baseQuantity).toLocaleString("pt-BR")}`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("price")
          .setLabel(`Valor por 1k que paga (${game.currency}, opcional)`)
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
      ),
    );
}

const SORT_LABEL: Record<SortMode, string> = {
  recommended: "Recomendado",
  price: "Melhor preço",
  trust: "Mais confiável",
  fast: "Entrega rápida",
};

function vipBadge(tier: MatchResult["vipTier"]): string {
  if (tier === "KICK") return "⭐ Apoiador";
  if (tier === "NITRO") return "💜 Booster";
  return "";
}

function ratingBadge(r: MatchResult): string {
  if (r.ratingCount === 0) return "sem avaliações";
  return `⭐ ${r.ratingAvg!.toFixed(1)} (${r.ratingCount})`;
}

// Embed + botões de ordenação dos resultados do COMPRO.
export function resultsMessage(
  game: Game,
  server: GameServer,
  quantity: number,
  results: MatchResult[],
  sort: SortMode,
) {
  const embed = new EmbedBuilder()
    .setColor(0x2b9348)
    .setTitle(`🛒 Melhores vendedores — ${game.name}`)
    .setDescription(
      `Servidor **${server.name}** · procurando **${fmtQty(quantity)}** · ordenado por **${SORT_LABEL[sort]}**`,
    );

  if (results.length === 0) {
    embed.addFields({ name: "Nenhum vendedor encontrado", value: "Tente outro servidor ou volte mais tarde." });
    return { embeds: [embed], components: [] };
  }

  if (!results[0].enoughStock) {
    embed.addFields({
      name: "⚠️ Ninguém tem o total pedido",
      value: "Mostrando os vendedores com **mais estoque** disponível.",
    });
  }

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  results.forEach((r, idx) => {
    const badges = [vipBadge(r.vipTier), ratingBadge(r)].filter(Boolean).join(" · ");
    embed.addFields({
      name: `${medals[idx] ?? `${idx + 1}.`} <@${r.sellerId}>`,
      value: [
        `Estoque: **${fmtQty(r.listing.quantityAvailable)}**${r.listing.itemName ? ` · ${r.listing.itemName}` : ""}`,
        `Preço/1k: **${fmtMoney(Number(r.listing.pricePer1k), r.listing.currency)}**`,
        badges,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  });

  const negoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    results.map((r, idx) =>
      new ButtonBuilder()
        .setCustomId(buildId(MKT, "nego", r.listing.id, quantity))
        .setLabel(`Negociar ${idx + 1}`)
        .setEmoji("🤝")
        .setStyle(ButtonStyle.Success),
    ),
  );

  const modes: SortMode[] = ["recommended", "price", "trust", "fast"];
  const sortRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    modes.map((m) =>
      new ButtonBuilder()
        .setCustomId(buildId(MKT, "sort", game.id, server.id, quantity, m))
        .setLabel(SORT_LABEL[m])
        .setStyle(m === sort ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );
  const pubRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildId(MKT, "pubbuy", game.id, server.id))
      .setLabel("Publicar pedido de compra")
      .setEmoji("📢")
      .setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [negoRow, sortRow, pubRow] };
}

// Modal para publicar um pedido de compra no canal de anúncios.
export function buyPublishModal(gameId: string, serverId: string, game: Game): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildId(MKT, "pubbuymodal", gameId, serverId))
    .setTitle(`Publicar pedido — ${game.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("qty")
          .setLabel(`Procura (x${baseLabel(game.baseQuantity)})`)
          .setPlaceholder(`ex.: 20 = ${(20 * game.baseQuantity).toLocaleString("pt-BR")}`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("price")
          .setLabel(`Valor por 1k que paga (${game.currency})`)
          .setPlaceholder("ex.: 2,50")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
}

// Modal de quantidade ao negociar a partir de um card no canal de anúncios.
export function cardNegoModal(listingId: string, baseQuantity: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildId(MKT, "cardnegomodal", listingId))
    .setTitle("Negociar")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("qty")
          .setLabel(`Quantidade (x${baseLabel(baseQuantity)})`)
          .setPlaceholder(`ex.: 5 = ${(5 * baseQuantity).toLocaleString("pt-BR")}`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
}

// Card de um anúncio de VENDA no canal anúncios-de-venda.
export function sellCardMessage(listing: Listing, game: Game, serverName: string) {
  const embed = new EmbedBuilder()
    .setColor(0x2b9348)
    .setAuthor({ name: "🏷️ Anúncio de venda" })
    .setDescription(
      [
        `**Vendedor:** <@${listing.userId}>`,
        `**Servidor:** ${serverName}${listing.itemName ? ` · ${listing.itemName}` : ""}`,
        `**Estoque:** ${fmtQty(listing.quantityAvailable)}`,
        `**Preço/1k:** ${fmtMoney(Number(listing.pricePer1k), listing.currency)}`,
      ].join("\n"),
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildId(MKT, "cardnego", listing.id)).setLabel("Negociar").setEmoji("🤝").setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

// Card de um pedido de COMPRA no canal anúncios-de-compra (com botão de oferta).
export function buyCardMessage(listing: Listing, game: Game, serverName: string) {
  const embed = new EmbedBuilder()
    .setColor(0x4361ee)
    .setAuthor({ name: "🛒 Pedido de compra" })
    .setDescription(
      [
        `**Comprador:** <@${listing.userId}>`,
        `**Servidor:** ${serverName}${listing.itemName ? ` · ${listing.itemName}` : ""}`,
        `**Procura:** ${fmtQty(listing.quantityAvailable)}`,
        `**Paga até:** ${fmtMoney(Number(listing.pricePer1k), listing.currency)}/1k`,
        "",
        "_Tem o que ele procura? Clique em **Vender para ele**._",
      ].join("\n"),
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildId(MKT, "cardnego", listing.id)).setLabel("Vender para ele").setEmoji("🤝").setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

interface RankingEntry {
  userId: string;
  ratingSum: number;
  ratingCount: number;
  completedTrades: number;
  activeListings: number;
}

export function gameRankingMessage(game: Game, entries: RankingEntry[]) {
  const embed = new EmbedBuilder().setTitle(`🏆 Ranking — ${game.name}`).setColor(0xf1c40f);
  if (entries.length === 0) {
    embed.setDescription("Ainda não há vendedores ativos neste jogo.");
    return { embeds: [embed] };
  }
  const medals = ["🥇", "🥈", "🥉"];
  embed.setDescription(
    entries
      .map((e, idx) => {
        const rating = e.ratingCount > 0 ? `⭐ ${(e.ratingSum / e.ratingCount).toFixed(1)} (${e.ratingCount})` : "sem avaliações";
        return `${medals[idx] ?? `**${idx + 1}.**`} <@${e.userId}> — ${rating} · ${e.completedTrades} concluída(s) · ${e.activeListings} anúncio(s) ativo(s)`;
      })
      .join("\n"),
  );
  embed.setFooter({ text: "Atualizado automaticamente." });
  return { embeds: [embed] };
}

// ---- Gerência de anúncios (/anuncios) ----

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "🟢 ativo",
  PAUSED: "⏸️ pausado",
  EXPIRED: "⌛ expirado",
  CLOSED: "🔒 encerrado",
};

export function myListingsMessage(listings: (Listing & { game?: Game; server?: GameServer })[]) {
  const embed = new EmbedBuilder().setTitle("📋 Meus anúncios").setColor(0x5865f2);
  if (listings.length === 0) {
    embed.setDescription("Você não tem anúncios ativos.");
    return { embeds: [embed], components: [] };
  }
  embed.setDescription(
    listings
      .map(
        (l, idx) =>
          `**${idx + 1}.** ${l.type === "SELL" ? "🏷️ Venda" : "🛒 Compra"} · ${STATUS_BADGE[l.status] ?? l.status}\n` +
          `Estoque **${fmtQty(l.quantityAvailable)}** · ${fmtMoney(Number(l.pricePer1k), l.currency)}/1k`,
      )
      .join("\n\n"),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(buildId(MKT, "mylist"))
    .setPlaceholder("Gerenciar um anúncio…")
    .addOptions(
      listings.slice(0, 25).map((l, idx) => ({
        label: `${idx + 1}. ${l.type === "SELL" ? "Venda" : "Compra"} — ${fmtQty(l.quantityAvailable)}`.slice(0, 100),
        value: l.id,
        description: `${fmtMoney(Number(l.pricePer1k), l.currency)}/1k · ${STATUS_BADGE[l.status] ?? l.status}`.slice(0, 100),
      })),
    );
  return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] };
}

export function listingMgmtMessage(listing: Listing) {
  const embed = new EmbedBuilder()
    .setTitle(`Gerenciar anúncio — ${listing.type === "SELL" ? "Venda" : "Compra"}`)
    .setColor(0x5865f2)
    .setDescription(
      [
        `Status: **${STATUS_BADGE[listing.status] ?? listing.status}**`,
        `Estoque disponível: **${fmtQty(listing.quantityAvailable)}** / ${fmtQty(listing.quantityTotal)}`,
        `Preço/1k: **${fmtMoney(Number(listing.pricePer1k), listing.currency)}**`,
        listing.expiresAt ? `Expira: <t:${Math.floor(listing.expiresAt.getTime() / 1000)}:R>` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildId(MKT, "lstock", listing.id)).setLabel("Atualizar estoque").setStyle(ButtonStyle.Primary).setEmoji("📦"),
    new ButtonBuilder().setCustomId(buildId(MKT, "lrenew", listing.id)).setLabel("Renovar").setStyle(ButtonStyle.Success).setEmoji("🔄"),
    new ButtonBuilder()
      .setCustomId(buildId(MKT, "lpause", listing.id))
      .setLabel(listing.status === "PAUSED" ? "Reativar" : "Pausar")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(listing.status === "PAUSED" ? "▶️" : "⏸️"),
    new ButtonBuilder().setCustomId(buildId(MKT, "lclose", listing.id)).setLabel("Encerrar").setStyle(ButtonStyle.Danger).setEmoji("🔒"),
  );
  return { embeds: [embed], components: [row] };
}

// ---- Negociação (Fase 3) ----

// Solicitação enviada ao DONO do anúncio (DM ou canal), com Aceitar/Recusar.
export function requestMessage(trade: Trade, game: Game, serverName: string, itemName: string | null, ownerId: string) {
  const initiatorId = trade.buyerId === ownerId ? trade.sellerId : trade.buyerId;
  const ownerIsSeller = trade.sellerId === ownerId;
  const embed = new EmbedBuilder()
    .setTitle("🤝 Nova solicitação de negociação")
    .setColor(0xf9c74f)
    .setDescription(
      [
        `**De:** <@${initiatorId}>`,
        `**Jogo:** ${game.name} · **Servidor:** ${serverName}`,
        `**Quantidade:** ${fmtQty(trade.quantity)}${itemName ? ` · ${itemName}` : ""}`,
        `**Preço/1k:** ${fmtMoney(Number(trade.pricePer1k), trade.currency)}`,
        "",
        ownerIsSeller
          ? "Ao **aceitar**, seu estoque é reservado e abrimos um ticket privado."
          : "Ao **aceitar**, abrimos um ticket privado para combinarem a entrega.",
      ].join("\n"),
    )
    .setFooter({ text: "Aceite confirma que a negociação existe — depois disso você não nega que ela aconteceu." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildId(MKT, "accept", trade.id)).setLabel("Aceitar").setStyle(ButtonStyle.Success).setEmoji("✅"),
    new ButtonBuilder().setCustomId(buildId(MKT, "refuse", trade.id)).setLabel("Recusar").setStyle(ButtonStyle.Danger).setEmoji("✖️"),
  );
  return { content: `<@${ownerId}>`, embeds: [embed], components: [row] };
}

function infoEmbed(title: string, desc: string, color: number) {
  return { embeds: [new EmbedBuilder().setTitle(title).setColor(color).setDescription(desc)], components: [] };
}

// DM ao vendedor quando o estoque do anúncio esgota numa venda.
export function restockReminder(listing: Listing, game: Game, serverName: string) {
  const what = listing.itemName ? `**${listing.itemName}**` : `**${game.name}**`;
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("📦 Seu estoque acabou!")
        .setColor(0x2b9348)
        .setDescription(
          [
            `Parabéns pela venda! 🎉 Seu anúncio de ${what} (servidor **${serverName}**) foi **totalmente vendido** e encerrado automaticamente.`,
            "",
            "**Quer continuar vendendo?**",
            "• Reabra um anúncio pelo painel **🏷️ VENDO** no canal de negociação.",
            "• Gerencie tudo em `/anuncios`.",
            "",
            "💎 Vendedores **VIP** (Kick/Booster) aparecem no topo e vendem mais rápido — fale com a staff.",
          ].join("\n"),
        )
        .setFooter({ text: `${game.name} · reputação mantida` }),
    ],
  };
}

export function requestAcceptedMessage(threadId: string) {
  return infoEmbed("✅ Negociação aceita", `Estoque reservado. Ticket aberto em <#${threadId}>.`, 0x2b9348);
}

export function requestRefusedMessage() {
  return infoEmbed("✖️ Negociação recusada", "O vendedor recusou esta solicitação.", 0xe63946);
}

// Mensagem do ticket privado com o estado da conclusão e os botões de ação.
export function ticketMessage(trade: Trade, game: Game, serverName: string) {
  const check = (done: boolean) => (done ? "✅" : "⬜");
  const embed = new EmbedBuilder()
    .setTitle("🧾 Negociação em andamento")
    .setColor(0x4361ee)
    .setDescription(
      [
        `**Comprador:** <@${trade.buyerId}> · **Vendedor:** <@${trade.sellerId}>`,
        `**Jogo:** ${game.name} · **Servidor:** ${serverName}`,
        `**Quantidade:** ${fmtQty(trade.quantity)} · **Preço/1k:** ${fmtMoney(Number(trade.pricePer1k), trade.currency)}`,
        "",
        "Combinem a entrega por aqui. Quando concluírem, **os dois** clicam em **Concluir**.",
        "",
        `${check(trade.buyerCompleted)} Comprador confirmou · ${check(trade.sellerCompleted)} Vendedor confirmou`,
      ].join("\n"),
    )
    .setFooter({ text: "A avaliação abre quando os dois confirmarem a conclusão." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildId(MKT, "complete", trade.id)).setLabel("Concluir").setStyle(ButtonStyle.Success).setEmoji("✅"),
    new ButtonBuilder().setCustomId(buildId(MKT, "cancel", trade.id)).setLabel("Cancelar").setStyle(ButtonStyle.Secondary).setEmoji("🚫"),
    new ButtonBuilder().setCustomId(buildId(MKT, "dispute", trade.id)).setLabel("Abrir disputa").setStyle(ButtonStyle.Danger).setEmoji("⚠️"),
  );
  return { embeds: [embed], components: [row] };
}

export function ticketCompletedMessage(tradeId: string) {
  const embed = new EmbedBuilder()
    .setTitle("🎉 Negociação concluída")
    .setColor(0x2b9348)
    .setDescription("Os dois lados confirmaram. Obrigado!\n\n**Avalie o outro lado** (clique nas estrelas):");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    [1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder().setCustomId(buildId(MKT, "rate", tradeId, n)).setLabel(String(n)).setEmoji("⭐").setStyle(ButtonStyle.Secondary),
    ),
  );
  return { embeds: [embed], components: [row] };
}

export function rateCommentModal(tradeId: string, rating: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildId(MKT, "ratemodal", tradeId, rating))
    .setTitle(`Avaliação — ${rating}★`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("comment")
          .setLabel("Comentário (opcional)")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setRequired(false),
      ),
    );
}

export function ticketCancelledMessage(reason: string) {
  return infoEmbed("🚫 Negociação cancelada", `Motivo: ${reason}. O estoque reservado foi devolvido.`, 0x6c757d);
}

export function ticketDisputedMessage() {
  return infoEmbed(
    "⚠️ Disputa aberta",
    "A equipe foi acionada e vai analisar o caso. O estoque permanece reservado até a resolução.",
    0xe63946,
  );
}

export function disputeAlert(trade: Trade, game: Game) {
  const embed = new EmbedBuilder()
    .setTitle("⚠️ Nova disputa")
    .setColor(0xe63946)
    .setDescription(
      [
        `**Negociação:** \`${trade.id}\``,
        `**Comprador:** <@${trade.buyerId}> · **Vendedor:** <@${trade.sellerId}>`,
        `**Jogo:** ${game.name}`,
        `**Quantidade:** ${fmtQty(trade.quantity)} · **Preço/1k:** ${fmtMoney(Number(trade.pricePer1k), trade.currency)}`,
        trade.ticketChannelId ? `**Ticket:** <#${trade.ticketChannelId}>` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  return { embeds: [embed] };
}

// ---- Ranking e perfil de reputação (Fase 4) ----

function avgOf(rep: UserReputation | null): string {
  if (!rep || rep.ratingCount === 0) return "sem avaliações";
  return `⭐ ${(rep.ratingSum / rep.ratingCount).toFixed(1)} (${rep.ratingCount})`;
}

export function rankingEmbed(rows: UserReputation[]) {
  const embed = new EmbedBuilder().setTitle("🏆 Ranking de vendedores").setColor(0xf1c40f);
  if (rows.length === 0) {
    embed.setDescription("Ainda não há vendedores avaliados.");
    return { embeds: [embed] };
  }
  const medals = ["🥇", "🥈", "🥉"];
  embed.setDescription(
    rows
      .map(
        (r, idx) =>
          `${medals[idx] ?? `**${idx + 1}.**`} <@${r.userId}> — ${avgOf(r)} · ${r.completedTrades} concluída(s)`,
      )
      .join("\n"),
  );
  return { embeds: [embed] };
}

export function reputationEmbed(userId: string, seller: UserReputation | null, buyer: UserReputation | null) {
  const line = (rep: UserReputation | null) =>
    rep
      ? `${avgOf(rep)}\nConcluídas: **${rep.completedTrades}** · Canceladas: **${rep.cancelledTrades}** · Disputas: **${rep.disputes}**`
      : "sem histórico";
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("📇 Reputação")
        .setColor(0x4361ee)
        .setDescription(`<@${userId}>`)
        .addFields(
          { name: "🏷️ Como vendedor", value: line(seller) },
          { name: "🛒 Como comprador", value: line(buyer) },
        ),
    ],
  };
}

export function stockModal(listingId: string, current: number, baseQuantity: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(buildId(MKT, "lstockmodal", listingId))
    .setTitle("Atualizar estoque")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("qty")
          .setLabel(`Novo estoque (x${baseLabel(baseQuantity)})`)
          .setPlaceholder(`ex.: 30 = ${(30 * baseQuantity).toLocaleString("pt-BR")}`)
          .setStyle(TextInputStyle.Short)
          .setValue(String(current / baseQuantity))
          .setRequired(true),
      ),
    );
}
