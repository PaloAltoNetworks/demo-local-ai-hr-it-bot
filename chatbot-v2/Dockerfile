# Stage 1: Build React frontend
FROM node:24-alpine AS frontend-build
WORKDIR /build
COPY chatbot-v2/frontend/package*.json ./
RUN npm install
COPY chatbot-v2/frontend/ ./
RUN npm run build

# Stage 2: Production server
FROM node:24-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S chatbot -u 1001
USER chatbot

WORKDIR /app

# Install backend dependencies
COPY --chown=chatbot:nodejs chatbot-v2/package*.json ./
RUN npm install --only=production

# Copy backend
COPY --chown=chatbot:nodejs chatbot-v2/backend/ ./backend/

# Copy built frontend
COPY --from=frontend-build --chown=chatbot:nodejs /build/dist ./frontend/dist/

# Release tag the image was built for (e.g. v0.1.6-rc.2), shown in the UI; unset for local builds
ARG APP_VERSION=
ENV APP_VERSION=$APP_VERSION

# Changelog shown in the UI (GET /api/about)
COPY --chown=chatbot:nodejs CHANGELOG.md ./

# Copy locales for i18n
COPY --chown=chatbot:nodejs locales/ ./frontend/dist/locales/

EXPOSE 3018

CMD ["npm", "start"]
