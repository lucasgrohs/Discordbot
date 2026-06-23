import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { registerCommand } from "../router.js";
import { topSellers, getReputation } from "../../services/reputation.js";
import { rankingEmbed, reputationEmbed } from "./render.js";
import { TradeRole } from "@prisma/client";

const EPH = MessageFlags.Ephemeral;

registerCommand({
  data: new SlashCommandBuilder().setName("ranking").setDescription("Top 10 vendedores por reputação."),
  async execute(i) {
    const rows = await topSellers(10);
    await i.reply({ ...rankingEmbed(rows), flags: EPH });
  },
});

registerCommand({
  data: new SlashCommandBuilder()
    .setName("reputacao")
    .setDescription("Mostra a reputação de um usuário (ou a sua).")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário (padrão: você)")),
  async execute(i) {
    const target = i.options.getUser("usuario") ?? i.user;
    const [seller, buyer] = await Promise.all([
      getReputation(target.id, TradeRole.SELLER),
      getReputation(target.id, TradeRole.BUYER),
    ]);
    await i.reply({ ...reputationEmbed(target.id, seller, buyer), flags: EPH });
  },
});
