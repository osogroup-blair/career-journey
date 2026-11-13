FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
ARG VITE_STRIPE_PUBLISHABLE_KEY=""
ARG APP_VERSION=""
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY APP_VERSION=$APP_VERSION
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-liberation2 ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production CHROME_PATH=/usr/bin/chromium CHROME_NO_SANDBOX=true DATA_DIR=/app/data
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server/knowledge ./server/knowledge
RUN mkdir -p data server/promptConfig server/knowledgeConfig && chown -R node:node data server
USER node
EXPOSE 47293
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
 CMD node -e "fetch('http://127.0.0.1:47293/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.cjs"]
