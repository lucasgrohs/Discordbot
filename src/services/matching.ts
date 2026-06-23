import { prisma } from "../db.js";
import type { Listing } from "@prisma/client";
import { ListingStatus, ListingType, TradeRole, VipTier } from "@prisma/client";
import { PRIOR_MEAN } from "./reputation.js";
import { getNum } from "./settings.js";

export type SortMode = "recommended" | "price" | "trust" | "fast";

export interface MatchResult {
  listing: Listing;
  sellerId: string;
  vipTier: VipTier | null;
  ratingAvg: number | null;
  ratingCount: number;
  completionRate: number;
  enoughStock: boolean;
}

// Pesos do score "Recomendado" são ajustáveis no painel (services/settings.ts).
const WEEK_MS = 7 * 24 * 3600 * 1000;

export interface MatchParams {
  gameId: string;
  serverId: string;
  quantity: number;
  sort?: SortMode;
  limit?: number;
}

// Encontra vendedores compatíveis e os ordena pelo modo escolhido.
// Filtra por jogo+servidor+estoque; se ninguém tiver o suficiente, cai pros de
// maior estoque disponível (§3.3).
export async function matchSellers(params: MatchParams): Promise<MatchResult[]> {
  const { gameId, serverId, quantity } = params;
  const sort = params.sort ?? "recommended";
  const now = new Date();
  const notExpired = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };

  let candidates = await prisma.listing.findMany({
    where: {
      gameId,
      serverId,
      type: ListingType.SELL,
      status: ListingStatus.ACTIVE,
      quantityAvailable: { gte: quantity },
      ...notExpired,
    },
  });

  let enoughStock = true;
  if (candidates.length === 0) {
    enoughStock = false;
    candidates = await prisma.listing.findMany({
      where: { gameId, serverId, type: ListingType.SELL, status: ListingStatus.ACTIVE, ...notExpired },
      orderBy: { quantityAvailable: "desc" },
      take: 25,
    });
  }
  if (candidates.length === 0) return [];

  const sellerIds = [...new Set(candidates.map((c) => c.userId))];
  const reps = await prisma.userReputation.findMany({
    where: { userId: { in: sellerIds }, role: TradeRole.SELLER },
  });
  const repMap = new Map(reps.map((r) => [r.userId, r]));

  const vips = await prisma.vipGrant.findMany({
    where: { userId: { in: sellerIds }, active: true, ...notExpired },
  });
  const vipMap = new Map<string, VipTier>();
  for (const v of vips) {
    const cur = vipMap.get(v.userId);
    // KICK (Tier 1) prevalece sobre NITRO (Tier 2).
    if (!cur || (cur === VipTier.NITRO && v.tier === VipTier.KICK)) vipMap.set(v.userId, v.tier);
  }

  const prices = candidates.map((c) => Number(c.pricePer1k));
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const priceScore = (p: number) => (maxP === minP ? 1 : (maxP - p) / (maxP - minP));

  // Pesos/bônus ajustáveis no painel.
  const wRep = getNum("match_w_rep");
  const wPrice = getNum("match_w_price");
  const wCompletion = getNum("match_w_completion");
  const wRecency = getNum("match_w_recency");
  const vipBonus = (t: VipTier | null) =>
    t === VipTier.KICK ? getNum("vip_bonus_kick") : t === VipTier.NITRO ? getNum("vip_bonus_nitro") : 0;

  const scored = candidates.map((c) => {
    const rep = repMap.get(c.userId);
    const ratingAvg = rep && rep.ratingCount > 0 ? rep.ratingSum / rep.ratingCount : null;
    const decided = rep ? rep.completedTrades + rep.cancelledTrades : 0;
    const completionRate = decided > 0 ? rep!.completedTrades / decided : 0.5; // neutro sem histórico
    const repScore = rep && rep.ratingCount > 0 ? rep.score : PRIOR_MEAN; // novo vendedor = média prior
    const vipTier = vipMap.get(c.userId) ?? null;
    const recency = Math.max(0, 1 - (now.getTime() - c.updatedAt.getTime()) / WEEK_MS);
    const composite =
      wRep * (repScore / 5) +
      wPrice * priceScore(Number(c.pricePer1k)) +
      wCompletion * completionRate +
      wRecency * recency +
      vipBonus(vipTier);
    return {
      result: {
        listing: c,
        sellerId: c.userId,
        vipTier,
        ratingAvg,
        ratingCount: rep?.ratingCount ?? 0,
        completionRate,
        enoughStock,
      } satisfies MatchResult,
      composite,
      repScore,
      priceVal: Number(c.pricePer1k),
    };
  });

  switch (sort) {
    case "price":
      scored.sort((a, b) => a.priceVal - b.priceVal);
      break;
    case "trust":
      scored.sort((a, b) => b.repScore - a.repScore || b.result.ratingCount - a.result.ratingCount);
      break;
    case "fast":
      scored.sort((a, b) => b.result.completionRate - a.result.completionRate);
      break;
    default:
      scored.sort((a, b) => b.composite - a.composite);
  }

  return scored.slice(0, params.limit ?? 5).map((s) => s.result);
}
