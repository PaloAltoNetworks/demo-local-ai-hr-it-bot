# Use Node.js official image
FROM node:22-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpgateway -u 1001
USER mcpgateway

# Set working directory
WORKDIR /app

# copy only package files first (cache-friendly)
COPY --chown=mcpgateway:nodejs utils/package*.json ./utils/
COPY --chown=mcpgateway:nodejs mcp-gateway/package*.json ./

# install all deps in one layer
RUN npm install --prefix ./utils --only=production && \
    npm install --only=production

# Copy all application files
COPY --chown=mcpgateway:nodejs utils/ ./utils/
COPY --chown=mcpgateway:nodejs mcp-gateway/ .
COPY --chown=mcpgateway:nodejs locales/ ./locales/

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]