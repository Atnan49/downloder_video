import express from 'express';
import cors from 'cors';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const execFilePromise = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Resolve yt-dlp binary path
const YTDLP_BIN = process.platform === 'win32' ? 'yt-dlp' : '/usr/local/bin/yt-dlp';

// BUG 7 FIX: Startup health check - verify yt-dlp binary exists
let ytdlpAvailable = false;
(async () => {
  try {
    const { stdout } = await execFilePromise(YTDLP_BIN, ['--version'], { timeout: 5000 });
    ytdlpAvailable = true;
    console.log(`yt-dlp binary found: v${stdout.trim()}`);
  } catch (e) {
    console.error('WARNING: yt-dlp binary NOT found. Download features will fail.');
  }
})();

// URL Sanitization helper (POTENTIAL 2 FIX: prevent command injection)
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  // Only allow http/https URLs
  if (!/^https?:\/\//i.test(trimmed)) return null;
  // Block shell metacharacters
  if (/[`$;|&><\\]/.test(trimmed)) return null;
  return trimmed;
}

// Temp file cleanup helper
function cleanupTempFiles(baseName, tempDir) {
  try {
    const files = fs.readdirSync(tempDir).filter(f => f.startsWith(baseName));
    files.forEach(f => {
      try { fs.unlinkSync(path.join(tempDir, f)); } catch (e) {}
    });
  } catch (e) {}
}

// Find actual output file (BUG 2 FIX: yt-dlp may rename extension)
function findOutputFile(baseName, tempDir) {
  try {
    const files = fs.readdirSync(tempDir).filter(f => f.startsWith(baseName));
    if (files.length === 0) return null;
    // Sort by modification time, newest first
    const sorted = files
      .map(f => ({ name: f, path: path.join(tempDir, f), mtime: fs.statSync(path.join(tempDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    // Return the first file that has actual content (> 0 bytes)
    for (const file of sorted) {
      const stat = fs.statSync(file.path);
      if (stat.size > 0) return file;
    }
  } catch (e) {}
  return null;
}

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ytdlp: ytdlpAvailable,
    engine: 'Native yt-dlp Temp File Engine',
    time: new Date().toISOString()
  });
});

// Extract Video Metadata Endpoint
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  const cleanUrl = sanitizeUrl(url);

  if (!cleanUrl) {
    return res.status(400).json({ success: false, error: 'URL tidak valid atau kosong. Pastikan URL dimulai dengan https://' });
  }

  if (!ytdlpAvailable) {
    return res.status(503).json({ success: false, error: 'Server sedang dalam proses inisialisasi. Coba lagi dalam beberapa detik.' });
  }

  // Detect Platform
  let platform = 'video';
  if (cleanUrl.includes('tiktok.com')) platform = 'tiktok';
  else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) platform = 'youtube';
  else if (cleanUrl.includes('instagram.com')) platform = 'instagram';

  let title = 'Media Video';
  let author = 'Kreator Media';
  let thumbnail = '';
  let duration = 'N/A';

  // Extract Metadata via Native yt-dlp binary (using execFile instead of exec to avoid shell injection)
  try {
    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--no-playlist',
      '--extractor-args', 'youtube:player_client=ios,android,web',
      '--geo-bypass',
      '--no-check-certificates',
      cleanUrl
    ];

    const { stdout } = await execFilePromise(YTDLP_BIN, args, {
      maxBuffer: 1024 * 1024 * 20,
      timeout: 15000
    });

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
    console.warn('yt-dlp metadata extraction failed:', err.message);

    // YouTube OEmbed fallback for metadata only
    if (platform === 'youtube') {
      const videoIdMatch = cleanUrl.match(/(?:youtu\.be\/|watch\?v=|shorts\/)([^#\&\?]*)/);
      if (videoIdMatch && videoIdMatch[1]) {
        const vid = videoIdMatch[1];
        thumbnail = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
        try {
          const { default: axios } = await import('axios');
          const oe = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`, { timeout: 4000 });
          if (oe.data) {
            title = oe.data.title || title;
            author = oe.data.author_name || author;
            thumbnail = oe.data.thumbnail_url || thumbnail;
          }
        } catch (e) {}
      }
    }
  }

  // BUG 3 FIX: All formats correctly use format=mp4&quality=XXX
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

// BUG 1+2+5+6 FIX: Download using temp file with proper glob search and increased timeout
app.get('/api/download', async (req, res) => {
  const { url, format = 'mp4', quality = '1080' } = req.query;

  const cleanUrl = sanitizeUrl(url ? decodeURIComponent(url) : '');
  if (!cleanUrl) {
    return res.status(400).json({ error: 'URL parameter missing atau tidak valid' });
  }

  if (!ytdlpAvailable) {
    return res.status(503).send('yt-dlp engine belum siap. Coba lagi.');
  }

  const ext = format.toLowerCase();
  // Unique base name for temp file identification
  const uniqueId = `ytdl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const tempDir = os.tmpdir();

  // BUG 2 FIX: Use %(ext)s so yt-dlp writes the correct extension itself
  const outputTemplate = path.join(tempDir, `${uniqueId}.%(ext)s`);

  // Build yt-dlp args array (using execFile = no shell = no injection)
  let args = [];

  if (ext === 'mp3') {
    args = [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--extractor-args', 'youtube:player_client=ios,android,web',
      '--geo-bypass',
      '--no-check-certificates',
      '--no-playlist',
      '-o', outputTemplate,
      cleanUrl
    ];
  } else if (ext === 'flac') {
    args = [
      '-x',
      '--audio-format', 'flac',
      '--extractor-args', 'youtube:player_client=ios,android,web',
      '--geo-bypass',
      '--no-check-certificates',
      '--no-playlist',
      '-o', outputTemplate,
      cleanUrl
    ];
  } else if (ext === 'm4a') {
    args = [
      '-f', 'ba[ext=m4a]/ba',
      '--extractor-args', 'youtube:player_client=ios,android,web',
      '--geo-bypass',
      '--no-check-certificates',
      '--no-playlist',
      '-o', outputTemplate,
      cleanUrl
    ];
  } else {
    // BUG 1 FIX: Video MP4 - download to temp file (NOT stdout pipe)
    // Use "best" single-stream first (already muxed, no ffmpeg needed)
    // Fallback to separate streams that ffmpeg merges into the temp file
    args = [
      '-f', `best[ext=mp4][height<=${quality}]/bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`,
      '--merge-output-format', 'mp4',
      '--extractor-args', 'youtube:player_client=ios,android,web',
      '--geo-bypass',
      '--no-check-certificates',
      '--no-playlist',
      '-o', outputTemplate,
      cleanUrl
    ];
  }

  try {
    // BUG 5+6 FIX: Increased timeout to 180s and maxBuffer to 50MB
    await execFilePromise(YTDLP_BIN, args, {
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 50
    });

    // BUG 2 FIX: Find the actual output file by glob-searching uniqueId prefix
    const outputFile = findOutputFile(uniqueId, tempDir);

    if (outputFile && outputFile.path) {
      const actualExt = path.extname(outputFile.name).replace('.', '') || ext;
      const safeFilename = `media_download_${Date.now()}.${actualExt}`;

      let contentType = 'video/mp4';
      if (actualExt === 'mp3') contentType = 'audio/mpeg';
      else if (actualExt === 'm4a') contentType = 'audio/mp4';
      else if (actualExt === 'flac') contentType = 'audio/flac';
      else if (actualExt === 'webm') contentType = 'video/webm';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fs.statSync(outputFile.path).size);

      return res.download(outputFile.path, safeFilename, (err) => {
        cleanupTempFiles(uniqueId, tempDir);
      });
    }

    // No file found after successful exec
    cleanupTempFiles(uniqueId, tempDir);
    return res.status(500).json({ error: 'yt-dlp selesai tapi file output tidak ditemukan.' });

  } catch (dlErr) {
    console.error('yt-dlp download error:', dlErr.message);
    cleanupTempFiles(uniqueId, tempDir);
    return res.status(500).json({ error: 'Gagal mengunduh video. Pastikan URL valid dan coba lagi.' });
  }
});

// SPA Fallback Route
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Render Server with Native yt-dlp Engine running on port ${PORT}`);
});
