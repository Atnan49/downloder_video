import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files if built
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// User Agent Helper
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', engine: 'yt-dlp + ffmpeg', time: new Date().toISOString() });
});

// Extract Video Info Endpoint using yt-dlp
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL tidak valid atau kosong' });
  }

  const cleanUrl = url.trim();

  try {
    // Run yt-dlp to get JSON metadata
    const cmd = `yt-dlp --dump-json --no-warnings --user-agent "${USER_AGENT}" "${cleanUrl}"`;
    const { stdout } = await execPromise(cmd, { maxBuffer: 1024 * 1024 * 10 });
    
    const info = JSON.parse(stdout);

    // Detect Platform
    let platform = 'video';
    if (cleanUrl.includes('tiktok.com')) platform = 'tiktok';
    else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) platform = 'youtube';
    else if (cleanUrl.includes('instagram.com')) platform = 'instagram';

    // Parse formats
    const formats = [];

    // Video Formats (1080p, 720p, 480p)
    formats.push({
      id: 'f_1080',
      quality: '1080p Full HD Video (H.264 MP4)',
      format: 'MP4',
      type: 'video',
      size: '1080p Full HD',
      url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=1080`
    });

    formats.push({
      id: 'f_720',
      quality: '720p HD Video (H.264 MP4)',
      format: 'MP4',
      type: 'video',
      size: '720p HD',
      url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp4&quality=720`
    });

    // Audio Formats (MP3, M4A, FLAC)
    formats.push({
      id: 'f_mp3',
      quality: 'Audio Only (MP3 320kbps)',
      format: 'MP3',
      type: 'audio',
      size: '320kbps Audio',
      url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=mp3`
    });

    formats.push({
      id: 'f_flac',
      quality: 'Audio Only (FLAC Lossless)',
      format: 'FLAC',
      type: 'audio',
      size: 'Lossless Audio',
      url: `/api/download?url=${encodeURIComponent(cleanUrl)}&format=flac`
    });

    return res.json({
      success: true,
      platform,
      data: {
        title: info.title || info.fulltitle || 'Media Video',
        author: info.uploader || info.creator || info.channel || 'Kreator Media',
        authorAvatar: info.uploader_avatar || '',
        thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails[0]?.url) || '',
        duration: info.duration ? `${Math.floor(info.duration / 60)}m ${info.duration % 60}s` : 'N/A',
        previewUrl: info.url || '',
        formats
      }
    });

  } catch (error) {
    console.error('yt-dlp extraction error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Gagal mengekstrak metadata dari video via yt-dlp engine. Periksa tautan kembali.'
    });
  }
});

// Stream Download Endpoint using yt-dlp & ffmpeg
app.get('/api/download', (req, res) => {
  const { url, format = 'mp4', quality = '1080' } = req.query;

  if (!url) {
    return res.status(400).send('URL missing');
  }

  const cleanUrl = decodeURIComponent(url);
  const ext = format.toLowerCase();
  const filename = `download_${Date.now()}.${ext}`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  if (ext === 'mp3') {
    res.setHeader('Content-Type', 'audio/mpeg');
    const cmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 --user-agent "${USER_AGENT}" -o - "${cleanUrl}"`;
    const child = exec(cmd);
    child.stdout.pipe(res);
  } else if (ext === 'flac') {
    res.setHeader('Content-Type', 'audio/flac');
    const cmd = `yt-dlp -x --audio-format flac --user-agent "${USER_AGENT}" -o - "${cleanUrl}"`;
    const child = exec(cmd);
    child.stdout.pipe(res);
  } else {
    res.setHeader('Content-Type', 'video/mp4');
    const cmd = `yt-dlp -f "bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --recode-video mp4 --user-agent "${USER_AGENT}" -o - "${cleanUrl}"`;
    const child = exec(cmd);
    child.stdout.pipe(res);
  }
});

// SPA Fallback Route
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server yt-dlp + Express running on port ${PORT}`);
});
