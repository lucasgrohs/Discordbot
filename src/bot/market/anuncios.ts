import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { registerCommand } from "../router.js";
import { listUserListings } from "../../services/listings.js";
import { myListingsMessage } from "./render.js";

registerCommand({
  data: new SlashCommandBuilder().setName("anuncios").setDescription("Gerencie os seus anúncios de compra e venda."),

  async execute(i) {
    const listings = await listUserListings(i.user.id);
    await i.reply({ ...myListingsMessage(listings), flags: MessageFlags.Ephemeral });
  },
});
