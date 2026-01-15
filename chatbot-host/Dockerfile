# Use Node.js official image
FROM node:22-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S chatbot -u 1001
USER chatbot

# Set working directory
WORKDIR /app

# copy only package files first (cache-friendly)
COPY --chown=chatbot:nodejs chatbot-host/package*.json ./
COPY --chown=chatbot:nodejs utils/package*.json ./utils/

# install all deps in one layer
RUN npm install --prefix ./utils --only=production && \
    npm install --prefix . --only=production

# Copy all application files
COPY --chown=mcpserver:nodejs utils/ ./utils/
COPY --chown=chatbot:nodejs locales/ ./locales/
COPY --chown=chatbot:nodejs chatbot-host/ .

# Expose port
EXPOSE 3002

# Start the application
CMD ["npm", "start"]