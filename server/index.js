import express from 'express';
import cors from 'cors';
import { execFile, spawn } from 'child_process';
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

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

const YTDLP_BIN = process.platform === 'win32' ? 'yt-dlp' : 'yt-dlp';

// Startup check
let ytdlpAvailable = false;
(async () => {
  try {
    const { stdout } = await execFilePromise(YTDLP_BIN, ['--version'], { timeout: 10000 });
    ytdlpAvailable = true;
    console.log(`yt-dlp: v${stdout.trim()}`);
  } catch (e) {
    console.error('yt-dlp not found:', e.message);
  }
})();

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const t = url.trim();
  if (!/^https?:\/\//i.test(t)) return null;
  if (/[`$;|><\\]/.test(t)) return null;
  return t;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ytdlp: ytdlpAvailable, time: new Date().toISOString() });
});

// ============================
// METADATA EXTRACTION
// ============================
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  const cleanUrl = sanitizeUrl(url);
  if (!cleanUrl) return res.status(400).json({ success: false, error: 'URL tidak valid.' });
  if (!ytdlpAvailable) return res.status(503).json({ success: false, error: 'yt-dlp belum siap.' });

  let platform = 'video';
  if (cleanUrl.includes('tiktok.com')) platform = 'tiktok';
  else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) platform = 'youtube';
  else if (cleanUrl.includes('instagram.com')) platform = 'instagram';

  let title = 'Media Video';
  let author = 'Kreator Media';
  let thumbnail = '';
  let duration = 'N/A';

  // Try yt-dlp metadata (PO Token Provider handles YouTube bot check)
  try {
    const args = [
      '--dump-single-json', '--no-warnings', '--no-playlist',
      '--geo-bypass', '--no-check-certificates',
      cleanUrl
    ];
    const { stdout } = await execFilePromise(YTDLP_BIN, args, { maxBuffer: 1024 * 1024 * 20, timeout: 20000 });
    if (stdout?.trim().startsWith('{')) {
      const info = JSON.parse(stdout);
      title = info.title || info.fulltitle || title;
      author = info.uploader || info.creator || info.channel || author;
      thumbnail = info.thumbnail || (info.thumbnails?.length ? info.thumbnails[info.thumbnails.length - 1]?.url : '') || thumbnail;
      if (info.duration) duration = `${Math.floor(info.duration / 60)}m ${info.duration % 60}s`;
    }
  } catch (err) {
    console.warn('yt-dlp metadata failed:', err.message);
    // YouTube OEmbed fallback for metadata
    if (platform === 'youtube') {
      const m = cleanUrl.match(/(?:youtu\.be\/|watch\?v=|shorts\/)([^#&?]*)/);
      if (m?.[1]) {
        const vid = m[1];
        thumbnail = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
        try {
          const { default: axios } = await import('axios');
          const oe = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`, { timeout: 3000 });
          if (oe.data) { title = oe.data.title || title; author = oe.data.author_name || author; }
        } catch (e) {}
      }
    }
  }

  const formats = [
    { id: 'f_best', quality: 'Best Available (MP4)', format: 'MP4', type: 'video', size: 'Best Quality', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=best` },
    { id: 'f_720', quality: '720p HD (MP4)', format: 'MP4', type: 'video', size: '720p HD', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=720` },
    { id: 'f_480', quality: '480p SD (MP4)', format: 'MP4', type: 'video', size: '480p SD', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=480` },
    { id: 'f_mp3', quality: 'Audio MP3 (320kbps)', format: 'MP3', type: 'audio', size: '320kbps', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp3` },
    { id: 'f_m4a', quality: 'Audio M4A (Original)', format: 'M4A', type: 'audio', size: 'AAC Audio', url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=m4a` },
  ];

  return res.json({ success: true, platform, data: { title, author, authorAvatar: '', thumbnail, duration, previewUrl: '', formats } });
});

// ============================
// DOWNLOAD - Temp file + send
// ============================
app.get('/api/download', async (req, res) => {
  const { url, format = 'mp4', quality = 'best' } = req.query;
  const cleanUrl = sanitizeUrl(url ? decodeURIComponent(url) : '');
  if (!cleanUrl) return res.status(400).send('URL tidak valid');
  if (!ytdlpAvailable) return res.status(503).send('yt-dlp belum siap');

  const ext = format.toLowerCase();
  const uid = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const tmpDir = os.tmpdir();
  const outTemplate = path.join(tmpDir, `${uid}.%(ext)s`);

  // Build yt-dlp args
  let args = [];
  if (ext === 'mp3') {
    args = ['-x', '--audio-format', 'mp3', '--audio-quality', '0'];
  } else if (ext === 'm4a') {
    args = ['-f', 'ba[ext=m4a]/ba'];
  } else {
    // Video: prefer pre-muxed single stream for speed, fallback to merge
    if (quality === 'best') {
      args = ['-f', 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best', '--merge-output-format', 'mp4'];
    } else {
      args = ['-f', `best[ext=mp4][height<=${quality}]/bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}]/best`, '--merge-output-format', 'mp4'];
    }
  }

  args.push(
    '--geo-bypass', '--no-check-certificates', '--no-playlist',
    '-o', outTemplate,
    cleanUrl
  );

  try {
    // Download with generous timeout (3 minutes for large videos)
    await execFilePromise(YTDLP_BIN, args, { timeout: 180000, maxBuffer: 1024 * 1024 * 50 });

    // Find the output file (yt-dlp may change extension)
    const outputFiles = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith(uid))
      .map(f => ({ name: f, full: path.join(tmpDir, f), size: fs.statSync(path.join(tmpDir, f)).size }))
      .filter(f => f.size > 0)
      .sort((a, b) => b.size - a.size);

    if (outputFiles.length === 0) {
      return res.status(500).json({ error: 'Download selesai tapi file tidak ditemukan.' });
    }

    const file = outputFiles[0];
    const actualExt = path.extname(file.name).replace('.', '') || ext;
    const safeFilename = `download_${Date.now()}.${actualExt}`;

    let contentType = 'video/mp4';
    if (actualExt === 'mp3') contentType = 'audio/mpeg';
    else if (actualExt === 'm4a') contentType = 'audio/mp4';
    else if (actualExt === 'webm') contentType = 'video/webm';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

    const stream = fs.createReadStream(file.full);
    stream.pipe(res);
    stream.on('end', () => cleanup(uid, tmpDir));
    stream.on('error', () => cleanup(uid, tmpDir));

  } catch (err) {
    console.error('Download error:', err.message);
    cleanup(uid, tmpDir);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download gagal: ' + (err.message || 'Unknown error') });
    }
  }
});

function cleanup(uid, dir) {
  try {
    fs.readdirSync(dir).filter(f => f.startsWith(uid)).forEach(f => {
      try { fs.unlinkSync(path.join(dir, f)); } catch (e) {}
    });
  } catch (e) {}
}

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
