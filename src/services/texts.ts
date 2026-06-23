import { prisma } from "../db.js";

export interface TextDef {
  key: string;
  label: string;
  placeholders: string[];
  default: string;
}

// Textos editáveis pelo painel web. O `default` é o valor atual (fallback até editar).
export const TEXT_DEFS: TextDef[] = [
  {
    key: "panel_description",
    label: "Painel COMPRO/VENDO — descrição",
    placeholders: ["{unit}"],
    default: [
      "Compre e venda **{unit}** com outros jogadores.",
      "",
      "🛒 **COMPRO** — receba no privado os melhores vendedores para o que procura.",
      "🏷️ **VENDO** — anuncie seu estoque e apareça para os compradores.",
    ].join("\n"),
  },
  {
    key: "panel_footer",
    label: "Painel COMPRO/VENDO — rodapé",
    placeholders: [],
    default: "Negocie com segurança. Avaliações e reputação valem ponto.",
  },
  {
    key: "vip_pitch",
    label: "Chamada VIP (ao anunciar venda/compra)",
    placeholders: [],
    default: [
      "💎 **Quer destaque?** Membros **VIP** aparecem no topo do ranking e das buscas:",
      "• **Tier 1** — assinante na Kick",
      "• **Tier 2** — Booster do servidor (Nitro)",
      "Fale com a staff para ativar o seu selo.",
    ].join("\n"),
  },
  {
    key: "giveaway_kickoff",
    label: "Sorteio — mensagem de abertura",
    placeholders: ["{minAccountAgeDays}", "{minStayDays}"],
    default: [
      "Sorteio por indicação começou! Traga gente nova e concorra. 🏆",
      "",
      "**Como participar:**",
      "• Clique em **🔗 Pegar meu link** e compartilhe.",
      "• Cada pessoa nova que entrar pelo seu link conta ponto pra você.",
      "• Acompanhe o **ranking** e o resultado em **ganhadores** nas salas da categoria.",
      "",
      "Regras: conta com no mínimo **{minAccountAgeDays} dia(s)** · permanência mínima de **{minStayDays} dia(s)**.",
    ].join("\n"),
  },
];

const cache = new Map<string, string>();

export async function loadTexts(): Promise<void> {
  const rows = await prisma.botText.findMany();
  cache.clear();
  for (const r of rows) cache.set(r.key, r.value);
}

export function getText(key: string): string {
  const def = TEXT_DEFS.find((d) => d.key === key);
  return cache.get(key) ?? def?.default ?? "";
}

// Substitui {placeholders} pelos valores.
export function applyVars(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// Atalho: pega o texto e já aplica os placeholders.
export function text(key: string, vars: Record<string, string | number> = {}): string {
  return applyVars(getText(key), vars);
}

export async function setText(key: string, value: string): Promise<void> {
  await prisma.botText.upsert({ where: { key }, create: { key, value }, update: { value } });
  cache.set(key, value);
}

export function listTexts(): Array<TextDef & { value: string }> {
  return TEXT_DEFS.map((d) => ({ ...d, value: cache.get(d.key) ?? d.default }));
}
