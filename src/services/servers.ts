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

export function removeServer(id: string): Promise<GameServer> {
  return prisma.gameServer.delete({ where: { id } });
}
