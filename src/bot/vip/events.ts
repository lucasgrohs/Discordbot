import { Events } from "discord.js";
import { client } from "../client.js";
import { syncBoostTier } from "../../services/vip.js";

// Concede/remove o cargo VIP Tier 2 quando o membro começa/deixa de dar Boost.
export function registerVipEvents(): void {
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      const was = "premiumSinceTimestamp" in oldMember ? oldMember.premiumSinceTimestamp : undefined;
      if (was === newMember.premiumSinceTimestamp) return; // boost não mudou
      await syncBoostTier(newMember);
    } catch (err) {
      console.error("[vip] memberUpdate:", err);
    }
  });
}
