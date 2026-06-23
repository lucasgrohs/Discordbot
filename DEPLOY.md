# Deploy (Docker)

O bot roda em Docker junto de um Postgres. Em produção, o **nginx** roteia
`/kick/*` para a porta do bot (endpoints de OAuth e webhook da Kick).

## Subir

```bash
cp .env.example .env     # preencha os valores (ver abaixo)
docker compose up -d --build
```

Isso sobe `postgres` + `bot`. O container do bot, ao iniciar, roda
`prisma migrate deploy` (aplica as migrations) e então liga o bot.

## Registrar os slash commands (uma vez, e a cada novo comando)

```bash
docker compose exec bot npx tsx src/bot/deployCommands.ts
```

## Variáveis essenciais (`.env`)

- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`
- `GIVEAWAY=1` (se for usar sorteio; exige Server Members Intent no portal)
- `MESSAGE_LOG=1` (se for logar tickets; exige Message Content Intent no portal)
- **Kick** (Tier 1 VIP automático):
  - `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET` (reaproveite o app Kick existente)
  - `KICK_REDIRECT_URI=https://SEU_DOMINIO/kick/callback`
  - `KICK_SCOPES=user:read`

> `DATABASE_URL` é definido pelo compose (aponta ao serviço `postgres`), não precisa no `.env`.

## Configuração da Kick (dashboard do app)

1. **Redirect URI:** adicione `https://SEU_DOMINIO/kick/callback`.
2. **Webhook de eventos:** assine `channel.subscription.new` e `channel.subscription.renewal`
   apontando para `https://SEU_DOMINIO/kick/webhook` (escopo `events:subscribe`).

A assinatura RSA dos webhooks é validada automaticamente (chave pública da Kick).

## nginx (exemplo de rota)

```nginx
location /kick/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

## Pós-deploy (no Discord)

- `/config vip` — mapeie os cargos VIP (Tier 1 = Kick, Tier 2 = Booster).
- `/config canais` — staff / disputa.
- `/jogo criar` + `/jogo salas` + `/jogo status ... marketplace:True`.
- `/sorteio salas` (se usar sorteio).

## Atualizar

```bash
git pull
docker compose up -d --build
docker compose exec bot npx tsx src/bot/deployCommands.ts   # se houver comando novo
```
