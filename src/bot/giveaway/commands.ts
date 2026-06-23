import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
  TextChannel,
} from "discord.js";
import { registerCommand } from "../router.js";
import { client } from "../client.js";
import { onInviteCreate } from "./invites.js";
import {
  provisionGiveawayChannels,
  refreshGiveawayRanking,
  postWinnersRecord,
  clearGiveawayActive,
  clearGiveawayGuests,
  revokeGiveawayInvites,
} from "./board.js";
import { giveawayKickoffMessage } from "./render.js";
import { handleMyInvite, handleRanking, handleStatus } from "./actions.js";
import { getGuildConfig } from "../../services/guildConfig.js";
import {
  createGiveaway,
  getActiveGiveaway,
  getLatestGiveaway,
  endGiveaway,
  findReferralCode,
  createReferralCode,
  updateReferralCode,
  topReferrers,
  entryStats,
  drawWinners,
} from "../../services/giveaways.js";
import { GiveawayMode } from "@prisma/client";

const EPH = MessageFlags.Ephemeral;

const MODE_CHOICES = [
  { name: "Top 1 (mais indicações)", value: GiveawayMode.TOP1 },
  { name: "Top 3", value: GiveawayMode.TOP3 },
  { name: "Top 10", value: GiveawayMode.TOP10 },
  { name: "Sorteio aleatório (ponderado)", value: GiveawayMode.RANDOM_VALID },
  { name: "Aleatório entre o Top 30", value: GiveawayMode.TOP30_RANDOM },
  { name: "Misto (Top 1 + aleatório)", value: GiveawayMode.MIXED },
];

// ---------------- /sorteio (admin) ----------------
registerCommand({
  data: new SlashCommandBuilder()
    .setName("sorteio")
    .setDescription("Gerencia o sorteio por indicação (admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("salas")
        .setDescription("Cria a categoria 🎉 Sorteios (sorteios-ativos, ranking, ganhadores)."),
    )
    .addSubcommand((s) =>
      s
        .setName("criar")
        .setDescription("Inicia um novo sorteio por indicação (use /sorteio salas antes).")
        .addStringOption((o) => o.setName("titulo").setDescription("Título do sorteio").setRequired(true))
        .addStringOption((o) => o.setName("modo").setDescription("Como escolher o vencedor").addChoices(...MODE_CHOICES))
        .addIntegerOption((o) => o.setName("dias_conta").setDescription("Idade mínima da conta (dias)").setMinValue(0))
        .addIntegerOption((o) => o.setName("dias_permanencia").setDescription("Permanência mínima (dias)").setMinValue(0)),
    )
    .addSubcommand((s) => s.setName("encerrar").setDescription("Encerra o sorteio ativo."))
    .addSubcommand((s) => s.setName("vencedor").setDescription("Sorteia e anuncia o(s) vencedor(es)."))
    .addSubcommand((s) => s.setName("status").setDescription("Mostra o estado do sorteio atual.")),

  async execute(i) {
    if (!i.guildId) return;
    const sub = i.options.getSubcommand();

    if (sub === "salas") {
      if (!i.guild) {
        await i.reply({ content: "Use dentro de um servidor.", flags: EPH });
        return;
      }
      await i.deferReply({ flags: EPH });
      try {
        const ch = await provisionGiveawayChannels(i.guild);
        await i.editReply(
          [
            "✅ Categoria **🎉 Sorteios** pronta:",
            `• Sorteios ativos: <#${ch.activeId}>`,
            `• Convidados: <#${ch.guestsId}>`,
            `• Ranking: <#${ch.rankingId}>`,
            `• Ganhadores: <#${ch.winnersId}>`,
            "",
            "Agora use `/sorteio criar` para iniciar um sorteio.",
          ].join("\n"),
        );
      } catch (err) {
        console.error("[sorteio salas]", err);
        await i.editReply("❌ Não consegui criar as salas. Confira a permissão **Gerenciar Canais** do bot.");
      }
      return;
    }

    if (sub === "criar") {
      const active = await getActiveGiveaway(i.guildId);
      if (active) {
        await i.reply({ content: "Já existe um sorteio ativo. Encerre-o antes com `/sorteio encerrar`.", flags: EPH });
        return;
      }
      const cfg = await getGuildConfig(i.guildId);
      if (!cfg.giveawayActiveChannelId) {
        await i.reply({ content: "Rode **`/sorteio salas`** primeiro para criar a categoria do sorteio.", flags: EPH });
        return;
      }
      const giveaway = await createGiveaway({
        guildId: i.guildId,
        title: i.options.getString("titulo", true),
        channelId: cfg.giveawayActiveChannelId,
        mode: (i.options.getString("modo") as GiveawayMode) ?? undefined,
        minAccountAgeDays: i.options.getInteger("dias_conta") ?? undefined,
        minStayDays: i.options.getInteger("dias_permanencia") ?? undefined,
      });
      await clearGiveawayActive(i.guildId);
      const ch = await client.channels.fetch(cfg.giveawayActiveChannelId).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) await ch.send(giveawayKickoffMessage(giveaway));
      await refreshGiveawayRanking(i.guildId);
      await i.reply({ content: `✅ Sorteio **${giveaway.title}** iniciado em <#${cfg.giveawayActiveChannelId}>.`, flags: EPH });
      return;
    }

    if (sub === "encerrar") {
      const active = await getActiveGiveaway(i.guildId);
      if (!active) {
        await i.reply({ content: "Não há sorteio ativo.", flags: EPH });
        return;
      }
      await endGiveaway(active.id);
      if (i.guild) await revokeGiveawayInvites(i.guild, active.id);
      await clearGiveawayActive(i.guildId);
      await clearGiveawayGuests(i.guildId);
      await refreshGiveawayRanking(i.guildId);
      await i.reply({ content: `🔒 Sorteio **${active.title}** encerrado. Use \`/sorteio vencedor\` para sortear.`, flags: EPH });
      return;
    }

    if (sub === "vencedor") {
      const giveaway = (await getActiveGiveaway(i.guildId)) ?? (await getLatestGiveaway(i.guildId));
      if (!giveaway) {
        await i.reply({ content: "Nenhum sorteio encontrado.", flags: EPH });
        return;
      }
      const winners = await drawWinners(giveaway.id);
      if (winners.length === 0) {
        await i.reply({ content: "Não há indicações válidas para sortear.", flags: EPH });
        return;
      }
      await postWinnersRecord(i.guildId, giveaway, winners);
      const mention = winners.map((w) => `<@${w}>`).join(", ");
      await i.reply({ content: `✅ Vencedor(es): ${mention} (registrado em ganhadores).`, flags: EPH });
      return;
    }

    if (sub === "status") {
      await handleStatus(i);
      return;
    }
  },
});

// ---------------- /meu-convite ----------------
registerCommand({
  data: new SlashCommandBuilder().setName("meu-convite").setDescription("Pega seu link de convite exclusivo do sorteio."),
  async execute(i) {
    await handleMyInvite(i);
  },
});

// ---------------- /ranksorteio ----------------
registerCommand({
  data: new SlashCommandBuilder().setName("ranksorteio").setDescription("Top 10 de quem mais indicou no sorteio."),
  async execute(i) {
    await handleRanking(i);
  },
});
