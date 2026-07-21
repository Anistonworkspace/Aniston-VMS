# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Skip husky's prepare hook inside Docker (no .git in build context)
ENV HUSKY=0

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

# Generate Prisma client (backend compiles against it), then build shared + backend
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build --workspace=shared
RUN npm run build --workspace=backend

# Point shared's exports at the compiled dist so Node (not tsx) can load it at runtime
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('shared/package.json','utf8'));p.main='dist/index.js';p.types='dist/index.d.ts';p.exports={'.':'./dist/index.js','./enums':'./dist/enums.js','./types':'./dist/types.js'};fs.writeFileSync('shared/package.json',JSON.stringify(p,null,2));"

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# ffprobe (shipped in alpine's ffmpeg package) is REQUIRED for real RTSP video
# validation: the VIDEO_VALIDATION health stage and POST /cameras/test-connection
# both spawn `ffprobe`. Without it, ffprobeStream() now fails closed
# (FFPROBE_MISSING) and every real camera reads CRITICAL. Alpine's ffmpeg package
# provides both ffmpeg and ffprobe; no pin needed for a demo/dev image.
RUN apk add --no-cache ffmpeg

# Install only production dependencies (shared/package.json comes from the
# builder so its exports point at dist/, which Node can load at runtime)
COPY package.json package-lock.json ./
COPY --from=builder /app/shared/package.json ./shared/
COPY backend/package.json ./backend/
# --ignore-scripts: husky (prepare) is a devDependency and absent here;
# no prod dep needs install scripts (bcryptjs is pure JS, Prisma client is copied from builder)
RUN npm ci --omit=dev --ignore-scripts

# Copy built output (backend/dist imports @aniston-vms/shared at runtime,
# resolved via the npm workspace symlink to ./shared/dist)
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/shared/dist ./shared/dist

# Copy Prisma schema + the client generated in the builder (same node:20-alpine platform)
COPY prisma/ ./prisma/
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "backend/dist/server.js"]
