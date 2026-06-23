import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  discord: {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    guildId: process.env.DISCORD_GUILD_ID || undefined,
    purchaseChannelId: process.env.PURCHASE_CHANNEL_ID || undefined,
    staffChannelId: process.env.STAFF_CHANNEL_ID || undefined,
  },
  woovi: {
    appId: process.env.WOOVI_APP_ID || "",
    baseUrl: process.env.WOOVI_BASE_URL || "https://api.woovi.com/api/v1",
    expiresIn: Number(process.env.WOOVI_CHARGE_EXPIRES_IN || 1800),
    webhookSecret: process.env.WOOVI_WEBHOOK_SECRET || "",
  },
  webhook: {
    port: Number(process.env.WEBHOOK_PORT || 8787),
  },
  rates: {
    source: process.env.RATE_SOURCE || "binance",
  },
  giveaway: {
    // Requer "Server Members Intent" ligado no portal + permissões de convite.
    enabled: process.env.GIVEAWAY === "1",
  },
  messageLog: {
    // Requer "Message Content Intent" ligado no portal. Loga mensagens dos tickets.
    enabled: process.env.MESSAGE_LOG === "1",
  },
  kick: {
    // Integração Kick → VIP. Desligada se não houver KICK_CLIENT_ID.
    enabled: !!process.env.KICK_CLIENT_ID,
    clientId: process.env.KICK_CLIENT_ID || "",
    clientSecret: process.env.KICK_CLIENT_SECRET || "",
    redirectUri: process.env.KICK_REDIRECT_URI || "",
    scopes: process.env.KICK_SCOPES || "user:read",
    subDays: Number(process.env.KICK_SUB_DAYS || 31), // validade fallback da sub
  },
} as const;
