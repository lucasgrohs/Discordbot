// Helpers to build/parse component custom_ids.
// Format: "<namespace>:<action>:<arg1>:<arg2>..."  (max 100 chars by Discord rule)
const SEP = ":";

export function buildId(ns: string, action: string, ...args: (string | number)[]): string {
  const id = [ns, action, ...args.map(String)].join(SEP);
  if (id.length > 100) throw new Error(`custom_id too long (${id.length}): ${id}`);
  return id;
}

export interface ParsedId {
  ns: string;
  action: string;
  args: string[];
}

export function parseId(customId: string): ParsedId {
  const [ns, action, ...args] = customId.split(SEP);
  return { ns: ns ?? "", action: action ?? "", args };
}
