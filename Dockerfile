FROM node:20-slim AS builder

WORKDIR /app

# Install system dependencies for build
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev) for building
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    poppler-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy production test files (if any)
COPY --from=builder /app/src/test/*.js ./src/test/ 2>/dev/null || true

# Copy other necessary files
COPY --from=builder /app/package.json ./package.json

# Create data directory for SQLite database
RUN mkdir -p /app/data && chmod 755 /app/data

# Create non-root user for security (check if UID 1000 exists first)
RUN if ! id -u 1000 >/dev/null 2>&1; then \
      useradd -m -u 1000 appuser; \
    else \
      useradd -m appuser || true; \
    fi && \
    chown -R appuser:appuser /app || chown -R $(id -u):$(id -g) /app

USER appuser

# Expose port (if needed for health checks in future)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('fs').existsSync('/app/data/moneybird-agent.db') ? process.exit(0) : process.exit(1)"

# Run application
CMD ["node", "dist/index.js"]
