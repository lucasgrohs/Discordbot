import { PrismaClient, TradeUnit, MarketCurrency } from "@prisma/client";

const prisma = new PrismaClient();

// Seed de exemplo para o marketplace RMT (idempotente por slug).
// Cria um jogo de diamantes com alguns servidores, para testar a Fase 1+.
async function main() {
  const game = await prisma.game.upsert({
    where: { slug: "exemplo" },
    update: {},
    create: {
      slug: "exemplo",
      name: "Jogo de Exemplo",
      emoji: "💎",
      tradeUnit: TradeUnit.DIAMOND,
      currency: MarketCurrency.BRL,
      baseQuantity: 1000,
      marketplaceEnabled: true,
      sortOrder: 1,
    },
  });

  const servers = ["Sul", "Sudeste", "Global"];
  for (let idx = 0; idx < servers.length; idx++) {
    const name = servers[idx];
    const exists = await prisma.gameServer.findFirst({ where: { gameId: game.id, name } });
    if (!exists) {
      await prisma.gameServer.create({ data: { gameId: game.id, name, sortOrder: idx } });
    }
  }

  console.log(`Seed concluído: jogo "${game.name}" com ${servers.length} servidores.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
