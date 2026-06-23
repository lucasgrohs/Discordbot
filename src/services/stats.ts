import { prisma } from "../db.js";
import { ListingStatus, ListingType } from "@prisma/client";

export interface Dashboard {
  games: number;
  gamesActive: number;
  sell: number;
  buy: number;
  reviews: number;
  vips: number;
  trades: Record<string, number>;
}

export async function dashboard(): Promise<Dashboard> {
  const [games, gamesActive, sell, buy, reviews, vips] = await Promise.all([
    prisma.game.count(),
    prisma.game.count({ where: { marketplaceEnabled: true } }),
    prisma.listing.count({ where: { status: ListingStatus.ACTIVE, type: ListingType.SELL } }),
    prisma.listing.count({ where: { status: ListingStatus.ACTIVE, type: ListingType.BUY } }),
    prisma.review.count(),
    prisma.vipGrant.count({ where: { active: true } }),
  ]);
  const tradeRows = await prisma.trade.groupBy({ by: ["state"], _count: { _all: true } });
  const trades: Record<string, number> = {};
  for (const r of tradeRows) trades[r.state] = r._count._all;
  return { games, gamesActive, sell, buy, reviews, vips, trades };
}
