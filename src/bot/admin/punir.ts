import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { registerCommand } from "../router.js";
import { ban, unban } from "../../services/moderation.js";
import { logAction } from "../../services/audit.js";

const EPH = MessageFlags.Ephemeral;

registerCommand({
  data: new SlashCommandBuilder()
    .setName("banir")
    .setDescription("Bane um usuário do marketplace (admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("usuario").setDescription("Quem banir").setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo").setRequired(true)),
  async execute(i) {
    if (!i.guildId) return;
    const target = i.options.getUser("usuario", true);
    const reason = i.options.getString("motivo", true);
    await ban(target.id, i.user.id, reason);
    await logAction({ guildId: i.guildId, actorId: i.user.id, action: "user.ban", target: target.id, details: reason });
    await i.reply({ content: `🔨 <@${target.id}> foi banido do marketplace.`, flags: EPH });
  },
});

registerCommand({
  data: new SlashCommandBuilder()
    .setName("desbanir")
    .setDescription("Remove o banimento de um usuário (admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("usuario").setDescription("Quem desbanir").setRequired(true)),
  async execute(i) {
    if (!i.guildId) return;
    const target = i.options.getUser("usuario", true);
    const n = await unban(target.id);
    await logAction({ guildId: i.guildId, actorId: i.user.id, action: "user.unban", target: target.id });
    await i.reply({
      content: n > 0 ? `✅ <@${target.id}> foi desbanido.` : "Esse usuário não estava banido.",
      flags: EPH,
    });
  },
});
