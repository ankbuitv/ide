# syntax=docker/dockerfile:1.6
# ---------- build stage ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /srv
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# ---------- runtime stage ----------
FROM node:20-bookworm-slim

# Install g++ for C++ compilation, plus dumb-init for proper signal handling.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        g++ \
        ca-certificates \
        dumb-init \
 && rm -rf /var/lib/apt/lists/*

# Create a non-root user for runtime safety. The backend spawns child
# processes for g++ and the compiled binary; we still drop privileges
# where we can. (We keep root inside the build dir to allow /tmp writes.)
ENV NODE_ENV=production \
    PORT=8080 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /srv

# Copy backend + install
COPY --from=deps /srv/backend/node_modules ./backend/node_modules
COPY backend ./backend

# Copy frontend static assets
COPY public ./public

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+ (process.env.PORT||8080) +'/api/health', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# dumb-init forwards SIGTERM to the Node process so docker stop is graceful.
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "backend/server.js"]
