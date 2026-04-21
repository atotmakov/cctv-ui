# ── Stage 1: Build React client ──────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY client/ ./client/
RUN npm run build --workspace=client

# ── Stage 2: Production server ────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev

COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "--experimental-sqlite", "server/index.js"]
