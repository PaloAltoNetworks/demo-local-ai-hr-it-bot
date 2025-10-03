# HR MCP Server Dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY mcp-server/hr-mcp-server/package*.json ./
COPY mcp-server/shared/package*.json ./shared/

# Install dependencies for both
RUN npm install
RUN cd shared && npm install

# Copy all source files
COPY mcp-server/shared/ ./shared/
COPY mcp-server/hr-mcp-server/server.js ./
COPY mcp-server/hr-mcp-server/employees.csv ./

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "console.log('HR Agent Health Check - OK')" || exit 1

EXPOSE 3000
CMD ["node", "server.js"]