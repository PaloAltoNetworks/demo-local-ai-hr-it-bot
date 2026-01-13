# Use Node.js official image
FROM node:22-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S chatbot -u 1001
USER chatbot

# Set working directory
WORKDIR /app

# copy only package files first (cache-friendly)
COPY --chown=chatbot:nodejs utils/package*.json ./utils/
COPY --chown=chatbot:nodejs chatbot-host/package*.json ./

# install all deps in one layer
RUN npm install --prefix ./utils --only=production && \
    npm install --prefix . --only=production

# Copy all application files
COPY --chown=mcpserver:nodejs utils/ ./utils/
COPY --chown=chatbot:nodejs locales/ ./locales/
COPY --chown=chatbot:nodejs chatbot-host/ .

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]