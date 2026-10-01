# Production image: `npm run build` output served by `npm start` (NODE_ENV=production
# serves dist/ instead of the Vite middleware). See docker-compose.yml for runtime config.

# ---- build: compile the SPA and bundle server.ts into dist/ ----
FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# VITE_* values are inlined into the client bundle at build time, so they must be
# present here, not just at runtime. They're public (shipped to every browser) —
# server-side secrets never go in build args.
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ARG VITE_FIREBASE_STORAGE_BUCKET=""
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=""
ARG VITE_FIREBASE_APP_ID=""
ARG VITE_STRIPE_PUBLISHABLE_KEY=""
# No .git in the build context, so pass the commit SHA for support-ticket appVersion.
ARG APP_VERSION=""
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY \
    APP_VERSION=$APP_VERSION

COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:24-bookworm-slim
WORKDIR /app

# Chromium renders resume PDFs from print.html (server/pdfRenderer.ts). Noto makes the
# templates' sans/serif stacks resolve to the same faces as a typical dev desktop;
# Liberation covers templates or pasted text that name Arial/Times explicitly.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-liberation2 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Chromium's own sandbox can't start as the non-root `node` user under Docker's default
# seccomp profile; the container is the isolation boundary, and the renderer already
# blocks every request outside the app's own origin.
ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    CHROME_NO_SANDBOX=true

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Read at runtime relative to cwd: base AI skills, plus the admin-override dirs
# (created here so named volumes mounted over them inherit node ownership).
COPY --from=build --chown=node:node /app/server/knowledge ./server/knowledge
RUN mkdir -p server/promptConfig server/knowledgeConfig && chown -R node:node server

USER node
EXPOSE 47293
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:47293/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
