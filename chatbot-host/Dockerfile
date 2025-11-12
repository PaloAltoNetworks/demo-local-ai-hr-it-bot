# Use Node.js official image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY chatbot-host/package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy application code
COPY chatbot-host/ .

# Copy locales directory for i18n support
COPY locales/ ./locales/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S chatbot -u 1001

# Change ownership of app directory
RUN chown -R chatbot:nodejs /app
USER chatbot

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]