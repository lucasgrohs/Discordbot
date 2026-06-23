import { prisma } from "../db.js";

// Registra uma ação administrativa na trilha de auditoria (§1 do plano).
export async function logAction(params: {
  guildId: string;
  actorId: string;
  action: string;
  target?: string;
  details?: string;
}): Promise<void> {
  await prisma.auditLog.create({ data: params });
}
