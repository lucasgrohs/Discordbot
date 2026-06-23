import { SlashCommandBuilder, MessageFlags, EmbedBuilder, ChannelType } from "discord.js";
import { registerCommand } from "../router.js";
import { client } from "../client.js";
import { createReport, block, unblock } from "../../services/moderation.js";
import { getGuildConfig } from "../../services/guildConfig.js";

const EPH = MessageFlags.Ephemeral;

registerCommand({
  data: new SlashCommandBuilder()
    .setName("denunciar")
    .setDescription("Denuncia um usuário para a equipe.")
    .addUserOption((o) => o.setName("usuario").setDescription("Quem você quer denunciar").setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("O que aconteceu").setRequired(true)),
  async execute(i) {
    if (!i.guildId) return;
    const target = i.options.getUser("usuario", true);
    const reason = i.options.getString("motivo", true);
    if (target.id === i.user.id) {
      await i.reply({ content: "Você não pode se denunciar.", flags: EPH });
      return;
    }
    await createReport({ reporterId: i.user.id, reportedId: target.id, reason });

    const cfg = await getGuildConfig(i.guildId);
    if (cfg.staffChannelId) {
      const ch = await client.channels.fetch(cfg.staffChannelId).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        await ch.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("🚩 Nova denúncia")
              .setColor(0xe63946)
              .setDescription(
                [`**Denunciante:** <@${i.user.id}>`, `**Denunciado:** <@${target.id}>`, `**Motivo:** ${reason}`].join("\n"),
              ),
          ],
        });
      }
    }
    await i.reply({ content: "✅ Denúncia enviada para a equipe. Obrigado.", flags: EPH });
  },
});

registerCommand({
  data: new SlashCommandBuilder()
    .setName("bloquear")
    .setDescription("Bloqueia um usuário — vocês não poderão negociar.")
    .addUserOption((o) => o.setName("usuario").setDescription("Quem bloquear").setRequired(true)),
  async execute(i) {
    const target = i.options.getUser("usuario", true);
    if (target.id === i.user.id) {
      await i.reply({ content: "Você não pode se bloquear.", flags: EPH });
      return;
    }
    await block(i.user.id, target.id);
    await i.reply({ content: `🚫 <@${target.id}> bloqueado. Vocês não poderão negociar entre si.`, flags: EPH });
  },
});

registerCommand({
  data: new SlashCommandBuilder()
    .setName("desbloquear")
    .setDescription("Remove o bloqueio de um usuário.")
    .addUserOption((o) => o.setName("usuario").setDescription("Quem desbloquear").setRequired(true)),
  async execute(i) {
    const target = i.options.getUser("usuario", true);
    const n = await unblock(i.user.id, target.id);
    await i.reply({
      content: n > 0 ? `✅ <@${target.id}> desbloqueado.` : "Esse usuário não estava bloqueado por você.",
      flags: EPH,
    });
  },
});
