import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  AutocompleteInteraction,
  ChannelType,
} from "discord.js";
import { registerCommand } from "../router.js";
import { getGame, searchGames } from "../../services/games.js";
import { logAction } from "../../services/audit.js";
import { panelMessage } from "./render.js";

const EPH = MessageFlags.Ephemeral;

registerCommand({
  data: new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Publica o painel COMPRO/VENDO de um jogo (admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) => o.setName("jogo").setDescription("Jogo").setRequired(true).setAutocomplete(true)),

  async autocomplete(i: AutocompleteInteraction) {
    const focused = i.options.getFocused();
    const games = await searchGames(focused);
    await i.respond(games.map((g) => ({ name: `${g.emoji ? g.emoji + " " : ""}${g.name}`, value: g.id })));
  },

  async execute(i) {
    if (!i.guild) {
      await i.reply({ content: "Use dentro de um servidor.", flags: EPH });
      return;
    }
    const game = await getGame(i.options.getString("jogo", true));
    if (!game) {
      await i.reply({ content: "Jogo não encontrado.", flags: EPH });
      return;
    }

    const channel = game.channelId ? await i.guild.channels.fetch(game.channelId).catch(() => null) : i.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await i.reply({
        content: "Canal inválido. Defina um canal de texto com `/jogo canal` ou use este comando em um canal de texto.",
        flags: EPH,
      });
      return;
    }

    await channel.send(panelMessage(game));
    await logAction({ guildId: i.guild.id, actorId: i.user.id, action: "panel.publish", target: game.slug });

    const disabled = !game.marketplaceEnabled || game.marketStatus !== "ENABLED";
    const warn = disabled
      ? `\n⚠️ O marketplace deste jogo está **desligado** — os botões não vão funcionar até você rodar \`/jogo status jogo:${game.name} marketplace:True\`.`
      : "";
    await i.reply({ content: `✅ Painel de **${game.name}** publicado em <#${channel.id}>.${warn}`, flags: EPH });
  },
});
