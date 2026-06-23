import { prisma } from "../db.js";
import type { Listing } from "@prisma/client";
import { ListingStatus, ListingType, MarketCurrency } from "@prisma/client";

export interface CreateListingInput {
  type: ListingType;
  userId: string;
  gameId: string;
  serverId: string;
  itemName?: string | null;
  quantity: number;
  pricePer1k: number;
  minPerTrade?: number;
  maxPerTrade?: number | null;
  currency?: MarketCurrency;
  ttlHours: number;
}

export function createListing(input: CreateListingInput): Promise<Listing> {
  const expiresAt = new Date(Date.now() + input.ttlHours * 3600 * 1000);
  return prisma.listing.create({
    data: {
      type: input.type,
      userId: input.userId,
      gameId: input.gameId,
      serverId: input.serverId,
      itemName: input.itemName ?? null,
      quantityTotal: input.quantity,
      quantityAvailable: input.quantity,
      minPerTrade: input.minPerTrade ?? 1,
      maxPerTrade: input.maxPerTrade ?? null,
      pricePer1k: input.pricePer1k,
      currency: input.currency ?? MarketCurrency.BRL,
      status: ListingStatus.ACTIVE,
      expiresAt,
    },
  });
}

export function getListing(id: string): Promise<Listing | null> {
  return prisma.listing.findUnique({ where: { id } });
}

export function listAllActiveListings(): Promise<Listing[]> {
  return prisma.listing.findMany({ where: { status: ListingStatus.ACTIVE } });
}

export function listUserListings(userId: string): Promise<Listing[]> {
  return prisma.listing.findMany({
    where: { userId, status: { not: ListingStatus.CLOSED } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
}

export function pauseListing(id: string): Promise<Listing> {
  return prisma.listing.update({ where: { id }, data: { status: ListingStatus.PAUSED } });
}

export function renewListing(id: string, ttlHours: number): Promise<Listing> {
  return prisma.listing.update({
    where: { id },
    data: {
      status: ListingStatus.ACTIVE,
      renewedAt: new Date(),
      expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
    },
  });
}

export function closeListing(id: string): Promise<Listing> {
  return prisma.listing.update({ where: { id }, data: { status: ListingStatus.CLOSED } });
}

// Fecha o anúncio se já não há quantidade disponível. Retorna o anúncio fechado (ou null).
export async function closeIfEmpty(id: string): Promise<Listing | null> {
  const l = await prisma.listing.findUnique({ where: { id } });
  if (l && l.status === ListingStatus.ACTIVE && l.quantityAvailable <= 0) {
    return prisma.listing.update({ where: { id }, data: { status: ListingStatus.CLOSED } });
  }
  return null;
}

// Atualiza o estoque disponível (e o total, se aumentou).
export async function setStock(id: string, quantity: number): Promise<Listing> {
  const current = await prisma.listing.findUnique({ where: { id } });
  const quantityTotal = Math.max(quantity, current?.quantityTotal ?? quantity);
  return prisma.listing.update({ where: { id }, data: { quantityAvailable: quantity, quantityTotal } });
}

export async function setBoardMessage(id: string, boardMessageId: string | null): Promise<void> {
  await prisma.listing.update({ where: { id }, data: { boardMessageId } });
}

// Vendedores com anúncio de venda ativo num jogo (para o ranking da sala).
export async function activeSellersForGame(gameId: string): Promise<{ userId: string; listings: number }[]> {
  const rows = await prisma.listing.groupBy({
    by: ["userId"],
    where: { gameId, type: ListingType.SELL, status: ListingStatus.ACTIVE },
    _count: { _all: true },
  });
  return rows.map((r) => ({ userId: r.userId, listings: r._count._all }));
}

// Fecha anúncios ativos já zerados e retorna os afetados (para limpar os cards).
export async function sweepEmptyListings(): Promise<Listing[]> {
  const empty = await prisma.listing.findMany({
    where: { status: ListingStatus.ACTIVE, quantityAvailable: { lte: 0 } },
  });
  if (empty.length === 0) return [];
  await prisma.listing.updateMany({
    where: { id: { in: empty.map((l) => l.id) } },
    data: { status: ListingStatus.CLOSED },
  });
  return empty;
}

// Marca como EXPIRED os anúncios ativos cujo prazo passou. Retorna os afetados.
export async function sweepExpired(): Promise<Listing[]> {
  const expiring = await prisma.listing.findMany({
    where: { status: ListingStatus.ACTIVE, expiresAt: { lt: new Date() } },
  });
  if (expiring.length === 0) return [];
  await prisma.listing.updateMany({
    where: { id: { in: expiring.map((l) => l.id) } },
    data: { status: ListingStatus.EXPIRED },
  });
  return expiring;
}
