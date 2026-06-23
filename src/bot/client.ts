import { Client, GatewayIntentBits, Partials } from "discord.js";
import { routeInteraction } from "./router.js";
import { config } from "../config.js";

// Server Members (privilegiado, já ligado no portal) é usado por VIP/Booster e pelo sorteio.
const giveawayIntents = config.giveaway.enabled ? [GatewayIntentBits.GuildInvites] : [];

// Log de tickets precisa de MessageContent (privilegiado) + GuildMessages.
const messageLogIntents = config.messageLog.enabled
  ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
  : [];

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, ...giveawayIntents, ...messageLogIntents],
  partials: [Partials.Channel],
});

client.on("interactionCreate", routeInteraction);

client.once("clientReady", (c) => {
  console.log(`[bot] logged in as ${c.user.tag}`);
});
