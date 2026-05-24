FROM node:20-alpine AS canvas-build
WORKDIR /app/canvas
COPY canvas/package*.json ./
RUN npm ci
COPY canvas ./
RUN npm run build

FROM node:20-alpine AS server
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY migrations ./migrations
COPY schema.sql ./schema.sql
COPY --from=canvas-build /app/canvas/dist ./public

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
