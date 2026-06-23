import type { Guild, Invite } from "discord.js";

// guildId -> (inviteCode -> usos), para detectar qual convite foi usado num join.
const cache = new Map<string, Map<string, number>>();

export async function initGuildInvites(guild: Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch();
    const m = new Map<string, number>();
    for (const inv of invites.values()) m.set(inv.code, inv.uses ?? 0);
    cache.set(guild.id, m);
  } catch {
    /* sem permissão Gerenciar Servidor */
  }
}

export function onInviteCreate(invite: Invite): void {
  if (!invite.guild) return;
  const m = cache.get(invite.guild.id) ?? new Map<string, number>();
  m.set(invite.code, invite.uses ?? 0);
  cache.set(invite.guild.id, m);
}

export function onInviteDelete(invite: Invite): void {
  if (!invite.guild) return;
  cache.get(invite.guild.id)?.delete(invite.code);
}

// Retorna o código cujo número de usos aumentou desde o último cache (e atualiza).
export async function detectUsedInvite(guild: Guild): Promise<string | null> {
  let used: string | null = null;
  try {
    const invites = await guild.invites.fetch();
    const prev = cache.get(guild.id) ?? new Map<string, number>();
    const next = new Map<string, number>();
    for (const inv of invites.values()) {
      const before = prev.get(inv.code) ?? 0;
      const now = inv.uses ?? 0;
      next.set(inv.code, now);
      if (now > before && used === null) used = inv.code;
    }
    cache.set(guild.id, next);
  } catch {
    /* sem permissão */
  }
  return used;
}
