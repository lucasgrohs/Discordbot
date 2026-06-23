import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AutocompleteInteraction } from "discord.js";
import { registerCommand } from "../router.js";
import { logAction } from "../../services/audit.js";
import { getGame, searchGames } from "../../services/games.js";
import { listServers, getServer, searchServers, addServer, removeServer } from "../../services/servers.js";
import { EPHEMERAL, requireGuild } from "./shared.js";

registerCommand({
  data: new SlashCommandBuilder()
    .setName("servidor")
    .setDescription("Gerencia os servidores de um jogo (admin).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("adicionar")
        .setDescription("Adiciona um servidor a um jogo.")
        .addStringOption((o) => o.setName("jogo").setDescription("Jogo").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("nome").setDescription("Nome do servidor").setRequired(true))
        .addStringOption((o) => o.setName("regiao").setDescription("Região (opcional)")),
    )
    .addSubcommand((s) =>
      s
        .setName("listar")
        .setDescription("Lista os servidores de um jogo.")
        .addStringOption((o) => o.setName("jogo").setDescription("Jogo").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remover")
        .setDescription("Remove um servidor de um jogo.")
        .addStringOption((o) => o.setName("jogo").setDescription("Jogo").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("servidor").setDescription("Servidor").setRequired(true).setAutocomplete(true)),
    ),

  async autocomplete(i: AutocompleteInteraction) {
    const focused = i.options.getFocused(true);
    if (focused.name === "jogo") {
      const games = await searchGames(focused.value);
      await i.respond(games.map((g) => ({ name: `${g.emoji ? g.emoji + " " : ""}${g.name}`, value: g.id })));
      return;
    }
    if (focused.name === "servidor") {
      const gameId = i.options.getString("jogo");
      if (!gameId) return i.respond([]);
      const servers = await searchServers(gameId, focused.value);
      await i.respond(servers.map((s) => ({ name: s.region ? `${s.name} (${s.region})` : s.name, value: s.id })));
      return;
    }
    await i.respond([]);
  },

  async execute(i) {
    const guildId = await requireGuild(i);
    if (!guildId) return;
    const sub = i.options.getSubcommand();
    const gameId = i.options.getString("jogo", true);
    const game = await getGame(gameId);
    if (!game) {
      await i.reply({ content: "Jogo não encontrado.", flags: EPHEMERAL });
      return;
    }

    if (sub === "adicionar") {
      const name = i.options.getString("nome", true);
      const region = i.options.getString("regiao");
      const server = await addServer({ gameId, name, region });
      await logAction({ guildId, actorId: i.user.id, action: "server.add", target: `${game.slug}/${server.name}` });
      await i.reply({ content: `✅ Servidor **${server.name}** adicionado a **${game.name}**.`, flags: EPHEMERAL });
      return;
    }

    if (sub === "listar") {
      const servers = await listServers(gameId);
      if (servers.length === 0) {
        await i.reply({ content: `Nenhum servidor em **${game.name}**. Use \`/servidor adicionar\`.`, flags: EPHEMERAL });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(`🗺️ Servidores de ${game.name}`)
        .setColor(0x5865f2)
        .setDescription(servers.map((s) => `• **${s.name}**${s.region ? ` _(${s.region})_` : ""}`).join("\n"));
      await i.reply({ embeds: [embed], flags: EPHEMERAL });
      return;
    }

    if (sub === "remover") {
      const serverId = i.options.getString("servidor", true);
      const server = await getServer(serverId);
      if (!server || server.gameId !== gameId) {
        await i.reply({ content: "Servidor não encontrado neste jogo.", flags: EPHEMERAL });
        return;
      }
      await removeServer(serverId);
      await logAction({ guildId, actorId: i.user.id, action: "server.remove", target: `${game.slug}/${server.name}` });
      await i.reply({ content: `🗑️ Servidor **${server.name}** removido de **${game.name}**.`, flags: EPHEMERAL });
      return;
    }
  },
});
