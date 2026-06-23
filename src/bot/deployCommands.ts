import { REST, Routes } from "discord.js";
import { config } from "../config.js";
import { getCommandsJSON } from "./router.js";

// Import command modules for their registration side-effects.
import "./admin/jogo.js";
import "./admin/servidor.js";
import "./admin/config.js";
import "./admin/punir.js";
import "./admin/vip.js";
import "./vip/vincular.js";
import "./market/painel.js";
import "./market/anuncios.js";
import "./market/reputacao.js";
import "./market/moderacao.js";
import "./giveaway/commands.js";

async function main() {
  const rest = new REST().setToken(config.discord.token);
  const body = getCommandsJSON();

  if (config.discord.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body });
    console.log(`Registered ${body.length} guild command(s) to ${config.discord.guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body });
    console.log(`Registered ${body.length} global command(s).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
