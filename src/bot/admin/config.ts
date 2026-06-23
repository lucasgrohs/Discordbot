import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from "discord.js";
import { registerCommand } from "../router.js";
import { logAction } from "../../services/audit.js";
import { getGuildConfig, updateGuildConfig } from "../../services/guildConfig.js";
import { EPHEMERAL, requireGuild } from "./shared.js";

registerCommand({
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configuração do bot neste servidor (admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("vip")
        .setDescription("Mapeia os cargos VIP (Tier 1 = Kick, Tier 2 = Nitro/Boost).")
        .addRoleOption((o) => o.setName("tier1").setDescription("Cargo Tier 1 (sub na Kick)"))
        .addRoleOption((o) => o.setName("tier2").setDescription("Cargo Tier 2 (Nitro/Boost)")),
    )
    .addSubcommand((s) =>
      s
        .setName("canais")
        .setDescription("Define os canais de staff, auditoria e disputas.")
        .addChannelOption((o) =>
          o.setName("staff").setDescription("Canal da staff").addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o.setName("log").setDescription("Canal de auditoria").addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((o) =>
          o.setName("disputa").setDescription("Canal de disputas").addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) => s.setName("ver").setDescription("Mostra a configuração atual.")),

  async execute(i) {
    const guildId = await requireGuild(i);
    if (!guildId) return;
    const sub = i.options.getSubcommand();

    if (sub === "vip") {
      const tier1 = i.options.getRole("tier1");
      const tier2 = i.options.getRole("tier2");
      if (!tier1 && !tier2) {
        await i.reply({ content: "Informe `tier1` e/ou `tier2`.", flags: EPHEMERAL });
        return;
      }
      await updateGuildConfig(guildId, {
        vipTier1RoleId: tier1?.id ?? undefined,
        vipTier2RoleId: tier2?.id ?? undefined,
      });
      await logAction({ guildId, actorId: i.user.id, action: "config.vip" });
      await i.reply({
        content: `✅ Cargos VIP atualizados.${tier1 ? ` Tier 1: <@&${tier1.id}>.` : ""}${tier2 ? ` Tier 2: <@&${tier2.id}>.` : ""}`,
        flags: EPHEMERAL,
      });
      return;
    }

    if (sub === "canais") {
      const staff = i.options.getChannel("staff");
      const log = i.options.getChannel("log");
      const disputa = i.options.getChannel("disputa");
      if (!staff && !log && !disputa) {
        await i.reply({ content: "Informe pelo menos um canal.", flags: EPHEMERAL });
        return;
      }
      await updateGuildConfig(guildId, {
        staffChannelId: staff?.id ?? undefined,
        logChannelId: log?.id ?? undefined,
        disputeChannelId: disputa?.id ?? undefined,
      });
      await logAction({ guildId, actorId: i.user.id, action: "config.channels" });
      await i.reply({ content: "✅ Canais atualizados.", flags: EPHEMERAL });
      return;
    }

    if (sub === "ver") {
      const cfg = await getGuildConfig(guildId);
      const role = (id: string | null) => (id ? `<@&${id}>` : "_não definido_");
      const chan = (id: string | null) => (id ? `<#${id}>` : "_não definido_");
      const embed = new EmbedBuilder()
        .setTitle("⚙️ Configuração do servidor")
        .setColor(0x5865f2)
        .addFields(
          { name: "VIP Tier 1 (Kick)", value: role(cfg.vipTier1RoleId), inline: true },
          { name: "VIP Tier 2 (Nitro)", value: role(cfg.vipTier2RoleId), inline: true },
          { name: "​", value: "​", inline: false },
          { name: "Canal da staff", value: chan(cfg.staffChannelId), inline: true },
          { name: "Canal de auditoria", value: chan(cfg.logChannelId), inline: true },
          { name: "Canal de disputas", value: chan(cfg.disputeChannelId), inline: true },
        );
      await i.reply({ embeds: [embed], flags: EPHEMERAL });
      return;
    }
  },
});
