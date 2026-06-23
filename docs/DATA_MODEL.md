# Fase 0 — Modelo de dados

Mapeamento dos modelos do `prisma/schema.prisma` para o desenho do produto
(`PLANO_RMT_BOT.md`) e as decisões técnicas por trás de cada um.

> Base reaproveitada do antigo shop-bot (descontinuado). Migration inicial:
> `prisma/migrations/20260623032153_init`.

## Mapa de modelos

| Modelo | Seção do plano | Responsabilidade |
|---|---|---|
| `Game` | §1, §8 | Jogo + config de marketplace (unidade, moeda, canal, TTL, allowlist via `marketStatus`/`marketplaceEnabled`). |
| `GameServer` | §3.1, §8 | Servidores/regiões de um jogo → viram os botões do anúncio. |
| `Listing` | §3 | Anúncio COMPRO/VENDO + ciclo de vida do estoque. |
| `Trade` | §2 | **Negociação oficial — entidade central.** Máquina de estados. |
| `TradeEvent` | §2, §6 | Auditoria de cada transição de estado. |
| `Review` | §5.1 | Avaliação dos dois lados, 1 por (negociação, avaliador). |
| `UserReputation` | §5.3 | Agregado por usuário+papel; `score` alimenta o ranking. |
| `VipGrant` | §4 | Concessão de VIP (Kick/Nitro) com validade. |
| `KickLink` | §4, §10 | Vínculo OAuth Kick↔Discord; tokens criptografados. |
| `Block` / `Report` / `Sanction` | §7 | Bloqueio, denúncia e punições. |
| `Dispute` | §6, §10 | Disputa de uma negociação; único lugar com comprovante. |
| `Giveaway` / `ReferralCode` / `ReferralEntry` | §9 | Sorteio com convite qualificado. |

## Decisões técnicas

- **`Trade` é o núcleo.** Estados: `PENDING → ACCEPTED → IN_PROGRESS → COMPLETED`,
  com `CANCELLED`/`DISPUTED`/`EXPIRED`. O vendedor aceita em `PENDING→ACCEPTED`
  (compromete-se cedo, não nega depois). A avaliação só abre em `COMPLETED`.
- **Conclusão mútua** via `buyerCompleted` + `sellerCompleted`. Se um lado trava,
  `expiresAt` força timeout → `DISPUTED`. A trava de propósito vira `denialCount`
  na reputação.
- **Estoque com reserva** no `Listing` (`quantityTotal` vs `quantityAvailable`):
  reserva ao aceitar, devolve ao cancelar, baixa ao concluir. `expiresAt`/`status`
  cuidam da expiração (24/48/72h via `Game.listingTtlHours`).
- **Ranking não usa média simples.** `UserReputation.score` guarda a nota com
  encolhimento estatístico (bayesiano/Wilson) — calculado ao concluir/avaliar,
  para o ranking ser uma leitura barata e indexada (`@@index([role, score])`).
- **VIP é bônus, não prioridade absoluta.** `VipGrant` só marca o tier; o peso é
  aplicado no matching (Fase 2), não no banco.
- **Comprovante só em disputa.** Não há campo de comprovante no fluxo normal —
  `Dispute.proofUrls` é o único lugar, com retenção curta (limpo por job). Minimiza
  superfície de dados (§10).
- **Referências soltas onde acoplar não compensa:** `Report.tradeId`,
  `Sanction.gameId` são `String?` sem FK (categorização cross-cutting).
- **Cascatas:** filhos de `Game`/`Listing`/`Trade`/`Giveaway` usam
  `onDelete: Cascade`.

## Pendências de modelo (Fases futuras)

- Calibragem dos pesos do matching (Fase 2) — vivem em código/config, não no schema.
- Possível `ContactLog` se quisermos métricas de "lista mostrada" além da `Trade`.
- Criptografia real dos tokens da `KickLink` (Fase 6) — hoje só o campo existe.
