# CHAINGUARD IMAGE - Zero CVEs, distroless, daily rebuilds
# vs. node:18-alpine (~30 CVEs, monthly releases, community-only)
FROM cgr.dev/chainguard/node:latest

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Note: Chainguard node image includes npm
RUN npm ci --only=production

# Copy application code
COPY server.js ./

# Run as non-root (Chainguard images default to non-root)
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]

# CHAINGUARD DIFFERENTIATION:
# - Zero CVEs vs. node:18-alpine's ~30 CVEs
# - Daily automated rebuilds vs. manual patching
# - Built-in SBOM + signatures
# - Smaller image size (distroless base)
# - Non-root by default (security best practice)
