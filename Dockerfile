FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies in a separate layer so they cache independently of source
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src ./src
COPY migrations ./migrations
COPY schema.sql ./schema.sql

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
