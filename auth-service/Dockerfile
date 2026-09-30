# Stage 1: install dependencies (better-sqlite3 builds a native addon)
FROM node:24-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY auth-service/package*.json ./
RUN npm ci --omit=dev

# Stage 2: runtime
FROM node:24-alpine
RUN mkdir -p /data && chown node:node /data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node auth-service/ ./
USER node
EXPOSE 3001
CMD ["node", "server.js"]
