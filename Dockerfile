FROM php:8.2-apache

# Install dependencies needed by PHP downloader, yt-dlp, FFmpeg, and Supervisor
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget curl ffmpeg supervisor python3 \
    && rm -rf /var/lib/apt/lists/*

# Fix mpm conflicts and enable required Apache modules
RUN rm -f /etc/apache2/mods-enabled/mpm_*.load \
    && rm -f /etc/apache2/mods-enabled/mpm_*.conf \
    && a2enmod mpm_prefork rewrite \
    && echo "ServerName localhost" > /etc/apache2/conf-available/servername.conf \
    && a2enconf servername \
    && mkdir -p /var/www/html/temp_videos \
    && chmod 777 /var/www/html/temp_videos

# Copy app files
COPY . /var/www/html/

# Copy custom Apache virtual host
COPY 000-default.conf /etc/apache2/sites-available/000-default.conf

WORKDIR /var/www/html

EXPOSE 80

# Configure Supervisor and Entrypoint
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
