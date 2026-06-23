import { prisma } from "../db.js";
import type { Report, Sanction } from "@prisma/client";
import { SanctionScope, SanctionType } from "@prisma/client";

// Banimento global ativo? (§7 do plano)
export async function isBanned(userId: string): Promise<boolean> {
  const s = await prisma.sanction.findFirst({
    where: {
      userId,
      type: SanctionType.BAN,
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  return !!s;
}

// Existe bloqueio entre os dois (em qualquer direção)?
export async function isBlocked(a: string, b: string): Promise<boolean> {
  const x = await prisma.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  });
  return !!x;
}

export function block(blockerId: string, blockedId: string, reason?: string) {
  return prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId, reason },
    update: { reason },
  });
}

export async function unblock(blockerId: string, blockedId: string): Promise<number> {
  const r = await prisma.block.deleteMany({ where: { blockerId, blockedId } });
  return r.count;
}

export function createReport(input: {
  reporterId: string;
  reportedId: string;
  reason: string;
  tradeId?: string;
}): Promise<Report> {
  return prisma.report.create({ data: input });
}

export function ban(userId: string, issuedBy: string, reason: string): Promise<Sanction> {
  return prisma.sanction.create({
    data: { userId, type: SanctionType.BAN, scope: SanctionScope.GLOBAL, reason, issuedBy },
  });
}

export async function unban(userId: string): Promise<number> {
  const r = await prisma.sanction.updateMany({
    where: { userId, type: SanctionType.BAN, active: true },
    data: { active: false },
  });
  return r.count;
}
