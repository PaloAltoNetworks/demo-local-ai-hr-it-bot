FROM node:24-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpserver -u 1001
USER mcpserver

WORKDIR /app

# Dependencies at /app, code at its repo path so the shared module resolves them too
COPY --chown=mcpserver:nodejs mcp-server/hr-tools-mcp-server/package*.json ./
RUN npm install --only=production

WORKDIR /app/mcp-server/hr-tools-mcp-server
COPY --chown=mcpserver:nodejs mcp-server/shared/ /app/mcp-server/shared/
# Copy source, then build the demo database from its SQL dump
COPY --chown=mcpserver:nodejs mcp-server/hr-tools-mcp-server/server.js ./
COPY --chown=mcpserver:nodejs mcp-server/hr-tools-mcp-server/service.js ./
COPY --chown=mcpserver:nodejs mcp-server/hr-tools-mcp-server/seed.js ./
COPY --chown=mcpserver:nodejs mcp-server/hr-tools-mcp-server/employees.sql ./
RUN node seed.js

EXPOSE 3000

CMD ["node", "server.js"]
