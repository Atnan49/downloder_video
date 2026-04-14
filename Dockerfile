FROM php:8.2-apache

# Update dan install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    python3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Copy kode website
COPY . /var/www/html/
RUN mkdir -p /var/www/html/temp_videos && chmod 777 /var/www/html/temp_videos

# Bersihkan dan pastikan hanya satu MPM yang dimuat (prefork khusus untuk PHP)
RUN rm -f /etc/apache2/mods-enabled/mpm_*.load \
    && rm -f /etc/apache2/mods-enabled/mpm_*.conf \
    && a2enmod mpm_prefork rewrite

# Gunakan envvars bawaan Apache agar PORT dari Railway bisa terbaca
RUN echo 'export PORT="${PORT:-80}"' >> /etc/apache2/envvars
RUN echo "Listen \${PORT}" > /etc/apache2/ports.conf

# Set VirtualHost default ke PORT tersebut
RUN echo '<VirtualHost *:${PORT}>\n\
    DocumentRoot /var/www/html\n\
    ErrorLog ${APACHE_LOG_DIR}/error.log\n\
    CustomLog ${APACHE_LOG_DIR}/access.log combined\n\
</VirtualHost>' > /etc/apache2/sites-available/000-default.conf

# Start server
CMD ["apache2-foreground"]
