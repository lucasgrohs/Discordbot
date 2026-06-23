import { Events, ChannelType } from "discord.js";
import { client } from "../client.js";
import { initGuildInvites, onInviteCreate, onInviteDelete, detectUsedInvite } from "./invites.js";
import { refreshGiveawayRanking } from "./board.js";
import { getGuildConfig } from "../../services/guildConfig.js";
import { getActiveGiveaway, recordEntry, invalidateEntryOnLeave } from "../../services/giveaways.js";
import { text } from "../../services/texts.js";

export function registerGiveawayEvents(): void {
  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) await initGuildInvites(guild);
    console.log("[giveaway] cache de convites inicializado.");
  });

  client.on(Events.InviteCreate, (inv) => onInviteCreate(inv));
  client.on(Events.InviteDelete, (inv) => onInviteDelete(inv));

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const giveaway = await getActiveGiveaway(member.guild.id);
      const code = await detectUsedInvite(member.guild); // sempre atualiza o cache
      if (!giveaway || member.user.bot || !code) return;

      const res = await recordEntry({
        giveaway,
        invitedUserId: member.id,
        inviteCode: code,
        accountCreatedAt: member.user.createdAt,
      });
      if (!res) return;

      const cfg = await getGuildConfig(member.guild.id);
      const feedChannelId = cfg.giveawayGuestsChannelId ?? giveaway.channelId;
      const ch = await client.channels.fetch(feedChannelId).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        const note =
          res.status === "INVALID"
            ? " _(não conta: conta muito nova)_"
            : res.status === "PENDING"
              ? " _(pendente até cumprir a permanência mínima)_"
              : "";
        const msg = text("giveaway_join", { invited: member.id, referrer: res.referrerId, total: res.total });
        await ch.send(`${msg}${note}`);
      }
      await refreshGiveawayRanking(member.guild.id);
    } catch (err) {
      console.error("[giveaway] memberAdd:", err);
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      const giveaway = await getActiveGiveaway(member.guild.id);
      if (!giveaway) return;
      await invalidateEntryOnLeave(giveaway.id, member.id);
      await refreshGiveawayRanking(member.guild.id);
    } catch (err) {
      console.error("[giveaway] memberRemove:", err);
    }
  });
}
