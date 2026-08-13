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
  res.json({ status: 'ok', engine: 'Native yt-dlp Direct Stream Engine', time: new Date().toISOString() });
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
      url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=480`
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

// Stream Download Endpoint using yt-dlp Direct Stream URL & File Buffer
app.get('/api/download', async (req, res) => {
  const { url, format = 'mp4', quality = '1080' } = req.query;

  if (!url) {
    return res.status(400).send('URL parameter missing');
  }

  const cleanUrl = decodeURIComponent(url);
  const ext = format.toLowerCase();
  const safeFilename = `media_download_${Date.now()}.${ext}`;

  const YTDLP_BIN = process.platform === 'win32' ? 'yt-dlp' : '/usr/local/bin/yt-dlp';

  try {
    // 1. Resolve Direct CDN Stream URL using yt-dlp -g
    let formatFilter = `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`;
    if (ext === 'mp3' || ext === 'm4a' || ext === 'flac') {
      formatFilter = 'bestaudio[ext=m4a]/bestaudio/best';
    }

    const cmd = `${YTDLP_BIN} -g -f "${formatFilter}" --extractor-args "youtube:player_client=ios,android,web" --geo-bypass --no-check-certificates "${cleanUrl}"`;
    const { stdout } = await execPromise(cmd, { timeout: 12000 });

    const urls = stdout.trim().split('\n').filter(u => u.startsWith('http'));

    if (urls.length > 0) {
      const streamUrl = urls[0]; // Take primary stream URL

      // Proxy binary stream via Axios directly to client
      const streamResponse = await axios.get(streamUrl, {
        responseType: 'stream',
        headers: {
          'User-Agent': USER_AGENT
        },
        timeout: 30000
      });

      const contentType = ext === 'mp3' ? 'audio/mpeg' : (ext === 'flac' ? 'audio/flac' : 'video/mp4');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      if (streamResponse.headers['content-length']) {
        res.setHeader('Content-Length', streamResponse.headers['content-length']);
      }

      return streamResponse.data.pipe(res);
    }
  } catch (err) {
    console.warn('yt-dlp -g stream fetch warning, falling back to temp file download:', err.message);
  }

  // 2. Temp File Muxing Fallback (If direct stream url fetch failed)
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `yt_temp_${Date.now()}.${ext}`);

  try {
    let dlCmd = `${YTDLP_BIN} -f "bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --recode-video mp4 --extractor-args "youtube:player_client=ios,android,web" --geo-bypass --no-check-certificates -o "${tempFilePath}" "${cleanUrl}"`;
    if (ext === 'mp3') {
      dlCmd = `${YTDLP_BIN} -x --audio-format mp3 --audio-quality 0 --extractor-args "youtube:player_client=ios,android,web" --geo-bypass --no-check-certificates -o "${tempFilePath}" "${cleanUrl}"`;
    }

    await execPromise(dlCmd, { timeout: 45000 });

    if (fs.existsSync(tempFilePath)) {
      return res.download(tempFilePath, safeFilename, () => {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      });
    }
  } catch (dlErr) {
    console.error('Temp file download error:', dlErr.message);
    try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) {}
  }

  return res.status(500).send('Gagal mengunduh file video. Silakan coba kembali.');
});

// SPA Fallback Route
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Render Server with Direct Stream Engine running on port ${PORT}`);
});
