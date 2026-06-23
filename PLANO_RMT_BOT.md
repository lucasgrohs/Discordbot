# Plataforma de Classificados RMT + Sorteio por Indicação (Bot de Discord)

**Plataforma:** Discord
**Stack:** Node.js + TypeScript + discord.js v14 + Prisma + PostgreSQL
**Base:** construído sobre um bot existente (esqueleto de comandos, painéis e banco já prontos)

> **Importante sobre o escopo:** isto não é apenas um "bot de anúncios". É uma
> **plataforma de classificados com reputação, negociação rastreada, moderação e
> antifraude**. O núcleo é a negociação oficial (entidade `Trade`); ranking, VIP e
> sorteios vêm depois dela.

---

## 1. Visão geral

Um bot de Discord com dois produtos integrados:

1. **Marketplace P2P (RMT)** — usuários anunciam compra e venda de diamantes (ou
   itens) de jogos. O comprador encontra vendedores, abre uma negociação oficial
   e, ao concluir, avalia o vendedor.
2. **Sorteio por indicação** — eventos onde quem mais traz gente nova (de verdade)
   pro servidor concorre a prêmios.

A regra de ouro do projeto: **nada de reputação, VIP ou sorteio sem antes ter a
negociação rastreada e protegida contra fraude.**

---

## 2. Conceito central — a Negociação (`Trade`)

Toda interação de compra vira uma **negociação oficial** registrada no banco, com
estados bem definidos:

`PENDING` → `ACCEPTED` → `IN_PROGRESS` → `COMPLETED`
e os caminhos alternativos `CANCELLED`, `DISPUTED`, `EXPIRED`.

**Fluxo:**

1. Comprador recebe a lista de vendedores e clica em **Negociar** num vendedor
   específico.
2. O vendedor recebe a solicitação e **aceita ou recusa** (aqui ele já se
   compromete — não pode negar depois que a venda existiu).
3. Ao aceitar, o bot cria a negociação e abre um **ticket privado** (ver seção 6).
4. Ambos negociam; o estoque do anúncio fica **reservado**.
5. Os dois podem marcar **Concluída**, **Cancelada** ou **Abrir disputa**.
6. Só depois de **concluída** a avaliação é liberada.

**Travas:**

- O vendedor aceita **no início** → não consegue negar a venda depois.
- Se um lado marca "concluída" e o outro some, há **timeout** → vira `DISPUTED`.
- Travar de propósito no `COMPLETED` para fugir de nota entra como **taxa de
  não-conclusão** no perfil do vendedor (mesmo tratamento de recusa em massa).

---

## 3. Marketplace — anúncios e matching

### 3.1 COMPRO / VENDO

No canal do jogo, o bot mantém um painel fixo com **COMPRO** e **VENDO**.

**VENDO** — o vendedor preenche: servidor · quantidade em estoque · valor por 1k ·
(nome do item, se o jogo for de item).

**COMPRO** — o comprador preenche: servidor · quantidade que procura · valor por 1k
que paga. O bot devolve a lista de vendedores compatíveis.

### 3.2 Ciclo de vida do estoque

Cada anúncio tem:

- Quantidade inicial e **quantidade disponível**.
- Quantidade mínima e máxima por negociação.
- Data de criação e **expiração** (24/48/72h sem atualização → expira).
- Botões **Atualizar estoque**, **Pausar**, **Renovar** e **Encerrar**.
- **Reserva temporária** quando uma negociação é aceita.
- **Devolução** automática ao estoque se a negociação for cancelada.
- **Baixa** no estoque quando a negociação é concluída.

> Isso resolve o pior problema de marketplace em Discord: lista cheia de anúncio
> velho de quem não tem mais o produto.

### 3.3 Matching por pontuação (não por prioridade absoluta)

Quando alguém quer comprar **X** diamantes, o bot filtra os anúncios compatíveis
(jogo + servidor + estoque suficiente) e os ordena por uma **pontuação**:

| Fator                                | Peso          |
|--------------------------------------|---------------|
| Estoque suficiente                   | **obrigatório** |
| Reputação e negociações concluídas   | alto          |
| Preço por 1k                         | alto          |
| Taxa de resposta e de conclusão      | médio         |
| VIP (Kick ou Booster)                | bônus         |
| Anúncio atualizado recentemente      | bônus pequeno |

O VIP é um **bônus de posicionamento**, não um "vence tudo". Um VIP caro e mal
avaliado não passa na frente de um vendedor comum confiável e barato. Os anúncios
VIP aparecem com selo claro (**Destaque** / **Apoiador**), sem esconder que há
impulso no posicionamento.

O comprador também pode escolher a ordenação:

- **Melhor preço**
- **Mais confiável**
- **Entrega rápida**
- **Recomendado pelo sistema** (a pontuação acima)

---

## 4. Tiers VIP (Kick e Boost)

O cargo VIP é concedido e removido **automaticamente pelo bot** e funciona como
bônus no matching (seção 3.3):

| Tier        | Origem                    | Bônus    |
|-------------|---------------------------|----------|
| **Tier 1**  | Assinatura (sub) na Kick  | maior    |
| **Tier 2**  | Nitro / Boost no servidor | menor    |

**Integração com a Kick (OAuth):**

1. Usuário usa `/vincular-kick` e recebe um botão de login oficial da Kick (OAuth).
2. Autoriza o aplicativo (escopo de leitura de conta + assinatura de eventos).
3. O bot relaciona `discordUserId` ↔ `kickUserId`.
4. Evento de assinatura/renovação → concede o cargo e guarda a validade (`expires_at`).
5. Validade vencida sem renovação → remove o cargo.

> **Ponto de atenção:** a API pública da Kick entrega eventos de nova assinatura e
> renovação, mas não há (até agora) consulta documentada para listar
> retroativamente todos os assinantes ativos. Quem já era assinante antes de
> vincular pode precisar esperar a renovação ou passar por sincronização manual.

**Boost do Discord:** detectado automaticamente pelo campo `premium_since` nas
atualizações de membro.

---

## 5. Reputação e ranking

### 5.1 Avaliação (dos dois lados)

- A avaliação só abre **depois da negociação concluída** (`COMPLETED`).
- O **comprador avalia o vendedor** e o **vendedor avalia o comprador**
  (nota + comentário curto).
- Sem fila de staff: a avaliação é **automática**. A staff entra **só em
  disputas e denúncias** (revisar toda negociação não escala).

### 5.2 Reputação do comprador

Compradores também causam problema (reservam estoque e somem, abrem disputa falsa).
O perfil mostra: negociações concluídas · taxa de cancelamento · disputas · tempo
médio de resposta · conta verificada · tempo no servidor. O vendedor pode exigir um
nível mínimo de confiança do comprador para aceitar.

### 5.3 Ranking com confiança estatística

Média simples é manipulável (1 avaliação 5,0 não pode ganhar de 200 avaliações 4,8).
O ranking pondera **média + número de negociações + recência + taxa de conclusão +
disputas**, com uma fórmula que **encolhe a nota de quem tem poucas avaliações**
(modelo bayesiano simples / Wilson), para contas novas não dominarem.

---

## 6. Negociação protegida (ticket privado)

Quando o vendedor aceita, o bot abre um **ticket privado dentro do servidor** (não
depende de DM, resolve quem bloqueia mensagens privadas). O ticket tem:

- Resumo do pedido, preço e quantidade acordados.
- Botões **Concluir**, **Cancelar**, **Abrir disputa**, **Enviar comprovante**.
- Histórico de alterações.

**Comprovante:** opcional, exigido **só quando há disputa**. Retenção curta, acesso
restrito à staff e exclusão automática depois do prazo (minimiza dados sensíveis).

---

## 7. Moderação e antifraude

- **Denunciar** vendedor/comprador · **Bloquear** usuário · **Não recomendar**.
- Histórico de advertências, **suspensão temporária** de anúncios, **banimento**
  por jogo ou global.
- Disputas com fila própria da staff.
- Regras claras e canais de denúncia (exigência das políticas do Discord).

---

## 8. Regras específicas por jogo

Cada jogo tem: unidade comercializada (diamantes/gold/itens) · quantidade base
(100, 1.000, 1 mi) · moeda (BRL/USD) · servidores e regiões · campos personalizados
· aviso de risco · status (habilitado/suspenso/encerrado).

**Allowlist:** o administrador só ativa o marketplace de um jogo depois de conferir
as regras daquele jogo sobre comércio externo.

---

## 9. Sorteio por indicação

O método de "contar usos de convite" é frágil (alts, convites apagados, vanity URL,
entradas simultâneas). Modelo mais seguro:

- Cada participante usa `/meu-convite` → o bot gera um **código exclusivo** ligado a ele.
- A entrada de um indicado começa **pendente** e só vira **válida** após as regras.

**Regras de validação:** idade mínima da conta · não ser bot · passar pelo
Membership Screening · permanecer X dias no servidor · não contar saída/reentrada ·
não contar quem já foi membro · detectar grupos que se indicam em ciclo · staff pode
invalidar com motivo · ranking mostra pendentes / válidas / invalidadas.

**Modos de premiação:** TOP 1/3/10 · sorteio aleatório entre indicações válidas ·
sorteio dentro do TOP 30 · misto (ranking + aleatório) · meta coletiva que libera
prêmio extra.

> Os **Community Invites** do Discord permitem convites que entregam cargo
> automaticamente ou restritos a usuários — úteis para campanhas VIP e eventos.

---

## 10. Proteção de dados (LGPD)

O bot guarda IDs do Discord, vínculo com a Kick, avaliações, denúncias e
(eventualmente) comprovantes. Exige:

- Política de privacidade + termos de uso + prazo de retenção.
- `/meus-dados` e `/excluir-meus-dados`.
- Controle de acesso da staff + **criptografia dos tokens da Kick**.
- Logs sem dados bancários · exclusão automática de comprovantes antigos.

---

## 11. Fases de entrega

| Fase  | Entrega                                                              |
|-------|---------------------------------------------------------------------|
| **0** | Regras do produto, fluxos, permissões e modelagem do banco          |
| **1** | Base administrativa: jogos, servidores, canais, cargos e auditoria  |
| **2** | Anúncios COMPRO/VENDO, estoque, expiração e matching                |
| **3** | Negociação oficial (`Trade`), reserva de estoque, tickets, conclusão|
| **4** | Reputação, ranking, denúncias, bloqueios e disputas                 |
| **5** | Sorteios, convites qualificados e proteção contra contas falsas     |
| **6** | Kick OAuth, assinaturas, Boost e tiers VIP                          |
| **7** | Painel web, métricas, relatórios e antifraude avançado              |

> **Linha de lançamento (MVP):** as fases **0 a 4** já formam um produto que pode
> abrir ao público (marketplace + negociação rastreada + reputação). VIP/Kick
> (fase 6) e painel web (fase 7) são **expansão** e não devem segurar o
> lançamento — integração externa não atrasa o núcleo.

---

## 12. Pontos a confirmar

- **Pesos do matching:** calibrar reputação × preço × resposta (seção 3.3).
- **Comprovante:** confirmar que fica restrito a disputas (recomendado), não em
  toda venda.
- **Prazo de expiração** padrão dos anúncios (24/48/72h) e timeout da conclusão.
- **RMT × termos de uso** dos jogos e do Discord: política da comunidade, allowlist
  por jogo (decisão de negócio, não impedimento técnico).
