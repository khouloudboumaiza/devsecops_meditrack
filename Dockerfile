# --- Étape 1 : build ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# --- Étape 2 : image finale ---
FROM node:20-alpine
WORKDIR /app

# Créer un utilisateur non-root
RUN addgroup -S meditrack && adduser -S meditrack -G meditrack

COPY --from=builder /app .

USER meditrack

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode===200?0:1))"

CMD ["node", "src/app.js"]