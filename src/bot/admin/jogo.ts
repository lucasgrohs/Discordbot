import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  AutocompleteInteraction,
} from "discord.js";
import { registerCommand } from "../router.js";
import { logAction } from "../../services/audit.js";
import {
  listGames,
  getGame,
  searchGames,
  createGame,
  updateGame,
  deleteGame,
} from "../../services/games.js";
import { MarketCurrency, MarketStatus, TradeUnit } from "@prisma/client";
import { provisionGameChannels } from "../market/board.js";
import {
  EPHEMERAL,
  requireGuild,
  UNIT_LABEL,
  STATUS_LABEL,
  UNIT_CHOICES,
  CURRENCY_CHOICES,
  STATUS_CHOICES,
} from "./shared.js";

registerCommand({
  data: new SlashCommandBuilder()
    .setName("jogo")
    .setDescription("Gerencia os jogos do marketplace (admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("criar")
        .setDescription("Cadastra um novo jogo.")
        .addStringOption((o) => o.setName("nome").setDescription("Nome do jogo").setRequired(true))
        .addStringOption((o) =>
          o.setName("unidade").setDescription("O que é comercializado").setRequired(true).addChoices(...UNIT_CHOICES),
        )
        .addStringOption((o) => o.setName("moeda").setDescription("Moeda (padrão BRL)").addChoices(...CURRENCY_CHOICES))
        .addIntegerOption((o) =>
          o.setName("quantidade_base").setDescription("Base de referência (100 / 1.000 / 1.000.000)").setMinValue(1),
        )
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji do jogo")),
    )
    .addSubcommand((s) => s.setName("listar").setDescription("Lista os jogos cadastrados."))
    .addSubcommand((s) =>
      s
        .setName("canal")
        .setDescription("Define o canal do painel COMPRO/VENDO do jogo.")
        .addStringOption((o) => o.setName("jogo").setDescription("Jogo").setRequired(true).setAutocomplete(true))
        .addChannelOption((o) =>
          o.setName("canal").setDescription("Canal de texto").addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("editar")
        .setDescription("Edita os atributos de um jogo.")
        .addStringOption((o) => o.setName("jogo").setDescription("Jogo").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("nome").setDescription("Novo nome"))
        .addStringOption((o) => o.setName("unidade").setDescription("Unidade").addChoices(...UNIT_CHOICES))
        .addStringOption((o) => o.setName("moeda").setDescription("Moeda").addChoices(...CURRENCY_CHOICES))
        .addIntegerOption((o) => o.setName("quantidade_base").setDescription("Base de referência").setMinValue(1))
        .addIntegerOption((o) =>
          o.setName("ttl_horas").setDescription("Expiração padrão dos anúncios (horas)").setMinValue(1),
        )
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji"))
        .addStringOption((o) => o.setName("aviso_risco").setDescription("Aviso de risco do jogo")),
    )
    .addSubcommand((s) =>
      s
        .setName("status")
        .setDescription("Liga/desliga o marketplace do jogo e define o status.")
        .addStringOption((o) => o.setName("jogo").setDescription("Jogo").setRequired(true).setAutocomplete(true))
        .addBooleanOption((o) => o.setName("marketplace").setDescription("Habilitar o marketplace deste jogo?"))
        .addStringOption((o) => o.setName("situacao").setDescription("Situação").addChoices(...STATUS_CHOICES)),
    )
    .addSubcommand((s) =>
      s
        .setName("salas")
        .setDescription("Cria a categoria e as salas do jogo (negocie, anúncios, ranking, chat).")
        .addStringOption((o) => o.setName("jogo").setDescription("Jogo").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remover")
        .setDescription("Remove um jogo (e seus servidores/anúncios).")
        .addStringOption((o) => o.setName("jogo").setDescription("Jogo").setRequired(true).setAutocomplete(true))
        .addBooleanOption((o) => o.setName("confirmar").setDescription("Confirma a remoção").setRequired(true)),
    ),

  async autocomplete(i: AutocompleteInteraction) {
    const focused = i.options.getFocused(true);
    if (focused.name !== "jogo") return i.respond([]);
    const games = await searchGames(focused.value);
    await i.respond(games.map((g) => ({ name: `${g.emoji ? g.emoji + " " : ""}${g.name}`, value: g.id })));
  },

  async execute(i) {
    const guildId = await requireGuild(i);
    if (!guildId) return;
    const sub = i.options.getSubcommand();

    if (sub === "criar") {
      const name = i.options.getString("nome", true);
      const game = await createGame({
        name,
        tradeUnit: i.options.getString("unidade", true) as TradeUnit,
        currency: (i.options.getString("moeda") as MarketCurrency) ?? undefined,
        baseQuantity: i.options.getInteger("quantidade_base") ?? undefined,
        emoji: i.options.getString("emoji"),
      });
      await logAction({ guildId, actorId: i.user.id, action: "game.create", target: game.slug });
      await i.reply({
        content: `✅ Jogo **${game.name}** criado (slug \`${game.slug}\`). Use \`/jogo canal\` para definir onde o painel será publicado e \`/jogo status\` para habilitar o marketplace.`,
        flags: EPHEMERAL,
      });
      return;
    }

    if (sub === "listar") {
      const games = await listGames();
      if (games.length === 0) {
        await i.reply({ content: "Nenhum jogo cadastrado. Use `/jogo criar`.", flags: EPHEMERAL });
        return;
      }
      const embed = new EmbedBuilder().setTitle("🎮 Jogos cadastrados").setColor(0x5865f2);
      for (const g of games) {
        embed.addFields({
          name: `${g.emoji ? g.emoji + " " : ""}${g.name}  ·  \`${g.slug}\``,
          value: [
            `Unidade: **${UNIT_LABEL[g.tradeUnit]}** · Base: **${g.baseQuantity.toLocaleString("pt-BR")}** · Moeda: **${g.currency}**`,
            `Marketplace: **${g.marketplaceEnabled ? "ligado" : "desligado"}** (${STATUS_LABEL[g.marketStatus]})`,
            `Canal: ${g.channelId ? `<#${g.channelId}>` : "_não definido_"} · TTL anúncio: **${g.listingTtlHours}h**`,
          ].join("\n"),
        });
      }
      await i.reply({ embeds: [embed], flags: EPHEMERAL });
      return;
    }

    if (sub === "canal") {
      const gameId = i.options.getString("jogo", true);
      const game = await getGame(gameId);
      if (!game) {
        await i.reply({ content: "Jogo não encontrado.", flags: EPHEMERAL });
        return;
      }
      const channel = i.options.getChannel("canal", true);
      await updateGame(gameId, { channelId: channel.id });
      await logAction({ guildId, actorId: i.user.id, action: "game.channel", target: game.slug, details: channel.id });
      await i.reply({ content: `✅ Canal do **${game.name}** definido para <#${channel.id}>.`, flags: EPHEMERAL });
      return;
    }

    if (sub === "editar") {
      const gameId = i.options.getString("jogo", true);
      const game = await getGame(gameId);
      if (!game) {
        await i.reply({ content: "Jogo não encontrado.", flags: EPHEMERAL });
        return;
      }
      const patch = {
        name: i.options.getString("nome") ?? undefined,
        tradeUnit: (i.options.getString("unidade") as TradeUnit) ?? undefined,
        currency: (i.options.getString("moeda") as MarketCurrency) ?? undefined,
        baseQuantity: i.options.getInteger("quantidade_base") ?? undefined,
        listingTtlHours: i.options.getInteger("ttl_horas") ?? undefined,
        emoji: i.options.getString("emoji") ?? undefined,
        riskNotice: i.options.getString("aviso_risco") ?? undefined,
      };
      if (Object.values(patch).every((v) => v === undefined)) {
        await i.reply({ content: "Informe pelo menos um campo para editar.", flags: EPHEMERAL });
        return;
      }
      const updated = await updateGame(gameId, patch);
      await logAction({ guildId, actorId: i.user.id, action: "game.edit", target: updated.slug });
      await i.reply({ content: `✅ **${updated.name}** atualizado.`, flags: EPHEMERAL });
      return;
    }

    if (sub === "status") {
      const gameId = i.options.getString("jogo", true);
      const game = await getGame(gameId);
      if (!game) {
        await i.reply({ content: "Jogo não encontrado.", flags: EPHEMERAL });
        return;
      }
      const enabled = i.options.getBoolean("marketplace");
      const situacao = i.options.getString("situacao") as MarketStatus | null;
      if (enabled === null && situacao === null) {
        await i.reply({ content: "Informe `marketplace` e/ou `situacao`.", flags: EPHEMERAL });
        return;
      }
      const updated = await updateGame(gameId, {
        marketplaceEnabled: enabled ?? undefined,
        marketStatus: situacao ?? undefined,
      });
      await logAction({ guildId, actorId: i.user.id, action: "game.status", target: updated.slug });
      await i.reply({
        content: `✅ **${updated.name}**: marketplace **${updated.marketplaceEnabled ? "ligado" : "desligado"}** (${STATUS_LABEL[updated.marketStatus]}).`,
        flags: EPHEMERAL,
      });
      return;
    }

    if (sub === "salas") {
      const game = await getGame(i.options.getString("jogo", true));
      if (!game) {
        await i.reply({ content: "Jogo não encontrado.", flags: EPHEMERAL });
        return;
      }
      if (!i.guild) {
        await i.reply({ content: "Use dentro de um servidor.", flags: EPHEMERAL });
        return;
      }
      await i.deferReply({ flags: EPHEMERAL });
      try {
        const updated = await provisionGameChannels(i.guild, game);
        await logAction({ guildId: i.guild.id, actorId: i.user.id, action: "game.channels", target: updated.slug });
        await i.editReply({
          content: [
            `✅ Salas de **${updated.name}** prontas:`,
            `• Negocie: <#${updated.channelId}>`,
            `• Anúncios de venda: <#${updated.sellChannelId}>`,
            `• Anúncios de compra: <#${updated.buyChannelId}>`,
            `• Ranking: <#${updated.rankingChannelId}>`,
            `• Chat livre: <#${updated.chatChannelId}>`,
          ].join("\n"),
        });
      } catch (err) {
        console.error("[jogo salas]", err);
        await i.editReply(
          "❌ Não consegui criar as salas. Confira se o bot tem a permissão **Gerenciar Canais**.",
        );
      }
      return;
    }

    if (sub === "remover") {
      const gameId = i.options.getString("jogo", true);
      if (!i.options.getBoolean("confirmar", true)) {
        await i.reply({ content: "Remoção cancelada (marque `confirmar` como verdadeiro).", flags: EPHEMERAL });
        return;
      }
      const game = await getGame(gameId);
      if (!game) {
        await i.reply({ content: "Jogo não encontrado.", flags: EPHEMERAL });
        return;
      }
      await deleteGame(gameId);
      await logAction({ guildId, actorId: i.user.id, action: "game.remove", target: game.slug });
      await i.reply({ content: `🗑️ Jogo **${game.name}** removido.`, flags: EPHEMERAL });
      return;
    }
  },
});
