import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
  TextChannel,
} from "discord.js";
import { registerComponent } from "../router.js";
import { client } from "../client.js";
import { buildId } from "../customId.js";
import { onInviteCreate } from "./invites.js";
import {
  getActiveGiveaway,
  getLatestGiveaway,
  findReferralCode,
  createReferralCode,
  updateReferralCode,
  topReferrers,
  entryStats,
} from "../../services/giveaways.js";

export const GV = "gv";
const EPH = MessageFlags.Ephemeral;

type AnyInteraction = ChatInputCommandInteraction | ButtonInteraction;

// /meu-convite e botão "Pegar meu link".
export async function handleMyInvite(i: AnyInteraction): Promise<void> {
  if (!i.guildId || !i.guild) return;
  const giveaway = await getActiveGiveaway(i.guildId);
  if (!giveaway) {
    await i.reply({ content: "Não há sorteio ativo no momento.", flags: EPH });
    return;
  }
  const ch = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) {
    await i.reply({ content: "Canal do sorteio indisponível. Avise um admin.", flags: EPH });
    return;
  }
  const channel = ch as TextChannel;

  let rc = await findReferralCode(giveaway.id, i.user.id);
  if (rc) {
    const exists = await i.guild.invites
      .fetch()
      .then((all) => all.has(rc!.code))
      .catch(() => false);
    if (!exists) {
      const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: true });
      onInviteCreate(invite);
      rc = await updateReferralCode(rc.id, invite.code);
    }
  } else {
    const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: true });
    onInviteCreate(invite);
    rc = await createReferralCode(giveaway.id, i.user.id, invite.code);
  }

  await i.reply({
    content: `🔗 Seu link de convite: https://discord.gg/${rc.code}\nCompartilhe! Cada pessoa nova que entrar por ele conta pontos pra você.`,
    flags: EPH,
  });
}

// /ranksorteio e botão "Ranking".
export async function handleRanking(i: AnyInteraction): Promise<void> {
  if (!i.guildId) return;
  const giveaway = (await getActiveGiveaway(i.guildId)) ?? (await getLatestGiveaway(i.guildId));
  if (!giveaway) {
    await i.reply({ content: "Nenhum sorteio encontrado.", flags: EPH });
    return;
  }
  const rows = await topReferrers(giveaway.id);
  const embed = new EmbedBuilder().setTitle(`🏆 Ranking — ${giveaway.title}`).setColor(0xf1c40f);
  if (rows.length === 0) {
    embed.setDescription("Ainda não há indicações.");
  } else {
    const medals = ["🥇", "🥈", "🥉"];
    embed.setDescription(
      rows
        .slice(0, 10)
        .map((r, idx) => `${medals[idx] ?? `**${idx + 1}.**`} <@${r.referrerId}> — ${r.count} indicação(ões)`)
        .join("\n"),
    );
  }
  await i.reply({ embeds: [embed], flags: EPH });
}

// /sorteio status e botão "Status".
export async function handleStatus(i: AnyInteraction): Promise<void> {
  if (!i.guildId) return;
  const giveaway = (await getActiveGiveaway(i.guildId)) ?? (await getLatestGiveaway(i.guildId));
  if (!giveaway) {
    await i.reply({ content: "Nenhum sorteio encontrado.", flags: EPH });
    return;
  }
  const stats = await entryStats(giveaway.id);
  await i.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`📊 ${giveaway.title}`)
        .setColor(0x4361ee)
        .setDescription(
          [
            `Estado: **${giveaway.status}** · Modo: **${giveaway.mode}**`,
            `Regras: conta ≥ ${giveaway.minAccountAgeDays}d · permanência ≥ ${giveaway.minStayDays}d`,
            "",
            `✅ Válidas: **${stats.valid}** · ⏳ Pendentes: **${stats.pending}** · ❌ Inválidas: **${stats.invalid}**`,
          ].join("\n"),
        ),
    ],
    flags: EPH,
  });
}

// Botões do painel de abertura do sorteio.
registerComponent(GV, async (i, _args, action) => {
  if (!i.isButton()) return;
  if (action === "link") await handleMyInvite(i);
  else if (action === "rank") await handleRanking(i);
  else if (action === "status") await handleStatus(i);
});

export function kickoffButtonsId(action: string): string {
  return buildId(GV, action);
}
