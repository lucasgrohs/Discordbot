import express from "express";
import { VipTier } from "@prisma/client";
import { config } from "../config.js";
import { client } from "../bot/client.js";
import { exchangeCodeForUser } from "../kick/oauth.js";
import { verifyWebhookSignature } from "../kick/signature.js";
import { takePending } from "../kick/pending.js";
import { linkKick, getByKickUser } from "../services/kickLink.js";
import { grantVip } from "../services/vip.js";
import { adminRouter } from "./admin.js";

const SUB_NEW = "channel.subscription.new";
const SUB_RENEWAL = "channel.subscription.renewal";

// Sobe os endpoints HTTP da Kick (OAuth callback + webhook de sub).
export function startWebServer(): void {
  const app = express();

  // Painel web de mensagens (/admin) — protegido por WEB_ADMIN_TOKEN.
  app.use("/admin", adminRouter);

  // OAuth callback do /vincular-kick.
  app.get("/kick/callback", async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const pending = takePending(state);
    if (!code || !pending) {
      res.status(400).send("Link inválido ou expirado. Rode /vincular-kick novamente.");
      return;
    }
    try {
      const u = await exchangeCodeForUser(code, pending.verifier);
      await linkKick(pending.discordUserId, u.userId, u.username);
      res.send("✅ Conta Kick vinculada! Pode fechar esta aba e voltar ao Discord.");
    } catch (err) {
      console.error("[kick] callback:", err);
      res.status(500).send("Erro ao vincular sua conta Kick. Tente de novo.");
    }
  });

  // Webhook de eventos da Kick (assinatura RSA verificada).
  app.post("/kick/webhook", express.raw({ type: () => true, limit: "1mb" }), async (req, res) => {
    const messageId = req.header("Kick-Event-Message-Id") ?? "";
    const timestamp = req.header("Kick-Event-Message-Timestamp") ?? "";
    const signature = req.header("Kick-Event-Signature") ?? "";
    const eventType = req.header("Kick-Event-Type") ?? "";
    const raw = req.body as Buffer;

    if (!(await verifyWebhookSignature({ messageId, timestamp, rawBody: raw, signatureB64: signature }))) {
      res.status(401).end();
      return;
    }
    res.status(200).end(); // responde rápido; processa depois

    if (eventType !== SUB_NEW && eventType !== SUB_RENEWAL) return;
    try {
      const ev = JSON.parse(raw.toString("utf8")) as {
        subscriber?: { user_id?: number | string };
        user?: { user_id?: number | string };
        expires_at?: string;
      };
      const sub = ev.subscriber ?? ev.user;
      const kickUserId = sub?.user_id != null ? String(sub.user_id) : null;
      if (!kickUserId) return;

      const link = await getByKickUser(kickUserId);
      if (!link) return; // Kick não vinculado a nenhum Discord

      const expiresAt = ev.expires_at ? new Date(ev.expires_at) : new Date(Date.now() + config.kick.subDays * 86400000);
      const guildId = config.discord.guildId;
      if (!guildId) return;
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;

      await grantVip(guild, link.discordUserId, VipTier.KICK, "kick", expiresAt);
      console.log(`[kick] VIP Tier 1 → discord ${link.discordUserId} (kick ${kickUserId}) até ${expiresAt.toISOString()}`);
    } catch (err) {
      console.error("[kick] webhook:", err);
    }
  });

  app.listen(config.webhook.port, () => console.log(`[web] endpoints Kick em :${config.webhook.port}`));
}
