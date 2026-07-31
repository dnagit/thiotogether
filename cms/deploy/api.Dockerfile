# ── Build stage ─────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY api/package.json api/
RUN npm ci --workspace api --include-workspace-root

COPY tsconfig.base.json ./
COPY shared/ shared/
COPY api/ api/

RUN npm run prisma:generate -w api
RUN npm run build -w api

# ── Runtime stage ───────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/api/node_modules api/node_modules
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/api/prisma api/prisma
COPY --from=build /app/api/package.json api/

# Run as non-root
RUN addgroup -S cms && adduser -S cms -G cms && mkdir -p /app/api/uploads && chown -R cms:cms /app
USER cms

WORKDIR /app/api
EXPOSE 4009
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/api/src/server.js"]
