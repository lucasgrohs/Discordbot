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
  {
    key: "request_footer",
    label: "Negociação — rodapé da solicitação",
    placeholders: [],
    default: "Aceite confirma que a negociação existe — depois disso você não nega que ela aconteceu.",
  },
  {
    key: "ticket_instructions",
    label: "Ticket — instruções de conclusão",
    placeholders: [],
    default: "Combinem a entrega por aqui. Quando concluírem, **os dois** clicam em **Concluir**.",
  },
  {
    key: "ticket_footer",
    label: "Ticket — rodapé",
    placeholders: [],
    default: "A avaliação abre quando os dois confirmarem a conclusão.",
  },
  {
    key: "ticket_completed",
    label: "Ticket — negociação concluída",
    placeholders: [],
    default: "Os dois lados confirmaram. Obrigado!\n\n**Avalie o outro lado** (clique nas estrelas):",
  },
  {
    key: "ticket_disputed",
    label: "Ticket — disputa aberta",
    placeholders: [],
    default: "A equipe foi acionada e vai analisar o caso. O estoque permanece reservado até a resolução.",
  },
  {
    key: "buy_card_hint",
    label: "Card de pedido de compra — dica",
    placeholders: [],
    default: "_Tem o que ele procura? Clique em **Vender para ele**._",
  },
  {
    key: "restock_message",
    label: "DM de estoque esgotado (reestoque)",
    placeholders: ["{what}", "{server}"],
    default: [
      "Parabéns pela venda! 🎉 Seu anúncio de {what} (servidor **{server}**) foi **totalmente vendido** e encerrado automaticamente.",
      "",
      "**Quer continuar vendendo?**",
      "• Reabra um anúncio pelo painel **🏷️ VENDO** no canal de negociação.",
      "• Gerencie tudo em `/anuncios`.",
      "",
      "💎 Vendedores **VIP** (Kick/Booster) aparecem no topo e vendem mais rápido — fale com a staff.",
    ].join("\n"),
  },
  {
    key: "giveaway_join",
    label: "Sorteio — aviso de chegada por indicação",
    placeholders: ["{invited}", "{referrer}", "{total}"],
    default: "✨ <@{invited}> chegou por indicação de <@{referrer}>! ({total} convidado(s))",
  },
  // --- Títulos de embeds ---
  { key: "results_title", label: "Título — resultados do COMPRO", placeholders: ["{game}"], default: "🛒 Melhores vendedores — {game}" },
  { key: "sell_card_author", label: "Cabeçalho — card de venda", placeholders: [], default: "🏷️ Anúncio de venda" },
  { key: "buy_card_author", label: "Cabeçalho — card de compra", placeholders: [], default: "🛒 Pedido de compra" },
  { key: "request_title", label: "Título — solicitação de negociação", placeholders: [], default: "🤝 Nova solicitação de negociação" },
  { key: "ticket_title", label: "Título — ticket em andamento", placeholders: [], default: "🧾 Negociação em andamento" },
  { key: "ticket_completed_title", label: "Título — negociação concluída", placeholders: [], default: "🎉 Negociação concluída" },
  { key: "ticket_disputed_title", label: "Título — disputa aberta", placeholders: [], default: "⚠️ Disputa aberta" },
  { key: "restock_title", label: "Título — DM de estoque esgotado", placeholders: [], default: "📦 Seu estoque acabou!" },
  // --- Confirmações ---
  {
    key: "nego_sent",
    label: "Confirmação — solicitação enviada",
    placeholders: [],
    default: "✅ Solicitação enviada ao vendedor. Você entra no ticket assim que ele aceitar.",
  },
  {
    key: "trade_cancelled",
    label: "Confirmação — negociação cancelada",
    placeholders: [],
    default: "🚫 Negociação cancelada. O estoque reservado foi devolvido.",
  },
  {
    key: "rating_thanks",
    label: "Confirmação — avaliação registrada",
    placeholders: ["{rating}"],
    default: "✅ Avaliação de **{rating}★** registrada. Obrigado!",
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
