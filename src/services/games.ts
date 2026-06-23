import { prisma } from "../db.js";
import type { Game } from "@prisma/client";
import { MarketCurrency, MarketStatus, TradeUnit } from "@prisma/client";

// Gera um slug único a partir do nome (a-z0-9-), com sufixo numérico se colidir.
function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove diacríticos
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "jogo"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (await prisma.game.findUnique({ where: { slug } })) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

export function listGames(opts?: { onlyActive?: boolean }): Promise<Game[]> {
  return prisma.game.findMany({
    where: opts?.onlyActive ? { active: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function getGame(id: string): Promise<Game | null> {
  return prisma.game.findUnique({ where: { id } });
}

// Busca jogos por nome/slug para autocomplete (até 25).
export function searchGames(query: string): Promise<Game[]> {
  return prisma.game.findMany({
    where: query
      ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { slug: { contains: query, mode: "insensitive" } }] }
      : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 25,
  });
}

export interface CreateGameInput {
  name: string;
  tradeUnit: TradeUnit;
  currency?: MarketCurrency;
  baseQuantity?: number;
  emoji?: string | null;
}

export async function createGame(input: CreateGameInput): Promise<Game> {
  const slug = await uniqueSlug(slugify(input.name));
  return prisma.game.create({
    data: {
      slug,
      name: input.name,
      tradeUnit: input.tradeUnit,
      currency: input.currency ?? MarketCurrency.BRL,
      baseQuantity: input.baseQuantity ?? 1000,
      emoji: input.emoji ?? null,
    },
  });
}

export type UpdateGameInput = Partial<
  Pick<
    Game,
    | "name"
    | "emoji"
    | "tradeUnit"
    | "currency"
    | "baseQuantity"
    | "channelId"
    | "riskNotice"
    | "listingTtlHours"
    | "marketplaceEnabled"
    | "marketStatus"
    | "active"
    | "categoryId"
    | "sellChannelId"
    | "buyChannelId"
    | "rankingChannelId"
    | "chatChannelId"
    | "rankingMessageId"
  >
>;

export function updateGame(id: string, patch: UpdateGameInput): Promise<Game> {
  return prisma.game.update({ where: { id }, data: patch });
}

export function deleteGame(id: string): Promise<Game> {
  return prisma.game.delete({ where: { id } });
}

export { MarketCurrency, MarketStatus, TradeUnit };
