FROM node:20-alpine AS canvas-build
WORKDIR /app/canvas
COPY canvas/package*.json ./
RUN npm ci
COPY canvas ./
# Codegen (npm run gen:nodes, part of build) imports the backend service descriptors at
# ../../src/nodes/services. They are pure data + a builtins-only validator, so this folder
# is self-contained — no engine, no backend deps needed in this stage.
COPY src/nodes/services /app/src/nodes/services
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
