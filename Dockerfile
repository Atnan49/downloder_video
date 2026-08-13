FROM node:22-slim

# Install ffmpeg, python3, and yt-dlp binary directly
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependencies & install
COPY package*.json ./
RUN npm install

# Copy source code & build frontend
COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "server/index.js"]
