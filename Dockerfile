# Bot de marketplace RMT — imagem de produção.
FROM node:20-slim

WORKDIR /app

# Prisma (engine) precisa do openssl.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Dependências (com lockfile).
COPY package*.json ./
RUN npm ci

# Prisma client.
COPY prisma ./prisma
RUN npx prisma generate

# Código + build.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Aplica migrations e sobe o bot.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
