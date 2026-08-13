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

EXPOSE 3000

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Override the default entrypoint of yt-dlp base image
ENTRYPOINT []
CMD ["node", "server/index.js"]
