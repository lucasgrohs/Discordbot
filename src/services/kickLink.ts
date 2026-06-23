import { prisma } from "../db.js";
import type { KickLink } from "@prisma/client";

// Vincula uma conta Kick a um usuário do Discord (um Kick → um Discord).
export async function linkKick(discordUserId: string, kickUserId: string, kickUsername: string): Promise<KickLink> {
  // Garante que esse Kick não fique vinculado a outro Discord.
  await prisma.kickLink.deleteMany({ where: { kickUserId, NOT: { discordUserId } } });
  return prisma.kickLink.upsert({
    where: { discordUserId },
    create: { discordUserId, kickUserId, kickUsername },
    update: { kickUserId, kickUsername },
  });
}

export function getByKickUser(kickUserId: string): Promise<KickLink | null> {
  return prisma.kickLink.findUnique({ where: { kickUserId } });
}

export function getByDiscord(discordUserId: string): Promise<KickLink | null> {
  return prisma.kickLink.findUnique({ where: { discordUserId } });
}
