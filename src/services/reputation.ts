import { prisma } from "../db.js";
import type { UserReputation } from "@prisma/client";
import { TradeRole } from "@prisma/client";

// Média bayesiana: puxa quem tem poucas avaliações para a média global,
// para 1 nota 5,0 não vencer 200 notas 4,8 (§5.3 do plano).
export const PRIOR_MEAN = 4.0;
const PRIOR_WEIGHT = 5;

export function bayesianScore(sum: number, count: number): number {
  return (PRIOR_WEIGHT * PRIOR_MEAN + sum) / (PRIOR_WEIGHT + count);
}

const key = (userId: string, role: TradeRole) => ({ userId_role: { userId, role } });

async function ensure(userId: string, role: TradeRole): Promise<void> {
  await prisma.userReputation.upsert({
    where: key(userId, role),
    create: { userId, role, score: PRIOR_MEAN },
    update: {},
  });
}

export async function bumpCompleted(userId: string, role: TradeRole): Promise<void> {
  await ensure(userId, role);
  await prisma.userReputation.update({ where: key(userId, role), data: { completedTrades: { increment: 1 } } });
}

export async function bumpCancelled(userId: string, role: TradeRole): Promise<void> {
  await ensure(userId, role);
  await prisma.userReputation.update({ where: key(userId, role), data: { cancelledTrades: { increment: 1 } } });
}

export async function bumpDispute(userId: string, role: TradeRole): Promise<void> {
  await ensure(userId, role);
  await prisma.userReputation.update({ where: key(userId, role), data: { disputes: { increment: 1 } } });
}

// Recusar uma solicitação registrada conta como "denial" (§3/§5 — anti-recusa).
export async function bumpDenial(userId: string, role: TradeRole): Promise<void> {
  await ensure(userId, role);
  await prisma.userReputation.update({ where: key(userId, role), data: { denialCount: { increment: 1 } } });
}

async function addRating(rateeId: string, role: TradeRole, rating: number): Promise<void> {
  await ensure(rateeId, role);
  const rep = await prisma.userReputation.update({
    where: key(rateeId, role),
    data: { ratingSum: { increment: rating }, ratingCount: { increment: 1 } },
  });
  await prisma.userReputation.update({
    where: key(rateeId, role),
    data: { score: bayesianScore(rep.ratingSum, rep.ratingCount) },
  });
}

// Registra a avaliação pós-conclusão (uma por negociação por avaliador).
export async function submitReview(input: {
  tradeId: string;
  raterId: string;
  rateeId: string;
  rateeRole: TradeRole;
  rating: number;
  comment?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await prisma.review.create({
      data: {
        tradeId: input.tradeId,
        raterId: input.raterId,
        rateeId: input.rateeId,
        rateeRole: input.rateeRole,
        rating: input.rating,
        comment: input.comment ?? null,
      },
    });
  } catch {
    return { ok: false, reason: "Você já avaliou esta negociação." };
  }
  await addRating(input.rateeId, input.rateeRole, input.rating);
  return { ok: true };
}

export function reviewCount(tradeId: string): Promise<number> {
  return prisma.review.count({ where: { tradeId } });
}

export function getReputation(userId: string, role: TradeRole): Promise<UserReputation | null> {
  return prisma.userReputation.findUnique({ where: key(userId, role) });
}

export function topSellers(limit = 10): Promise<UserReputation[]> {
  return prisma.userReputation.findMany({
    where: { role: TradeRole.SELLER, ratingCount: { gt: 0 } },
    orderBy: [{ score: "desc" }, { ratingCount: "desc" }],
    take: limit,
  });
}
