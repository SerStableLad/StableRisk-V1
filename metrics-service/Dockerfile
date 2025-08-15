# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S metrics -u 1001

# Install system dependencies
RUN apk add --no-cache \
    curl \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY --chown=metrics:nodejs src/ ./src/
COPY --chown=metrics:nodejs tsconfig.json ./

# Install TypeScript globally for build
RUN npm install -g typescript

# Build TypeScript
RUN npm run build

# Remove TypeScript and dev dependencies after build
RUN npm uninstall -g typescript && \
    rm -rf src/ tsconfig.json node_modules/@types/

# Create logs directory
RUN mkdir -p logs && chown -R metrics:nodejs logs

# Switch to non-root user
USER metrics

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health/live || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start service
CMD ["npm", "start"]