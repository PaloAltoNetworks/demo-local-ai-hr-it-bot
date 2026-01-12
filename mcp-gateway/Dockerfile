# Use Node.js official image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy all application files
COPY mcp-gateway/package*.json ./
COPY mcp-gateway/ .
COPY locales/ ./locales/
COPY utils/ ./utils/

# Install utils dependencies first
RUN cd utils && npm install --only=production

# Install main application dependencies
RUN npm install --only=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpgateway -u 1001

# Change ownership of app directory
RUN chown -R mcpgateway:nodejs /app
USER mcpgateway

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]