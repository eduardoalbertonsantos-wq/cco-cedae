# Dockerfile - CCO Supervisão Operacional CEDAE
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependências necessárias para compilação de módulos nativos se houver
RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --only=production

WORKDIR /app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

CMD ["node", "backend/server.js"]
