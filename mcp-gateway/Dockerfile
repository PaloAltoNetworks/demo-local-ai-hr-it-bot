# Use Node.js official image
FROM node:22-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpgateway -u 1001
USER mcpgateway

# Set working directory
WORKDIR /app

# copy only package files first (cache-friendly)
COPY --chown=mcpgateway:nodejs mcp-gateway/package*.json ./
COPY --chown=mcpgateway:nodejs utils/package*.json ./utils/

# install all deps in one layer
RUN npm install --prefix ./utils --only=production && \
    npm install --only=production

# Copy all application files
COPY --chown=mcpgateway:nodejs utils/ ./utils/
COPY --chown=mcpgateway:nodejs mcp-gateway/ .
COPY --chown=mcpgateway:nodejs locales/ ./locales/

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]