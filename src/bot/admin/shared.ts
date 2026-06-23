import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { MarketCurrency, MarketStatus, TradeUnit } from "@prisma/client";

export const EPHEMERAL = MessageFlags.Ephemeral;

// Garante que a interação veio de um servidor; responde e retorna null caso contrário.
export async function requireGuild(i: ChatInputCommandInteraction): Promise<string | null> {
  if (!i.guildId) {
    await i.reply({ content: "Use este comando dentro de um servidor.", flags: EPHEMERAL });
    return null;
  }
  return i.guildId;
}

export const UNIT_LABEL: Record<TradeUnit, string> = {
  DIAMOND: "Diamantes",
  GOLD: "Gold",
  ITEM: "Itens",
  OTHER: "Outro",
};

export const STATUS_LABEL: Record<MarketStatus, string> = {
  ENABLED: "Habilitado",
  SUSPENDED: "Suspenso",
  CLOSED: "Encerrado",
};

export const UNIT_CHOICES = [
  { name: "Diamantes", value: TradeUnit.DIAMOND },
  { name: "Gold", value: TradeUnit.GOLD },
  { name: "Itens", value: TradeUnit.ITEM },
  { name: "Outro", value: TradeUnit.OTHER },
];

export const CURRENCY_CHOICES = [
  { name: "BRL (R$)", value: MarketCurrency.BRL },
  { name: "USD (US$)", value: MarketCurrency.USD },
];

export const STATUS_CHOICES = [
  { name: "Habilitado", value: MarketStatus.ENABLED },
  { name: "Suspenso", value: MarketStatus.SUSPENDED },
  { name: "Encerrado", value: MarketStatus.CLOSED },
];
