import { prisma } from "../db.js";

export interface SettingDef {
  key: string;
  label: string;
  group: string;
  default: number;
}

// Knobs de comportamento ajustáveis pelo painel.
export const SETTING_DEFS: SettingDef[] = [
  { key: "match_w_rep", label: "Peso: reputação", group: "Matching (ranking)", default: 0.4 },
  { key: "match_w_price", label: "Peso: preço", group: "Matching (ranking)", default: 0.35 },
  { key: "match_w_completion", label: "Peso: taxa de conclusão", group: "Matching (ranking)", default: 0.15 },
  { key: "match_w_recency", label: "Peso: recência", group: "Matching (ranking)", default: 0.05 },
  { key: "vip_bonus_kick", label: "Bônus VIP Tier 1 (Kick)", group: "Matching (ranking)", default: 0.3 },
  { key: "vip_bonus_nitro", label: "Bônus VIP Tier 2 (Booster)", group: "Matching (ranking)", default: 0.15 },
  { key: "accept_window_hours", label: "Prazo p/ vendedor aceitar (horas)", group: "Negociação", default: 24 },
  { key: "complete_window_hours", label: "Prazo de conclusão (horas)", group: "Negociação", default: 48 },
  { key: "min_per_trade", label: "Mínimo por negociação (unidades brutas)", group: "Negociação", default: 1000 },
  { key: "ticket_cleanup_hours", label: "Apagar ticket fechado após (horas)", group: "Negociação", default: 1 },
];

const cache = new Map<string, number>();

export async function loadSettings(): Promise<void> {
  const rows = await prisma.setting.findMany();
  cache.clear();
  for (const r of rows) {
    const n = Number(r.value);
    if (Number.isFinite(n)) cache.set(r.key, n);
  }
}

export function getNum(key: string): number {
  const def = SETTING_DEFS.find((d) => d.key === key);
  return cache.get(key) ?? def?.default ?? 0;
}

export async function setSetting(key: string, value: number): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value: String(value) }, update: { value: String(value) } });
  cache.set(key, value);
}

export function listSettings(): Array<SettingDef & { value: number }> {
  return SETTING_DEFS.map((d) => ({ ...d, value: cache.get(d.key) ?? d.default }));
}
