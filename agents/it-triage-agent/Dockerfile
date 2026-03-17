FROM node:22-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpserver -u 1001
USER mcpserver

WORKDIR /app

# Install dependencies
COPY --chown=mcpserver:nodejs agents/it-triage-agent/package*.json ./
RUN npm install --only=production

# Copy source files
COPY --chown=mcpserver:nodejs agents/it-triage-agent/server.js ./
COPY --chown=mcpserver:nodejs agents/it-triage-agent/agent.js ./
COPY --chown=mcpserver:nodejs agents/it-triage-agent/it-processes.json ./

EXPOSE 3000

CMD ["npm", "start"]
