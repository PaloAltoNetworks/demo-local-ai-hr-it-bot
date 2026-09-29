FROM node:24-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpserver -u 1001
USER mcpserver

WORKDIR /app

# Install agent dependencies
COPY --chown=mcpserver:nodejs mcp-server/it-tools-mcp-server/package*.json ./
RUN npm install --only=production

# Copy source and the pre-seeded database
COPY --chown=mcpserver:nodejs mcp-server/it-tools-mcp-server/server.js ./
COPY --chown=mcpserver:nodejs mcp-server/it-tools-mcp-server/service.js ./
COPY --chown=mcpserver:nodejs mcp-server/it-tools-mcp-server/tickets.db ./

EXPOSE 3000

CMD ["npm", "start"]
