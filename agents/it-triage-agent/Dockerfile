FROM node:24-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpserver -u 1001
USER mcpserver

WORKDIR /app

# Dependencies at /app, code at its repo path so the shared module resolves them too
COPY --chown=mcpserver:nodejs agents/it-triage-agent/package*.json ./
RUN npm install --only=production

WORKDIR /app/agents/it-triage-agent
COPY --chown=mcpserver:nodejs mcp-server/shared/ /app/mcp-server/shared/
COPY --chown=mcpserver:nodejs agents/it-triage-agent/server.js ./
COPY --chown=mcpserver:nodejs agents/it-triage-agent/agent.js ./
COPY --chown=mcpserver:nodejs agents/it-triage-agent/it-processes.json ./

EXPOSE 3000

CMD ["node", "server.js"]
