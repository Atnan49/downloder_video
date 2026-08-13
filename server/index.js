import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import axios from 'axios';

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', engine: 'Native yt-dlp Temp File Engine', time: new Date().toISOString() });
});

// Extract Video Metadata Endpoint
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL tidak valid atau kosong' });
  }

  const cleanUrl = url.trim();

  // Detect Platform
  let platform = 'video';
  if (cleanUrl.includes('tiktok.com')) platform = 'tiktok';
  else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) platform = 'youtube';
  else if (cleanUrl.includes('instagram.com')) platform = 'instagram';

  let title = 'Media Video';
  let author = 'Kreator Media';
  let thumbnail = '';
  let duration = 'N/A';

  // Extract Metadata via Native yt-dlp binary
  try {
    const YTDLP_BIN = process.platform === 'win32' ? 'yt-dlp' : '/usr/local/bin/yt-dlp';
    const cmd = `${YTDLP_BIN} --dump-single-json --no-warnings --no-playlist --extractor-args "youtube:player_client=ios,android,web" --geo-bypass --no-check-certificates "${cleanUrl}"`;
    
    const { stdout } = await execPromise(cmd, { maxBuffer: 1024 * 1024 * 20, timeout: 15000 });
    
    if (stdout && stdout.trim().startsWith('{')) {
      const info = JSON.parse(stdout);
      title = info.title || info.fulltitle || title;
      author = info.uploader || info.creator || info.channel || author;
      thumbnail = info.thumbnail || (info.thumbnails && info.thumbnails[info.thumbnails.length - 1]?.url) || thumbnail;
      if (info.duration) {
        duration = `${Math.floor(info.duration / 60)}m ${info.duration % 60}s`;
      }
    }
  } catch (err) {
    console.warn('yt-dlp metadata extraction fallback to oEmbed:', err.message);
    
    const videoIdMatch = cleanUrl.match(/(?:youtu\.be\/|watch\?v=)([^#\&\?]*)/);
    if (videoIdMatch && videoIdMatch[1]) {
      const vid = videoIdMatch[1];
      thumbnail = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      try {
        const oe = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`, { timeout: 4000 });
        if (oe.data) {
          title = oe.data.title || title;
          author = oe.data.author_name || author;
        }
      } catch (e) {}
    }
  }

  // All formats point to our Render server download handler
  const formats = [
    {
      id: 'yt_dlp_1080',
      quality: '1080p Full HD Video (H.264 MP4)',
      format: 'MP4',
      type: 'video',
      size: '1080p Full HD Stream',
      url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=1080`
    },
    {
      id: 'yt_dlp_720',
      quality: '720p HD Video (H.264 MP4)',
      format: 'MP4',
      type: 'video',
      size: '720p HD Stream',
      url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=720`
    },
    {
      id: 'yt_dlp_480',
      quality: '480p SD Video (H.264 MP4)',
      format: 'MP4',
      type: 'video',
      size: '480p SD Stream',
      url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=480`
    },
    {
      id: 'yt_dlp_mp3',
      quality: 'Audio Only (MP3 320kbps)',
      format: 'MP3',
      type: 'audio',
      size: '320kbps High Quality Audio',
      url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp3`
    },
    {
      id: 'yt_dlp_m4a',
      quality: 'Audio Only (M4A Original)',
      format: 'M4A',
      type: 'audio',
      size: 'AAC Audio Track',
      url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=m4a`
    },
    {
      id: 'yt_dlp_flac',
      quality: 'Audio Only (FLAC Lossless)',
      format: 'FLAC',
      type: 'audio',
      size: 'Lossless Audio Track',
      url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=flac`
    }
  ];

  return res.json({
    success: true,
    platform,
    data: {
      title,
      author,
      authorAvatar: '',
      thumbnail,
      duration,
      previewUrl: '',
      formats
    }
  });
});

// Stream Download Endpoint using Native yt-dlp Temp File Merging Engine
app.get('/api/download', async (req, res) => {
  const { url, format = 'mp4', quality = '1080' } = req.query;

  if (!url) {
    return res.status(400).send('URL parameter missing');
  }

  const cleanUrl = decodeURIComponent(url);
  const ext = format.toLowerCase();
  const safeFilename = `media_download_${Date.now()}.${ext}`;

  const YTDLP_BIN = process.platform === 'win32' ? 'yt-dlp' : '/usr/local/bin/yt-dlp';
  const tempDir = os.tmpdir();
  const tempFileBase = path.join(tempDir, `yt_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  const tempFilePath = `${tempFileBase}.${ext}`;

  try {
    let dlCmd = `${YTDLP_BIN} -f "best[ext=mp4]/bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best" --extractor-args "youtube:player_client=ios,android,web" --geo-bypass --no-check-certificates -o "${tempFilePath}" "${cleanUrl}"`;
    
    if (ext === 'mp3') {
      dlCmd = `${YTDLP_BIN} -x --audio-format mp3 --audio-quality 0 --extractor-args "youtube:player_client=ios,android,web" --geo-bypass --no-check-certificates -o "${tempFilePath}" "${cleanUrl}"`;
    } else if (ext === 'flac') {
      dlCmd = `${YTDLP_BIN} -x --audio-format flac --extractor-args "youtube:player_client=ios,android,web" --geo-bypass --no-check-certificates -o "${tempFilePath}" "${cleanUrl}"`;
    } else if (ext === 'm4a') {
      dlCmd = `${YTDLP_BIN} -f "ba[ext=m4a]/ba" --extractor-args "youtube:player_client=ios,android,web" --geo-bypass --no-check-certificates -o "${tempFilePath}" "${cleanUrl}"`;
    }

    // Execute yt-dlp to download & merge directly into temp file on server disk
    await execPromise(dlCmd, { timeout: 60000 });

    if (fs.existsSync(tempFilePath)) {
      return res.download(tempFilePath, safeFilename, (err) => {
        try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) {}
      });
    }

    // Check if yt-dlp created temp file with slightly different extension
    const matchedFiles = fs.readdirSync(tempDir).filter(f => f.startsWith(path.basename(tempFileBase)));
    if (matchedFiles.length > 0) {
      const actualPath = path.join(tempDir, matchedFiles[0]);
      return res.download(actualPath, safeFilename, (err) => {
        try { if (fs.existsSync(actualPath)) fs.unlinkSync(actualPath); } catch (e) {}
      });
    }

  } catch (dlErr) {
    console.error('yt-dlp temp file download error:', dlErr.message);
    try {
      const files = fs.readdirSync(tempDir).filter(f => f.startsWith(path.basename(tempFileBase)));
      files.forEach(f => fs.unlinkSync(path.join(tempDir, f)));
    } catch (e) {}
  }

  return res.status(500).send('Gagal memproses dan mengunduh berkas video. Silakan coba kembali.');
});

// SPA Fallback Route
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Render Server with Native Temp File Engine running on port ${PORT}`);
});
