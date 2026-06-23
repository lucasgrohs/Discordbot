import { prisma } from "../db.js";
import { VipTier } from "@prisma/client";
import type { Guild, GuildMember } from "discord.js";
import { getGuildConfig } from "./guildConfig.js";

// Adiciona/remove o cargo VIP correspondente ao tier (se configurado).
async function applyRole(guild: Guild, userId: string, tier: VipTier, add: boolean): Promise<void> {
  const cfg = await getGuildConfig(guild.id);
  const roleId = tier === VipTier.KICK ? cfg.vipTier1RoleId : cfg.vipTier2RoleId;
  if (!roleId) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  if (add) await member.roles.add(roleId).catch(() => {});
  else await member.roles.remove(roleId).catch(() => {});
}

export async function grantVip(
  guild: Guild,
  userId: string,
  tier: VipTier,
  source: string,
  expiresAt?: Date | null,
): Promise<void> {
  await prisma.vipGrant.upsert({
    where: { userId_tier: { userId, tier } },
    create: { userId, tier, source, active: true, expiresAt: expiresAt ?? null },
    update: { active: true, source, expiresAt: expiresAt ?? null, revokedAt: null },
  });
  await applyRole(guild, userId, tier, true);
}

export async function revokeVip(guild: Guild, userId: string, tier: VipTier): Promise<void> {
  await prisma.vipGrant.updateMany({
    where: { userId, tier, active: true },
    data: { active: false, revokedAt: new Date() },
  });
  await applyRole(guild, userId, tier, false);
}

// Mantém o Tier 2 em sincronia com o boost do membro.
export async function syncBoostTier(member: GuildMember): Promise<void> {
  if (member.premiumSince) await grantVip(member.guild, member.id, VipTier.NITRO, "nitro");
  else await revokeVip(member.guild, member.id, VipTier.NITRO);
}

// Concede o Tier 2 a todos os boosters atuais (sincronização sob demanda).
export async function syncAllBoosters(guild: Guild): Promise<number> {
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return 0;
  let n = 0;
  for (const m of members.values()) {
    if (m.premiumSince) {
      await grantVip(guild, m.id, VipTier.NITRO, "nitro");
      n++;
    }
  }
  return n;
}

// Expira grants vencidos (ex.: sub da Kick que não renovou) e remove os cargos.
export async function sweepExpiredVips(guild: Guild): Promise<number> {
  const now = new Date();
  const expired = await prisma.vipGrant.findMany({ where: { active: true, expiresAt: { lt: now } } });
  for (const g of expired) {
    await prisma.vipGrant.update({ where: { id: g.id }, data: { active: false, revokedAt: now } });
    await applyRole(guild, g.userId, g.tier, false);
  }
  return expired.length;
}

export function getActiveVips(userId: string) {
  return prisma.vipGrant.findMany({
    where: { userId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  });
}
