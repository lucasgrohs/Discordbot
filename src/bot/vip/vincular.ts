import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { registerCommand } from "../router.js";
import { config } from "../../config.js";
import { generatePkce, randomState, buildAuthorizeUrl } from "../../kick/oauth.js";
import { putPending } from "../../kick/pending.js";

// Só registra o comando quando a Kick está configurada (gated).
if (config.kick.enabled)
  registerCommand({
    data: new SlashCommandBuilder()
      .setName("vincular-kick")
      .setDescription("Vincule sua conta da Kick para virar VIP ao assinar."),
    async execute(i) {
      const { verifier, challenge } = generatePkce();
    const state = randomState();
    putPending(state, i.user.id, verifier);
    const url = buildAuthorizeUrl(state, challenge);
    await i.reply({
      content: [
        "🔗 **Vincule sua conta da Kick** clicando no link abaixo e autorizando:",
        url,
        "",
        "Depois de vincular, sua **assinatura na Kick** vira **VIP Tier 1** automaticamente (e renova junto).",
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  },
});
