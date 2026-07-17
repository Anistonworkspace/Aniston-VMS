# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests first (better layer caching)
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

# Install all dependencies
RUN npm ci

# Copy source files
COPY shared/ ./shared/
COPY backend/ ./backend/
COPY prisma/ ./prisma/
COPY tsconfig*.json ./

# Build shared package first, then backend
RUN npm run build --workspace=shared 2>/dev/null || true
RUN npm run build --workspace=backend

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
RUN npm ci --omit=dev

# Copy built output
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/shared/dist ./shared/dist 2>/dev/null || true

# Copy Prisma schema and generate client
COPY prisma/ ./prisma/
RUN npx prisma generate --schema=prisma/schema.prisma

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "backend/dist/server.js"]
