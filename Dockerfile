FROM node:22-slim

# Install ffmpeg, python3, and yt-dlp binary directly
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && /usr/local/bin/yt-dlp --version \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependencies & install ALL (including devDependencies for vite build)
COPY package*.json ./
RUN npm install

# Copy source code & build frontend
COPY . .
RUN npm run build

# Prune devDependencies after build to shrink image
RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node", "server/index.js"]
