FROM php:8.2-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    python3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

RUN a2enmod rewrite

# Siapkan folder
RUN mkdir -p /var/www/html/temp_videos && chmod 777 /var/www/html/temp_videos
COPY . /var/www/html/

# PENTING: Jangan gunakan script sed untuk mengganti PORT. 
# Cukup gunakan EXPOSE 80, dan Railway otomatis akan merutekan trafik ke port 80.
EXPOSE 80
