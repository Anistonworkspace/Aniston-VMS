# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

RUN npm ci

# Copy source
COPY shared/ ./shared/
COPY frontend/ ./frontend/

# Build shared first, then frontend
RUN npm run build --workspace=shared 2>/dev/null || true
RUN npm run build --workspace=frontend

# ── Serve stage — nginx ────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Copy Vite build output
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# SPA fallback — all routes → index.html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
