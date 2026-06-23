import { prisma } from "../db.js";
import type { Giveaway, ReferralCode } from "@prisma/client";
import { GiveawayMode, GiveawayStatus, ReferralStatus } from "@prisma/client";

export function createGiveaway(input: {
  guildId: string;
  title: string;
  channelId: string;
  mode?: GiveawayMode;
  minAccountAgeDays?: number;
  minStayDays?: number;
}): Promise<Giveaway> {
  return prisma.giveaway.create({
    data: {
      guildId: input.guildId,
      title: input.title,
      channelId: input.channelId,
      mode: input.mode ?? GiveawayMode.TOP1,
      status: GiveawayStatus.RUNNING,
      startsAt: new Date(),
      minAccountAgeDays: input.minAccountAgeDays ?? 7,
      minStayDays: input.minStayDays ?? 3,
    },
  });
}

export function getActiveGiveaway(guildId: string): Promise<Giveaway | null> {
  return prisma.giveaway.findFirst({
    where: { guildId, status: GiveawayStatus.RUNNING },
    orderBy: { createdAt: "desc" },
  });
}

export function getGiveaway(id: string): Promise<Giveaway | null> {
  return prisma.giveaway.findUnique({ where: { id } });
}

export function getLatestGiveaway(guildId: string): Promise<Giveaway | null> {
  return prisma.giveaway.findFirst({ where: { guildId }, orderBy: { createdAt: "desc" } });
}

export function endGiveaway(id: string): Promise<Giveaway> {
  return prisma.giveaway.update({ where: { id }, data: { status: GiveawayStatus.ENDED, endsAt: new Date() } });
}

// --- Códigos/convites por participante ---

export function findReferralCode(giveawayId: string, ownerId: string): Promise<ReferralCode | null> {
  return prisma.referralCode.findUnique({ where: { giveawayId_ownerId: { giveawayId, ownerId } } });
}

export function createReferralCode(giveawayId: string, ownerId: string, code: string): Promise<ReferralCode> {
  return prisma.referralCode.create({ data: { giveawayId, ownerId, code, inviteCode: code } });
}

export function listReferralCodes(giveawayId: string): Promise<ReferralCode[]> {
  return prisma.referralCode.findMany({ where: { giveawayId } });
}

export function updateReferralCode(id: string, code: string): Promise<ReferralCode> {
  return prisma.referralCode.update({ where: { id }, data: { code, inviteCode: code } });
}

// --- Entradas (indicações) ---

// Registra a chegada de um convidado, aplicando as regras de qualificação.
export async function recordEntry(params: {
  giveaway: Giveaway;
  invitedUserId: string;
  inviteCode: string;
  accountCreatedAt: Date;
}): Promise<{ referrerId: string; status: ReferralStatus; total: number } | null> {
  const { giveaway, invitedUserId, inviteCode, accountCreatedAt } = params;
  const rc = await prisma.referralCode.findFirst({ where: { giveawayId: giveaway.id, code: inviteCode } });
  if (!rc) return null;
  if (rc.ownerId === invitedUserId) return null; // auto-indicação

  const existing = await prisma.referralEntry.findUnique({
    where: { giveawayId_invitedUserId: { giveawayId: giveaway.id, invitedUserId } },
  });
  if (existing) return null; // já contabilizado (anti reentrada)

  const ageDays = (Date.now() - accountCreatedAt.getTime()) / 86400000;
  let status: ReferralStatus;
  let reason: string;
  if (ageDays < giveaway.minAccountAgeDays) {
    status = ReferralStatus.INVALID;
    reason = "conta muito nova";
  } else if (giveaway.minStayDays > 0) {
    status = ReferralStatus.PENDING;
    reason = "aguardando permanência mínima";
  } else {
    status = ReferralStatus.VALID;
    reason = "validada";
  }

  await prisma.referralEntry.create({
    data: {
      giveawayId: giveaway.id,
      referrerId: rc.ownerId,
      invitedUserId,
      status,
      reason,
      validatedAt: status === ReferralStatus.VALID ? new Date() : null,
    },
  });
  const total = await prisma.referralEntry.count({
    where: { giveawayId: giveaway.id, referrerId: rc.ownerId, status: { not: ReferralStatus.INVALID } },
  });
  return { referrerId: rc.ownerId, status, total };
}

// Convidado saiu antes de validar → invalida a entrada pendente.
export async function invalidateEntryOnLeave(giveawayId: string, invitedUserId: string): Promise<void> {
  await prisma.referralEntry.updateMany({
    where: { giveawayId, invitedUserId, status: ReferralStatus.PENDING },
    data: { status: ReferralStatus.INVALID, reason: "saiu antes de validar" },
  });
}

// Entradas pendentes cuja permanência mínima já passou.
export async function pendingDueForValidation(giveaway: Giveaway): Promise<{ id: string; invitedUserId: string }[]> {
  const cutoff = new Date(Date.now() - giveaway.minStayDays * 86400000);
  const rows = await prisma.referralEntry.findMany({
    where: { giveawayId: giveaway.id, status: ReferralStatus.PENDING, joinedAt: { lte: cutoff } },
    select: { id: true, invitedUserId: true },
  });
  return rows;
}

export async function markEntry(id: string, status: ReferralStatus, reason: string): Promise<void> {
  await prisma.referralEntry.update({
    where: { id },
    data: { status, reason, validatedAt: status === ReferralStatus.VALID ? new Date() : null },
  });
}

export async function topReferrers(
  giveawayId: string,
  opts?: { onlyValid?: boolean },
): Promise<{ referrerId: string; count: number }[]> {
  const rows = await prisma.referralEntry.groupBy({
    by: ["referrerId"],
    where: {
      giveawayId,
      status: opts?.onlyValid ? ReferralStatus.VALID : { not: ReferralStatus.INVALID },
    },
    _count: { invitedUserId: true },
    orderBy: { _count: { invitedUserId: "desc" } },
  });
  return rows.map((r) => ({ referrerId: r.referrerId, count: r._count.invitedUserId }));
}

export async function entryStats(giveawayId: string): Promise<{ valid: number; pending: number; invalid: number }> {
  const rows = await prisma.referralEntry.groupBy({ by: ["status"], where: { giveawayId }, _count: { _all: true } });
  const get = (s: ReferralStatus) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { valid: get(ReferralStatus.VALID), pending: get(ReferralStatus.PENDING), invalid: get(ReferralStatus.INVALID) };
}

const randInt = (n: number) => Math.floor(Math.random() * n);

function weightedPick(ranking: { referrerId: string; count: number }[]): string {
  const total = ranking.reduce((s, r) => s + r.count, 0);
  let x = Math.random() * total;
  for (const r of ranking) {
    x -= r.count;
    if (x < 0) return r.referrerId;
  }
  return ranking[0].referrerId;
}

// Sorteia os vencedores conforme o modo e grava em winnerIds.
export async function drawWinners(giveawayId: string): Promise<string[]> {
  const giveaway = await prisma.giveaway.findUnique({ where: { id: giveawayId } });
  if (!giveaway) return [];
  const ranking = await topReferrers(giveawayId, { onlyValid: true });
  let winners: string[] = [];
  switch (giveaway.mode) {
    case GiveawayMode.TOP1:
      winners = ranking.slice(0, 1).map((r) => r.referrerId);
      break;
    case GiveawayMode.TOP3:
      winners = ranking.slice(0, 3).map((r) => r.referrerId);
      break;
    case GiveawayMode.TOP10:
      winners = ranking.slice(0, 10).map((r) => r.referrerId);
      break;
    case GiveawayMode.RANDOM_VALID:
      winners = ranking.length ? [weightedPick(ranking)] : [];
      break;
    case GiveawayMode.TOP30_RANDOM: {
      const pool = ranking.slice(0, 30);
      winners = pool.length ? [pool[randInt(pool.length)].referrerId] : [];
      break;
    }
    case GiveawayMode.MIXED: {
      const top = ranking.slice(0, 1).map((r) => r.referrerId);
      const rest = ranking.slice(1);
      winners = rest.length ? [...top, rest[randInt(rest.length)].referrerId] : top;
      break;
    }
  }
  await prisma.giveaway.update({ where: { id: giveawayId }, data: { winnerIds: winners } });
  return winners;
}
