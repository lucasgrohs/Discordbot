import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } from "discord.js";
import { registerCommand } from "../router.js";
import { logAction } from "../../services/audit.js";
import { grantVip, revokeVip, syncAllBoosters, getActiveVips } from "../../services/vip.js";
import { VipTier } from "@prisma/client";

const EPH = MessageFlags.Ephemeral;

const TIER_CHOICES = [
  { name: "Tier 1 (Kick)", value: VipTier.KICK },
  { name: "Tier 2 (Booster/Nitro)", value: VipTier.NITRO },
];
const TIER_LABEL: Record<VipTier, string> = { KICK: "Tier 1 (Kick)", NITRO: "Tier 2 (Booster)" };

registerCommand({
  data: new SlashCommandBuilder()
    .setName("vip")
    .setDescription("Gerencia os selos VIP (admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("conceder")
        .setDescription("Concede um selo VIP a um usuário.")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem recebe").setRequired(true))
        .addStringOption((o) => o.setName("tier").setDescription("Nível").setRequired(true).addChoices(...TIER_CHOICES))
        .addIntegerOption((o) => o.setName("dias").setDescription("Validade em dias (vazio = sem expirar)").setMinValue(1)),
    )
    .addSubcommand((s) =>
      s
        .setName("remover")
        .setDescription("Remove um selo VIP de um usuário.")
        .addUserOption((o) => o.setName("usuario").setDescription("Quem perde").setRequired(true))
        .addStringOption((o) => o.setName("tier").setDescription("Nível").setRequired(true).addChoices(...TIER_CHOICES)),
    )
    .addSubcommand((s) =>
      s.setName("sincronizar").setDescription("Concede Tier 2 a todos os Boosters atuais do servidor."),
    )
    .addSubcommand((s) =>
      s
        .setName("ver")
        .setDescription("Mostra os selos VIP de um usuário.")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário (padrão: você)")),
    ),

  async execute(i) {
    if (!i.guild) {
      await i.reply({ content: "Use dentro de um servidor.", flags: EPH });
      return;
    }
    const sub = i.options.getSubcommand();

    if (sub === "conceder") {
      const user = i.options.getUser("usuario", true);
      const tier = i.options.getString("tier", true) as VipTier;
      const dias = i.options.getInteger("dias");
      const expiresAt = dias ? new Date(Date.now() + dias * 86400000) : null;
      await grantVip(i.guild, user.id, tier, "manual", expiresAt);
      await logAction({ guildId: i.guild.id, actorId: i.user.id, action: "vip.grant", target: user.id, details: tier });
      await i.reply({
        content: `✅ <@${user.id}> agora é **${TIER_LABEL[tier]}**${dias ? ` por **${dias} dia(s)**` : ""}.`,
        flags: EPH,
      });
      return;
    }

    if (sub === "remover") {
      const user = i.options.getUser("usuario", true);
      const tier = i.options.getString("tier", true) as VipTier;
      await revokeVip(i.guild, user.id, tier);
      await logAction({ guildId: i.guild.id, actorId: i.user.id, action: "vip.revoke", target: user.id, details: tier });
      await i.reply({ content: `🚫 Selo **${TIER_LABEL[tier]}** removido de <@${user.id}>.`, flags: EPH });
      return;
    }

    if (sub === "sincronizar") {
      await i.deferReply({ flags: EPH });
      const n = await syncAllBoosters(i.guild);
      await logAction({ guildId: i.guild.id, actorId: i.user.id, action: "vip.syncBoosters", details: String(n) });
      await i.editReply(`✅ ${n} Booster(s) receberam o selo **Tier 2**.`);
      return;
    }

    if (sub === "ver") {
      const user = i.options.getUser("usuario") ?? i.user;
      const vips = await getActiveVips(user.id);
      const desc = vips.length
        ? vips
            .map((v) => `• **${TIER_LABEL[v.tier]}** (${v.source})${v.expiresAt ? ` — expira <t:${Math.floor(v.expiresAt.getTime() / 1000)}:R>` : ""}`)
            .join("\n")
        : "Nenhum selo VIP ativo.";
      await i.reply({
        embeds: [new EmbedBuilder().setTitle("💎 VIP").setColor(0xf1c40f).setDescription(`<@${user.id}>\n${desc}`)],
        flags: EPH,
      });
      return;
    }
  },
});
