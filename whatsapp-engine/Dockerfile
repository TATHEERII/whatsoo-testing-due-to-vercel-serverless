# --- Stage 1: build ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Force rebuild: protocolTimeout fix deployment
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Stage 2: runtime ---
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libxcomposite1 \
    libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV NODE_ENV=production
ENV PORT=3001
ENV SESSION_DIR=/data/wwebjs_auth

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist

RUN mkdir -p /data/wwebjs_auth
EXPOSE 3001

CMD ["node", "dist/server.js"]
