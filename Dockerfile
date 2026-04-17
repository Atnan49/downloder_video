FROM php:8.2-apache

# Install dependencies needed by Cobalt API, yt-dlp fallback (optional), and Supervisor
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget curl git ffmpeg supervisor python3 make g++ \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm \
    && rm -rf /var/lib/apt/lists/*

# Fix mpm_event issue on Railway and enable proxy for Cobalt API
RUN a2dismod mpm_event || true ; a2dismod mpm_worker || true \
    && a2enmod mpm_prefork rewrite proxy proxy_http \
    && mkdir -p /var/www/html/temp_videos \
    && chmod 777 /var/www/html/temp_videos

# Copy app files
COPY . /var/www/html/

# Copy custom Apache virtual host configuring ProxyPass to Cobalt
COPY 000-default.conf /etc/apache2/sites-available/000-default.conf

# Setup Cobalt dependencies
WORKDIR /var/www/html/cobalt
RUN pnpm install

# Return to web root
WORKDIR /var/www/html

EXPOSE 80

# Configure Supervisor and Entrypoint
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
