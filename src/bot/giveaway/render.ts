import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { Giveaway } from "@prisma/client";
import { buildId } from "../customId.js";

const GV = "gv";

// Mensagem-painel de abertura postada em sorteios-ativos, com botões.
export function giveawayKickoffMessage(giveaway: Giveaway) {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.title}`)
    .setColor(0xf1c40f)
    .setDescription(
      [
        "Sorteio por indicação começou! Traga gente nova e concorra. 🏆",
        "",
        "**Como participar:**",
        "• Clique em **🔗 Pegar meu link** e compartilhe.",
        "• Cada pessoa nova que entrar pelo seu link conta ponto pra você.",
        "• Acompanhe o **ranking** e o resultado em **ganhadores** nas salas da categoria.",
        "",
        `Regras: conta com no mínimo **${giveaway.minAccountAgeDays} dia(s)** · permanência mínima de **${giveaway.minStayDays} dia(s)**.`,
      ].join("\n"),
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildId(GV, "link")).setLabel("Pegar meu link").setEmoji("🔗").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(buildId(GV, "status")).setLabel("Infos").setEmoji("ℹ️").setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

// Mensagem de ranking mantida (editada) no canal ranking.
export function giveawayRankingBoard(giveaway: Giveaway | null, rows: { referrerId: string; count: number }[]) {
  const embed = new EmbedBuilder().setColor(0xf1c40f);
  if (!giveaway) {
    embed.setTitle("🏆 Ranking de indicações").setDescription("Nenhum sorteio ativo no momento.");
    return { embeds: [embed] };
  }
  embed.setTitle(`🏆 Ranking — ${giveaway.title}`).setFooter({ text: "Atualizado automaticamente." });
  if (rows.length === 0) {
    embed.setDescription("Ainda não há indicações. Use `/meu-convite` para começar!");
    return { embeds: [embed] };
  }
  const medals = ["🥇", "🥈", "🥉"];
  embed.setDescription(
    rows
      .slice(0, 10)
      .map((r, idx) => `${medals[idx] ?? `**${idx + 1}.**`} <@${r.referrerId}> — ${r.count} indicação(ões)`)
      .join("\n"),
  );
  return { embeds: [embed] };
}

// Registro de um sorteio encerrado, postado no canal ganhadores.
export function winnersRecordMessage(
  giveaway: Giveaway,
  winners: string[],
  stats: { valid: number; pending: number; invalid: number },
) {
  const when = giveaway.endsAt ?? new Date();
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`🏆 ${giveaway.title} — Encerrado`)
        .setColor(0x2b9348)
        .setDescription(
          [
            `**Vencedor(es):** ${winners.length ? winners.map((w) => `<@${w}>`).join(", ") : "_sem indicações válidas_"}`,
            `**Indicações válidas:** ${stats.valid}`,
            `**Encerrado em:** <t:${Math.floor(when.getTime() / 1000)}:f>`,
          ].join("\n"),
        ),
    ],
  };
}
