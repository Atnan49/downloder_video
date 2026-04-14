FROM php:8.2-apache

# PENTING: Gunakan --no-install-recommends agar ffmpeg/python tidak tidak sengaja 
# mendownload modul apache2-mpm-event yang membuat server crash (More than one MPM loaded)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    python3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Aktifkan mod rewrite untuk Apache
RUN a2enmod rewrite

# Copy seluruh project file ke public html
COPY . /var/www/html/

# Buat folder sementara temp_videos untuk merge ffmpeg
RUN mkdir -p /var/www/html/temp_videos && chmod 777 /var/www/html/temp_videos

# Port default yang di expose
EXPOSE 80

# Script agar PORT bisa diatur dinamis oleh Railway sebelum server berjalan
CMD sed -i "s/80/${PORT:-80}/g" /etc/apache2/sites-available/000-default.conf /etc/apache2/ports.conf && \
    docker-php-entrypoint apache2-foreground
