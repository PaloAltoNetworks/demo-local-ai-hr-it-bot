FROM node:24-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpserver -u 1001
USER mcpserver

WORKDIR /app

# Install agent dependencies
COPY --chown=mcpserver:nodejs mcp-server/it-tools-mcp-server/package*.json ./
RUN npm install --only=production

# Copy source, then build the demo database from its SQL dump
COPY --chown=mcpserver:nodejs mcp-server/it-tools-mcp-server/server.js ./
COPY --chown=mcpserver:nodejs mcp-server/it-tools-mcp-server/service.js ./
COPY --chown=mcpserver:nodejs mcp-server/it-tools-mcp-server/seed.js ./
COPY --chown=mcpserver:nodejs mcp-server/it-tools-mcp-server/tickets.sql ./
RUN node seed.js

EXPOSE 3000

CMD ["npm", "start"]
