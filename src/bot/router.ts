import {
  Interaction,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
  MessageFlags,
} from "discord.js";
import { parseId } from "./customId.js";

export interface SlashCommand {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
  execute(i: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(i: AutocompleteInteraction): Promise<void>;
}

// A component handler is keyed by namespace (first segment of the custom_id).
export type ComponentHandler = (
  i: MessageComponentInteraction | ModalSubmitInteraction,
  args: string[],
  action: string,
) => Promise<void>;

const commands = new Map<string, SlashCommand>();
const components = new Map<string, ComponentHandler>();

export function registerCommand(cmd: SlashCommand): void {
  commands.set(cmd.data.name, cmd);
}

// Register a handler for every component custom_id starting with `ns:`.
export function registerComponent(ns: string, handler: ComponentHandler): void {
  components.set(ns, handler);
}

export function getCommandsJSON() {
  return [...commands.values()].map((c) => c.data.toJSON());
}

export async function routeInteraction(i: Interaction): Promise<void> {
  try {
    if (i.isChatInputCommand()) {
      const cmd = commands.get(i.commandName);
      if (!cmd) return;
      await cmd.execute(i);
      return;
    }

    if (i.isAutocomplete()) {
      const cmd = commands.get(i.commandName);
      if (!cmd?.autocomplete) {
        await i.respond([]);
        return;
      }
      await cmd.autocomplete(i);
      return;
    }

    if (i.isMessageComponent() || i.isModalSubmit()) {
      const { ns, action, args } = parseId(i.customId);
      const handler = components.get(ns);
      if (!handler) {
        await safeReply(i, "Esta interação expirou ou é inválida.");
        return;
      }
      await handler(i, args, action);
    }
  } catch (err) {
    console.error("[router] interaction error:", err);
    await safeReply(i, "❌ Ocorreu um erro ao processar a interação.");
  }
}

async function safeReply(i: Interaction, content: string): Promise<void> {
  if (!i.isRepliable()) return;
  try {
    if (i.replied || i.deferred) {
      await i.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await i.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch {
    /* interaction already gone */
  }
}
