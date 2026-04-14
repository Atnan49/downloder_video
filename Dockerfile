# Gunakan *image* resmi PHP bawaan Apache
FROM php:8.2-apache

# Instal pustaka pendukung untuk server Linux (Python, FFmpeg, Wget)
RUN apt-get update && apt-get install -y \
    wget \
    python3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Unduh yt-dlp versi asli Linux
RUN wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Fix Apache MPM conflict - disable event, enable prefork
RUN a2dismod mpm_event && a2enmod mpm_prefork

# Aktifkan modul rewrite
RUN a2enmod rewrite

# Salin semua file proyek ke folder publik Apache
COPY . /var/www/html/

# Buat folder temp_videos dan set permission
RUN mkdir -p /var/www/html/temp_videos && chmod 777 /var/www/html/temp_videos

# Railway menggunakan PORT environment variable
RUN sed -i 's/Listen 80/Listen ${PORT}/g' /etc/apache2/ports.conf
RUN sed -i 's/:80/:${PORT}/g' /etc/apache2/sites-available/000-default.conf

ENV PORT=80

EXPOSE ${PORT}

CMD ["apache2-foreground"]
