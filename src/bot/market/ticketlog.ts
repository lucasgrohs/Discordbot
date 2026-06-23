import { Events } from "discord.js";
import { client } from "../client.js";
import { getTradeByTicketChannel } from "../../services/trades.js";
import { logTicketMessage } from "../../services/transcripts.js";

// Registra (no banco) as mensagens enviadas dentro das threads de ticket,
// preservando a conversa mesmo que os usuários apaguem suas mensagens no Discord.
export function registerTicketLogging(): void {
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (!msg.inGuild() || !msg.channel.isThread() || msg.author.bot) return;
      const trade = await getTradeByTicketChannel(msg.channelId);
      if (!trade) return;
      const content = [msg.content, ...msg.attachments.map((a) => a.url)].filter(Boolean).join(" ");
      if (!content) return;
      await logTicketMessage({
        tradeId: trade.id,
        authorId: msg.author.id,
        authorTag: msg.author.tag,
        content,
      });
    } catch (err) {
      console.error("[ticketlog]", err);
    }
  });
}
