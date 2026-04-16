# 🚀 Tarifter Universal Video Downloader

A high-performance, universal video and audio downloading web application. Built for speed and reliability, this tool allows users to download media from various platforms (YouTube, TikTok, Instagram, etc.) in up to 4K (UHQ) resolution without the need for user accounts or login cookies.

![GitHub repo size](https://img.shields.io/github/repo-size/Atnan49/downloder_video)
![License](https://img.shields.io/badge/License-MIT-green.svg)

## ✨ Features

- **Universal Compatibility:** Download from YouTube, Instagram, TikTok, Spotify (via fallback lookup), and hundreds of other platforms supported by `yt-dlp`.
- **Ultra High Quality (4K):** Seamlessly extracts and merges UHQ video (up to 2160p) and the best available audio natively via FFmpeg.
- **Advanced Audio Extraction:** Support for High-Quality MP3, M4A (Original Apple AAC), and FLAC (Lossless) formats.
- **No Login Required:** Utilizes advanced `yt-dlp` client bypasses (`youtube:player_client=web,default`) to prevent `403 Forbidden` and bot-blocking errors without relying on authentication.
- **Fast Processing & Caching:** Built-in JSON metadata caching (`1800s` TTL) and periodic temp file cleanup mechanisms.
- **Rate Limiting & Security:** Integrated IP-based rate limiting to prevent API abuse and excessive server load.
- **Localization:** Multi-language UI selection powered by GTranslate with a modern glassmorphism aesthetic.
- **Inbound Marketing Ready:** Auto-injected branding (`Tarifter.com_...`) on downloaded media filenames (Trojan Horse marketing strategy).

## 🛠️ Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript.
- **Backend:** PHP 7.4+
- **Core Engines:** `yt-dlp` (Extraction) & `FFmpeg` (Merging & Conversion)

## ⚙️ Installation & Setup

To run this project locally, ensure you have a web server (Apache/Nginx/XAMPP) with PHP installed.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Atnan49/downloder_video.git
   cd downloder_video
   ```

2. **Core Dependencies:**
   This project requires `yt-dlp` and `FFmpeg` to function correctly.
   - For **Windows**: Place `yt-dlp.exe` in the root folder. The backend expects `FFmpeg` binaries inside `ffmpeg-master-latest-win64-gpl-shared/bin/`.
   - For **Linux**: Install FFmpeg globally via package manager (`apt install ffmpeg`), and place `yt-dlp` in `/usr/local/bin/`.

3. **Directory Permissions:**
   Ensure the web server (e.g., `www-data`) has read/write permissions for the following runtime directories:
   - `temp_videos/` (Used for staging temporary transcoded files)
   - `/tmp/` or system temp dir (Used for JSON rate-limit tracking and API payload caching)

4. **Run the Application:**
   Point your local server to the `htdocs` or `www` directory, or use PHP's built-in server:
   ```bash
   php -S localhost:8000
   ```

## 🔒 Disclaimer

This application is provided for educational and personal archiving uses only. The repository owners and contributors are not responsible for any misuse of this tool. Please respect the copyrights of the original creators and adhere to the Terms of Service of the respective platforms you interface with.
