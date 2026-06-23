import { prisma } from "../db.js";

export async function logTicketMessage(input: {
  tradeId: string;
  authorId: string;
  authorTag: string;
  content: string;
}): Promise<void> {
  await prisma.ticketMessage.create({ data: input });
}

// Monta a transcrição (texto) das mensagens registradas de um ticket.
export async function getTranscript(tradeId: string): Promise<string> {
  const rows = await prisma.ticketMessage.findMany({
    where: { tradeId },
    orderBy: { createdAt: "asc" },
  });
  return rows
    .map((r) => `[${r.createdAt.toISOString()}] ${r.authorTag}: ${r.content}`)
    .join("\n");
}
