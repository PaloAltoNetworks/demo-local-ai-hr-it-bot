# Stage 1: Build React frontend
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY chatbot-v2/frontend/package*.json ./
RUN npm install
COPY chatbot-v2/frontend/ ./
RUN npm run build

# Stage 2: Production server
FROM node:22-alpine

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

# Copy locales for i18n
COPY --chown=chatbot:nodejs locales/ ./frontend/dist/locales/

EXPOSE 3008

CMD ["npm", "start"]
