FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY packages/types/package.json ./packages/types/
RUN npm ci

COPY server/ ./server/
COPY packages/types/ ./packages/types/
RUN npx prisma generate --schema=server/prisma/schema.prisma
RUN npm run build --workspace=server
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma/schema.prisma ./server/prisma/
COPY --from=builder /app/server/prisma/migrations ./server/prisma/migrations

RUN addgroup -S app && adduser -S app -G app -u 1001
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health/ready || exit 1

CMD ["node", "--enable-source-maps", "server/dist/index.js"]
