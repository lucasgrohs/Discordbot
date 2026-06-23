# Marketplace RMT + Sorteio por Indicação (Bot de Discord)

Plataforma de **classificados P2P** para compra/venda de diamantes (ou itens) de
jogos, com **reputação, negociação rastreada (`Trade`), moderação e antifraude**, +
um sistema de **sorteio por indicação**.

> Repo reaproveitado de um shop-bot descontinuado. Desenho completo do produto em
> [`PLANO_RMT_BOT.md`](PLANO_RMT_BOT.md); decisões do modelo de dados em
> [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).

## Stack
- Node 20+ / TypeScript / **discord.js v14**
- **PostgreSQL** + Prisma

## Setup

```bash
npm install
cp .env.example .env          # preencha as variáveis
docker compose up -d postgres # banco local (porta 5434)
npm run prisma:generate
npx prisma migrate dev        # aplica as migrations
npm run seed                  # jogo + servidores de exemplo (opcional)
npm run deploy-commands       # registra os comandos admin
npm run dev                   # sobe o bot
```

### Variáveis essenciais (`.env`)
- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` (servidor de teste)
- `DATABASE_URL` (Postgres)

## Status por fase

- **Fase 0 — modelagem** ✅ (schema completo, 18 tabelas, migrations aplicadas)
- **Fase 1 — base administrativa** ✅ (comandos `/jogo`, `/servidor`, `/config` + auditoria)
- Fase 2 — anúncios COMPRO/VENDO + estoque + matching
- Fase 3 — negociação (`Trade`) + reserva + tickets
- Fase 4 — reputação + ranking + denúncias + disputas
- Fase 5 — sorteio + convite qualificado
- Fase 6 — Kick OAuth + Boost + VIP
- Fase 7 — painel web

**MVP = fases 0–4.**

## Comandos administrativos (Fase 1)

| Comando | O que faz |
|---|---|
| `/jogo criar` | Cadastra um jogo (nome, unidade, moeda, base, emoji). |
| `/jogo listar` | Lista os jogos e sua config. |
| `/jogo canal` | Define o canal do painel COMPRO/VENDO. |
| `/jogo editar` | Edita atributos do jogo. |
| `/jogo status` | Liga/desliga o marketplace + situação (allowlist). |
| `/jogo remover` | Remove um jogo. |
| `/servidor adicionar\|listar\|remover` | Gerencia os servidores de um jogo. |
| `/config vip` | Mapeia cargos VIP (Tier 1 = Kick, Tier 2 = Nitro). |
| `/config canais` | Define canais de staff, auditoria e disputas. |
| `/config ver` | Mostra a configuração atual. |

Todos exigem permissão de **Administrador** e usam **autocomplete** para selecionar
jogos/servidores.

## Arquitetura
- **Router central** (`src/bot/router.ts`): roteia comandos, componentes, modais e
  **autocomplete** por `custom_id` (`ns:action:args`). Componentes persistentes (sem collectors).
- **Comandos admin** (`src/bot/admin/*`): `jogo`, `servidor`, `config`.
- **Serviços** (`src/services/*`): `games`, `servers`, `guildConfig`, `audit` (acesso ao banco).
- **Schema** (`prisma/schema.prisma`): `Trade` é a entidade central (ver DATA_MODEL.md).
