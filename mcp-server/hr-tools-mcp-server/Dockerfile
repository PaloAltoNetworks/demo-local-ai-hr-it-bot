FROM node:22-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpserver -u 1001
USER mcpserver

WORKDIR /app

# Install utils dependencies first (logger needs winston)
COPY --chown=mcpserver:nodejs utils/package*.json ./utils/
RUN npm install --prefix ./utils --only=production

# Install agent dependencies
COPY --chown=mcpserver:nodejs mcp-server/hr-tools-mcp-server/package*.json ./
RUN npm install --only=production

# Copy all source files (self-contained — no cross-workspace references)
COPY --chown=mcpserver:nodejs mcp-server/hr-tools-mcp-server/server.js ./
COPY --chown=mcpserver:nodejs mcp-server/hr-tools-mcp-server/service.js ./
COPY --chown=mcpserver:nodejs mcp-server/hr-tools-mcp-server/database-manager.js ./
COPY --chown=mcpserver:nodejs mcp-server/hr-tools-mcp-server/employee-db.js ./
COPY --chown=mcpserver:nodejs mcp-server/hr-tools-mcp-server/employees.db ./

# Shared utils (logger)
COPY --chown=mcpserver:nodejs utils/ ./utils/

EXPOSE 3000

CMD ["npm", "start"]
