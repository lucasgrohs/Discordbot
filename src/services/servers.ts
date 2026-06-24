import { prisma } from "../db.js";
import type { GameServer } from "@prisma/client";

export function listServers(gameId: string, opts?: { onlyActive?: boolean }): Promise<GameServer[]> {
  return prisma.gameServer.findMany({
    where: { gameId, ...(opts?.onlyActive ? { active: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function getServer(id: string): Promise<GameServer | null> {
  return prisma.gameServer.findUnique({ where: { id } });
}

// Busca servidores de um jogo por nome para autocomplete (até 25).
export function searchServers(gameId: string, query: string): Promise<GameServer[]> {
  return prisma.gameServer.findMany({
    where: {
      gameId,
      ...(query ? { name: { contains: query, mode: "insensitive" } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 25,
  });
}

export function addServer(input: { gameId: string; name: string; region?: string | null }): Promise<GameServer> {
  return prisma.gameServer.create({
    data: { gameId: input.gameId, name: input.name, region: input.region ?? null },
  });
}

// Encontra um servidor do jogo pelo nome (sem diferenciar maiúsculas/espaços) ou
// cria um novo. Usado quando o próprio vendedor/comprador digita o servidor, em vez
// de o admin cadastrá-lo. Normaliza o nome para evitar duplicatas ("BR-01" vs "br 01").
// Retorna null se o nome ficar vazio depois de limpo.
export async function findOrCreateServer(gameId: string, rawName: string): Promise<GameServer | null> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name) return null;
  const existing = await prisma.gameServer.findFirst({
    where: { gameId, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) return existing;
  return prisma.gameServer.create({ data: { gameId, name } });
}

export function removeServer(id: string): Promise<GameServer> {
  return prisma.gameServer.delete({ where: { id } });
}
