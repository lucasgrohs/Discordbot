import { prisma } from "../db.js";
import type { Trade } from "@prisma/client";
import { ListingStatus, MarketCurrency, TradeRole, TradeState } from "@prisma/client";
import { bumpCompleted, bumpCancelled, bumpDispute, bumpDenial } from "./reputation.js";
import { getNum } from "./settings.js";

const HOUR_MS = 3600 * 1000; // prazos (aceite/conclusão) são ajustáveis no painel

type Result<T = Trade> = { ok: true; trade: T } | { ok: false; reason: string };

export interface CreateTradeInput {
  guildId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  gameId: string;
  serverId: string;
  quantity: number;
  pricePer1k: number;
  currency: MarketCurrency;
}

export async function createTrade(input: CreateTradeInput): Promise<Trade> {
  const trade = await prisma.trade.create({
    data: { ...input, state: TradeState.PENDING, expiresAt: new Date(Date.now() + getNum("accept_window_hours") * HOUR_MS) },
  });
  await prisma.tradeEvent.create({
    data: { tradeId: trade.id, actorId: input.buyerId, toState: TradeState.PENDING, note: "solicitação criada" },
  });
  return trade;
}

export function getTrade(id: string): Promise<Trade | null> {
  return prisma.trade.findUnique({ where: { id } });
}

export function getTradeByTicketChannel(channelId: string): Promise<Trade | null> {
  return prisma.trade.findFirst({ where: { ticketChannelId: channelId } });
}

export async function setTicketChannel(tradeId: string, channelId: string): Promise<void> {
  await prisma.trade.update({ where: { id: tradeId }, data: { ticketChannelId: channelId } });
}

// O dono do anúncio aceita: reserva estoque de forma atômica e move para ACCEPTED.
export async function acceptTrade(tradeId: string, accepterId: string): Promise<Result> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) return { ok: false, reason: "Negociação não encontrada." };
  const listing = await prisma.listing.findUnique({ where: { id: trade.listingId } });
  if (!listing) return { ok: false, reason: "Anúncio não encontrado." };
  if (listing.userId !== accepterId) return { ok: false, reason: "Apenas o dono do anúncio pode aceitar." };
  if (trade.state !== TradeState.PENDING) return { ok: false, reason: "Esta negociação não está mais pendente." };

  const reserved = await prisma.listing.updateMany({
    where: { id: trade.listingId, status: ListingStatus.ACTIVE, quantityAvailable: { gte: trade.quantity } },
    data: { quantityAvailable: { decrement: trade.quantity } },
  });
  if (reserved.count === 0) return { ok: false, reason: "Estoque insuficiente no anúncio." };

  const updated = await prisma.trade.update({
    where: { id: tradeId },
    data: { state: TradeState.ACCEPTED, acceptedAt: new Date(), expiresAt: new Date(Date.now() + getNum("complete_window_hours") * HOUR_MS) },
  });
  await prisma.tradeEvent.create({
    data: {
      tradeId,
      actorId: accepterId,
      fromState: TradeState.PENDING,
      toState: TradeState.ACCEPTED,
      note: "aceita; estoque reservado",
    },
  });
  return { ok: true, trade: updated };
}

export async function refuseTrade(tradeId: string, accepterId: string): Promise<Result> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) return { ok: false, reason: "Negociação não encontrada." };
  const listing = await prisma.listing.findUnique({ where: { id: trade.listingId } });
  if (!listing) return { ok: false, reason: "Anúncio não encontrado." };
  if (listing.userId !== accepterId) return { ok: false, reason: "Apenas o dono do anúncio pode recusar." };
  if (trade.state !== TradeState.PENDING) return { ok: false, reason: "Esta negociação não está mais pendente." };
  const updated = await prisma.trade.update({
    where: { id: tradeId },
    data: { state: TradeState.CANCELLED, cancelledAt: new Date(), cancelReason: "recusada pelo dono do anúncio" },
  });
  await prisma.tradeEvent.create({
    data: { tradeId, actorId: accepterId, fromState: TradeState.PENDING, toState: TradeState.CANCELLED, note: "recusada" },
  });
  await bumpDenial(listing.userId, listing.type === "SELL" ? TradeRole.SELLER : TradeRole.BUYER);
  return { ok: true, trade: updated };
}

// Marca a conclusão de um lado; quando os dois confirmam, vira COMPLETED.
export async function markComplete(
  tradeId: string,
  userId: string,
): Promise<{ ok: true; trade: Trade; justCompleted: boolean } | { ok: false; reason: string }> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) return { ok: false, reason: "Negociação não encontrada." };
  if (trade.state !== TradeState.ACCEPTED && trade.state !== TradeState.IN_PROGRESS)
    return { ok: false, reason: "Não é possível concluir esta negociação agora." };
  const isBuyer = userId === trade.buyerId;
  const isSeller = userId === trade.sellerId;
  if (!isBuyer && !isSeller) return { ok: false, reason: "Você não faz parte desta negociação." };

  const buyerDone = trade.buyerCompleted || isBuyer;
  const sellerDone = trade.sellerCompleted || isSeller;
  const both = buyerDone && sellerDone;

  const updated = await prisma.trade.update({
    where: { id: tradeId },
    data: {
      buyerCompleted: buyerDone,
      sellerCompleted: sellerDone,
      state: both ? TradeState.COMPLETED : TradeState.IN_PROGRESS,
      completedAt: both ? new Date() : undefined,
    },
  });
  await prisma.tradeEvent.create({
    data: {
      tradeId,
      actorId: userId,
      toState: updated.state,
      note: both ? "concluída pelos dois lados" : "marcou como concluída",
    },
  });
  if (both) {
    await bumpCompleted(trade.buyerId, TradeRole.BUYER);
    await bumpCompleted(trade.sellerId, TradeRole.SELLER);
  }
  return { ok: true, trade: updated, justCompleted: both };
}

export async function cancelTrade(tradeId: string, userId: string, reason?: string): Promise<Result> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) return { ok: false, reason: "Negociação não encontrada." };
  if (!([TradeState.PENDING, TradeState.ACCEPTED, TradeState.IN_PROGRESS] as TradeState[]).includes(trade.state))
    return { ok: false, reason: "Não é possível cancelar esta negociação agora." };
  if (userId !== trade.buyerId && userId !== trade.sellerId)
    return { ok: false, reason: "Você não faz parte desta negociação." };

  // Devolve o estoque reservado, se já estava reservado.
  if (trade.state === TradeState.ACCEPTED || trade.state === TradeState.IN_PROGRESS) {
    await prisma.listing.update({
      where: { id: trade.listingId },
      data: { quantityAvailable: { increment: trade.quantity } },
    });
  }
  const updated = await prisma.trade.update({
    where: { id: tradeId },
    data: { state: TradeState.CANCELLED, cancelledAt: new Date(), cancelReason: reason ?? "cancelada" },
  });
  await prisma.tradeEvent.create({
    data: { tradeId, actorId: userId, fromState: trade.state, toState: TradeState.CANCELLED, note: reason ?? "cancelada" },
  });
  await bumpCancelled(userId, userId === trade.buyerId ? TradeRole.BUYER : TradeRole.SELLER);
  return { ok: true, trade: updated };
}

export async function openDispute(tradeId: string, userId: string, reason?: string): Promise<Result> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) return { ok: false, reason: "Negociação não encontrada." };
  if (trade.state !== TradeState.ACCEPTED && trade.state !== TradeState.IN_PROGRESS)
    return { ok: false, reason: "Só dá para abrir disputa numa negociação em andamento." };
  if (userId !== trade.buyerId && userId !== trade.sellerId)
    return { ok: false, reason: "Você não faz parte desta negociação." };

  await prisma.dispute.upsert({
    where: { tradeId },
    create: { tradeId, openedBy: userId, reason },
    update: {},
  });
  const updated = await prisma.trade.update({ where: { id: tradeId }, data: { state: TradeState.DISPUTED } });
  await prisma.tradeEvent.create({
    data: { tradeId, actorId: userId, fromState: trade.state, toState: TradeState.DISPUTED, note: reason ?? "disputa aberta" },
  });
  await bumpDispute(trade.buyerId, TradeRole.BUYER);
  await bumpDispute(trade.sellerId, TradeRole.SELLER);
  return { ok: true, trade: updated };
}

// Tickets de negociações já fechadas (concluídas/canceladas) há mais de `olderThanMs`.
export async function ticketsToCleanup(olderThanMs: number): Promise<{ id: string; ticketChannelId: string }[]> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const rows = await prisma.trade.findMany({
    where: {
      ticketChannelId: { not: null },
      OR: [
        { state: TradeState.COMPLETED, completedAt: { lt: cutoff } },
        { state: TradeState.CANCELLED, cancelledAt: { lt: cutoff } },
      ],
    },
    select: { id: true, ticketChannelId: true },
  });
  return rows.flatMap((r) => (r.ticketChannelId ? [{ id: r.id, ticketChannelId: r.ticketChannelId }] : []));
}

export async function clearTicketChannel(id: string): Promise<void> {
  await prisma.trade.update({ where: { id }, data: { ticketChannelId: null } });
}

// Expira solicitações não aceitas e manda para disputa as negociações travadas.
export async function sweepStaleTrades(): Promise<{ expired: number; disputed: number }> {
  const now = new Date();
  const expired = await prisma.trade.updateMany({
    where: { state: TradeState.PENDING, expiresAt: { lt: now } },
    data: { state: TradeState.EXPIRED },
  });

  const stale = await prisma.trade.findMany({
    where: { state: { in: [TradeState.ACCEPTED, TradeState.IN_PROGRESS] }, expiresAt: { lt: now } },
  });
  for (const t of stale) {
    await prisma.dispute.upsert({
      where: { tradeId: t.id },
      create: { tradeId: t.id, openedBy: "system", reason: "prazo de conclusão esgotado" },
      update: {},
    });
    await prisma.trade.update({ where: { id: t.id }, data: { state: TradeState.DISPUTED } });
    await prisma.tradeEvent.create({ data: { tradeId: t.id, toState: TradeState.DISPUTED, note: "timeout de conclusão" } });
  }
  return { expired: expired.count, disputed: stale.length };
}
