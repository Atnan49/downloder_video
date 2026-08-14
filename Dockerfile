FROM ghcr.io/jim60105/yt-dlp:pot

USER root

# Install Node.js on Alpine
RUN apk update && apk add --no-cache nodejs npm

# Verify tools are installed
RUN yt-dlp --version && node --version && ffmpeg -version | head -1

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Prune dev deps
RUN npm prune --omit=dev

# Make start script executable
RUN chmod +x /app/start.sh

EXPOSE 3000

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

# Use start.sh entrypoint to initialize bgutil-pot & node server
ENTRYPOINT ["/app/start.sh"]
