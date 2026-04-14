# Gunakan *image* resmi PHP bawaan Apache
FROM php:8.2-apache

# Instal pustaka pendukung untuk server Linux (Python, FFmpeg, Wget)
# FFmpeg sangat penting agar yt-dlp bisa menyatukan video dan audio kualitas tinggi (1080p ke atas)
RUN apt-get update && apt-get install -y \
    wget \
    python3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Unduh yt-dlp versi asli Linux dan masukkan ke folder sistem (/usr/local/bin)
# Berikan hak akses eksekusi agar bisa dijalankan oleh PHP
RUN wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Aktifkan modul penulisan URL Apache (jika sewaktu-waktu dibutuhkan)
RUN a2enmod rewrite

# Salin semua file proyek (index.html, api.php, script.js, style.css) Anda ke folder publik Apache
COPY . /var/www/html/

# Buat folder temp_videos dan set permission
RUN mkdir -p /var/www/html/temp_videos && chmod 777 /var/www/html/temp_videos

# Railway menggunakan PORT environment variable (bukan selalu 80)
# Konfigurasi Apache agar listen di $PORT
RUN sed -i 's/Listen 80/Listen ${PORT}/g' /etc/apache2/ports.conf
RUN sed -i 's/:80/:${PORT}/g' /etc/apache2/sites-available/000-default.conf

# Set default PORT jika tidak disediakan
ENV PORT=80

# Expose port
EXPOSE ${PORT}

# Start Apache
CMD ["apache2-foreground"]
