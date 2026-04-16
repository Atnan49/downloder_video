FROM php:8.2-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ffmpeg \
    python3 \
    && rm -rf /var/lib/apt/lists/* \
    && wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && a2enmod rewrite \
    && mkdir -p /var/www/html/temp_videos \
    && chmod 777 /var/www/html/temp_videos

COPY . /var/www/html/

EXPOSE 80

# Fix kasus mpm_event nyala sendiri di Railway and run yt-dlp self-update
CMD ["/bin/bash", "-c", "yt-dlp -U; a2dismod mpm_event mpm_worker || true; a2enmod mpm_prefork; apache2-foreground"]
