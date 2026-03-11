# Chatbot V2 — AI SDK + MCP native tool calling
FROM node:22-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S chatbot -u 1001
USER chatbot

WORKDIR /app

# Install dependencies
COPY --chown=chatbot:nodejs chatbot-v2/package*.json ./
RUN npm install --only=production

# Copy backend
COPY --chown=chatbot:nodejs chatbot-v2/backend/ ./backend/

# Copy frontend from chatbot-host (same UI)
COPY --chown=chatbot:nodejs chatbot-host/frontend/ ./frontend/

# Copy locales for i18n
COPY --chown=chatbot:nodejs locales/ ./frontend/locales/

EXPOSE 3008

CMD ["npm", "start"]
