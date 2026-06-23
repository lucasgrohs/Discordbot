import { config } from "./config.js";
import { client } from "./bot/client.js";
import { sweepExpired, sweepEmptyListings } from "./services/listings.js";
import { listGames } from "./services/games.js";
import { sweepStaleTrades, ticketsToCleanup, clearTicketChannel } from "./services/trades.js";
import { removeListingCard, refreshRanking, cleanupNegocie } from "./bot/market/board.js";
import { registerGiveawayEvents } from "./bot/giveaway/events.js";
import { registerTicketLogging } from "./bot/market/ticketlog.js";
import { registerVipEvents } from "./bot/vip/events.js";
import { sweepExpiredVips } from "./services/vip.js";
import { startWebServer } from "./web/server.js";
import { refreshGiveawayRanking } from "./bot/giveaway/board.js";
import { getActiveGiveaway, pendingDueForValidation, markEntry } from "./services/giveaways.js";
import { ReferralStatus } from "@prisma/client";

// Register all interaction handlers (side-effect imports).
import "./bot/admin/jogo.js";
import "./bot/admin/servidor.js";
import "./bot/admin/config.js";
import "./bot/admin/punir.js";
import "./bot/admin/vip.js";
import "./bot/vip/vincular.js";
import "./bot/market/painel.js";
import "./bot/market/anuncios.js";
import "./bot/market/reputacao.js";
import "./bot/market/moderacao.js";
import "./bot/market/flow.js";
import "./bot/giveaway/commands.js";

const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // expira anúncios vencidos a cada 10 min
const TICKET_TTL_MS = 60 * 60 * 1000; // apaga tickets fechados 1h após o fechamento

// Apaga as threads de tickets de negociações já fechadas há um tempo.
async function cleanupClosedTickets() {
  for (const t of await ticketsToCleanup(TICKET_TTL_MS)) {
    const ch = await client.channels.fetch(t.ticketChannelId).catch(() => null);
    if (ch && ch.isThread()) await ch.delete().catch(() => {});
    await clearTicketChannel(t.id);
  }
}

// Valida indicações pendentes cuja permanência mínima já passou (se ainda no servidor).
async function validateGiveawayEntries() {
  for (const guild of client.guilds.cache.values()) {
    const giveaway = await getActiveGiveaway(guild.id);
    if (!giveaway) continue;
    const due = await pendingDueForValidation(giveaway);
    if (due.length === 0) continue;
    for (const entry of due) {
      const stillMember = await guild.members.fetch(entry.invitedUserId).then(() => true).catch(() => false);
      if (stillMember) await markEntry(entry.id, ReferralStatus.VALID, "permanência cumprida");
      else await markEntry(entry.id, ReferralStatus.INVALID, "saiu antes de validar");
    }
    await refreshGiveawayRanking(guild.id);
  }
}

async function main() {
  registerVipEvents();
  if (config.giveaway.enabled) registerGiveawayEvents();
  if (config.messageLog.enabled) registerTicketLogging();
  if (config.kick.enabled) startWebServer();
  await client.login(config.discord.token);

  const sweep = async () => {
    try {
      const expired = await sweepExpired();
      if (expired.length > 0) {
        console.log(`[sweep] ${expired.length} anúncio(s) expirado(s).`);
        const games = new Set<string>();
        for (const l of expired) {
          await removeListingCard(l);
          games.add(l.gameId);
        }
        for (const gameId of games) await refreshRanking(gameId);
      }
      const emptied = await sweepEmptyListings();
      for (const l of emptied) await removeListingCard(l);

      const t = await sweepStaleTrades();
      if (t.expired > 0 || t.disputed > 0)
        console.log(`[sweep] negociações: ${t.expired} expirada(s), ${t.disputed} em disputa.`);

      let cleaned = 0;
      for (const g of await listGames()) {
        if (g.channelId) cleaned += await cleanupNegocie(g);
      }
      if (cleaned > 0) console.log(`[sweep] ${cleaned} mensagem(ns) limpa(s) do negocie.`);

      await cleanupClosedTickets();

      for (const guild of client.guilds.cache.values()) {
        const n = await sweepExpiredVips(guild);
        if (n > 0) console.log(`[sweep] ${n} VIP(s) expirado(s).`);
      }

      if (config.giveaway.enabled) await validateGiveawayEntries();
    } catch (err) {
      console.error("[sweep] erro:", err);
    }
  };
  await sweep();
  setInterval(sweep, SWEEP_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
